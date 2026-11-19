// Group notifications: the preload reports sidebar groups and their unread counts;
// when an enabled group's count goes up while Flux isn't in front, show a macOS notification.
const { app, ipcMain, Notification } = require('electron');
const fs = require('fs');
const path = require('path');
const n = require('./notify-utils');

let settings = { enabled: true, groups: {} };
let groups = [];
let prevCounts = null;
let getWindow = () => null;
let onGroupsChanged = () => {};
const live = new Set(); // keep notifications referenced until they're handled

const settingsFile = () => path.join(app.getPath('userData'), 'notify-settings.json');

function load() {
  try {
    const s = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    settings = { enabled: s.enabled !== false, groups: s.groups || {} };
  } catch {
    settings = { enabled: true, groups: {} };
  }
}

function save() {
  try { fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); } catch (e) { console.error(e); }
}

function init(opts) {
  getWindow = opts.getWindow;
  onGroupsChanged = opts.onGroupsChanged;
  load();
  ipcMain.on('flux:groups', (event, list) => {
    const win = getWindow();
    if (!win || event.sender !== win.webContents) return;
    handleGroups(n.normalizeGroups(list));
  });
}

function handleGroups(list) {
  if (!list.length) return;
  const merged = n.mergeGroupSettings(settings, list);
  settings = merged.settings;
  if (merged.changed) save();

  const namesChanged = list.map((g) => `${g.name}|${g.shared}`).join('\n') !==
    groups.map((g) => `${g.name}|${g.shared}`).join('\n');
  groups = list;

  const win = getWindow();
  const inFront = win && win.isVisible() && win.isFocused();
  if (!inFront) n.newMailNotifications(prevCounts, list, settings).forEach(show);
  prevCounts = n.updateCounts(prevCounts, list);

  if (namesChanged) onGroupsChanged();
}

function show({ name, delta, count }) {
  if (!Notification.isSupported()) return;
  const note = new Notification({
    title: `Flux · ${name}`,
    body: `新增 ${delta} 封，共 ${count} 封`,
  });
  live.add(note);
  const done = () => live.delete(note);
  note.on('click', () => {
    done();
    const win = getWindow();
    if (!win) return;
    win.show();
    win.focus();
    win.webContents.send('flux:open-group', name);
  });
  note.on('close', done);
  note.show();
}

function setGroup(name, on) {
  settings.groups[name] = on;
  save();
}

function setAll(on) {
  for (const g of groups) settings.groups[g.name] = on;
  save();
  onGroupsChanged();
}

function testNotification() {
  if (!Notification.isSupported()) return;
  const note = new Notification({ title: 'Flux', body: '这是一条测试通知。能看到说明通知正常。' });
  live.add(note);
  note.on('close', () => live.delete(note));
  note.on('click', () => live.delete(note));
  note.show();
}

/** The 「通知」 menu: master switch + one checkbox per sidebar group. */
function menuTemplate() {
  const item = (g) => ({
    label: g.name,
    type: 'checkbox',
    checked: !!settings.groups[g.name],
    enabled: settings.enabled,
    click: (mi) => setGroup(g.name, mi.checked),
  });
  const own = groups.filter((g) => !g.shared);
  const shared = groups.filter((g) => g.shared);
  const submenu = [
    {
      label: '启用通知',
      type: 'checkbox',
      checked: settings.enabled,
      click: (mi) => { settings.enabled = mi.checked; save(); onGroupsChanged(); },
    },
    { type: 'separator' },
  ];
  if (!groups.length) {
    submenu.push({ label: '（登录并打开收件箱后显示分组）', enabled: false });
  } else {
    submenu.push({ label: '接收以下分组的新邮件通知：', enabled: false }, ...own.map(item));
    if (shared.length) submenu.push({ type: 'separator' }, { label: '已共享', enabled: false }, ...shared.map(item));
    submenu.push(
      { type: 'separator' },
      { label: '全部选择', enabled: settings.enabled, click: () => setAll(true) },
      { label: '全部取消', enabled: settings.enabled, click: () => setAll(false) },
    );
  }
  submenu.push({ type: 'separator' }, { label: '发送测试通知', click: testNotification });
  return { label: '通知', submenu };
}

module.exports = { init, menuTemplate };
