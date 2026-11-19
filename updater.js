// In-app updater based on GitHub Releases (same flow as SimpleShot's Updater.swift):
// check → download DMG → verify bundle id / version / signing certificate → replace & relaunch.
const { app, dialog, shell, net, BrowserWindow } = require('electron');
const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Readable, Transform } = require('stream');
const u = require('./update-utils');

const execFileP = promisify(execFile);

const REPO = 'david-yang-pixel/flux-desktop';
const APP_NAME = 'Flux';
const CHECK_INTERVAL_MS = 24 * 3600 * 1000;

let isChecking = false;
let isInstalling = false;
let progressWin = null;

// ---------------------------------------------------------------- settings
const settingsFile = () => path.join(app.getPath('userData'), 'update-settings.json');
function loadSettings() {
  try {
    return { autoCheck: true, lastCheck: 0, skippedVersion: null, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) };
  } catch {
    return { autoCheck: true, lastCheck: 0, skippedVersion: null };
  }
}
function saveSettings(patch) {
  const s = { ...loadSettings(), ...patch };
  try { fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2)); } catch (e) { console.error(e); }
  return s;
}
const isAutoCheckEnabled = () => loadSettings().autoCheck;
const setAutoCheckEnabled = (on) => saveSettings({ autoCheck: !!on });

// ---------------------------------------------------------------- checking
/** 10 s after launch, then every hour see whether 24 h have passed since the last check. */
function startAutomaticChecks() {
  if (!app.isPackaged) return;
  const tick = () => {
    const s = loadSettings();
    if (s.autoCheck && Date.now() - s.lastCheck > CHECK_INTERVAL_MS) check(false);
  };
  setTimeout(tick, 10 * 1000);
  setInterval(tick, 3600 * 1000);
}

function checkForUpdates() {
  if (!app.isPackaged) {
    showAlert('开发模式下不检查更新', `当前版本 ${app.getVersion()}`);
    return;
  }
  check(true);
}

async function check(userInitiated) {
  if (isChecking || isInstalling) return;
  isChecking = true;
  try {
    const release = await fetchLatestRelease();
    saveSettings({ lastCheck: Date.now() });
    if (u.compareVersions(release.version, app.getVersion()) <= 0) {
      if (userInitiated) await showAlert('已是最新版本', `当前版本 ${app.getVersion()} 已是最新。`);
      return;
    }
    if (!userInitiated && loadSettings().skippedVersion === release.version) return;
    await promptUpdate(release);
  } catch (e) {
    console.error('update check failed:', e);
    if (userInitiated) await showAlert('检查更新失败', e.message || String(e));
  } finally {
    isChecking = false;
  }
}

async function fetchLatestRelease() {
  let res;
  try {
    res = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': `${APP_NAME}/${app.getVersion()}` },
    });
  } catch (e) {
    throw new Error(`无法连接 GitHub（${e.message}）`);
  }
  if (res.status !== 200) throw new Error(`无法连接 GitHub（HTTP ${res.status}）`);
  const release = u.parseRelease(await res.json(), process.arch);
  if (!release) throw new Error('新版本中没有找到适合本机的安装包');
  return release;
}

// ---------------------------------------------------------------- prompting
async function promptUpdate(release) {
  let notes = release.notes;
  if (notes.length > 800) notes = notes.slice(0, 800) + '…';
  const { response } = await dialog.showMessageBox({
    type: 'info',
    message: `发现新版本 ${APP_NAME} ${release.version}`,
    detail: `当前版本 ${app.getVersion()}。` + (notes ? `\n\n${notes}` : ''),
    buttons: ['立即更新', '稍后', '跳过此版本'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) await install(release);
  else if (response === 2) saveSettings({ skippedVersion: release.version });
}

// ---------------------------------------------------------------- installing
async function currentRequirement(appPath) {
  try {
    // codesign prints the requirement on stdout or stderr depending on macOS version
    const { stdout, stderr } = await execFileP('/usr/bin/codesign', ['-d', '-r-', appPath]);
    return u.parseDesignatedRequirement(`${stdout}\n${stderr}`);
  } catch {
    return null;
  }
}

/** Reasons the app can't be replaced in place (mirrors SimpleShot). */
async function installProblem(appPath) {
  if (!appPath) return `当前不是以 ${APP_NAME}.app 方式运行。`;
  if (appPath.includes('/AppTranslocation/') || appPath.startsWith('/Volumes/')) {
    return `请先把 ${APP_NAME} 拖到「应用程序」文件夹，再从那里打开。`;
  }
  try {
    fs.accessSync(path.dirname(appPath), fs.constants.W_OK);
  } catch {
    return `没有权限替换 ${appPath}。`;
  }
  if (u.isAdHocRequirement(await currentRequirement(appPath))) {
    return '当前版本使用临时签名，无法自动更新。手动安装一次新版本后，以后即可在应用内直接更新。';
  }
  return null;
}

async function install(release) {
  if (isInstalling) return;
  const appPath = u.appBundlePath(process.execPath);
  const problem = await installProblem(appPath);
  if (problem) return offerManualDownload(release, problem);

  isInstalling = true;
  const work = fs.mkdtempSync(path.join(os.tmpdir(), `${APP_NAME}Update-`));
  try {
    showProgress(`正在下载 ${APP_NAME} ${release.version}…`);
    const dmg = path.join(work, 'update.dmg');
    await download(release.dmgURL, dmg, (pct) => setProgress(`正在下载 ${APP_NAME} ${release.version}… ${pct}%`));

    setProgress('正在校验安装包…');
    const staged = await extractApp(dmg, work);
    await verify(staged, appPath, release.version);

    setProgress(`正在安装，${APP_NAME} 将自动重新打开…`);
    launchInstaller(staged, appPath, work);
    setTimeout(() => {
      app.isQuitting = true;
      app.quit();
    }, 300);
  } catch (e) {
    isInstalling = false;
    hideProgress();
    fs.rmSync(work, { recursive: true, force: true });
    await offerManualDownload(release, e.message || String(e));
  }
}

async function download(url, dest, onProgress) {
  const res = await net.fetch(url, { headers: { 'User-Agent': `${APP_NAME}/${app.getVersion()}` } });
  if (res.status !== 200 || !res.body) throw new Error('下载失败');
  const total = Number(res.headers.get('content-length')) || 0;
  let received = 0;
  let lastPct = -1;
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      received += chunk.length;
      const pct = total ? Math.floor((received / total) * 100) : 0;
      if (pct !== lastPct) { lastPct = pct; onProgress(pct); }
      cb(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(res.body), counter, fs.createWriteStream(dest));
  if (total && received !== total) throw new Error('下载失败（文件不完整）');
}

async function extractApp(dmg, work) {
  const mount = path.join(work, 'mnt');
  fs.mkdirSync(mount);
  try {
    await execFileP('/usr/bin/hdiutil', ['attach', dmg, '-nobrowse', '-readonly', '-noautoopen', '-mountpoint', mount]);
  } catch {
    throw new Error('无法打开下载的安装包');
  }
  try {
    const source = path.join(mount, `${APP_NAME}.app`);
    if (!fs.existsSync(source)) throw new Error(`安装包中没有找到 ${APP_NAME}.app`);
    const staged = path.join(work, `${APP_NAME}.app`);
    try {
      await execFileP('/usr/bin/ditto', [source, staged]);
    } catch {
      throw new Error('安装失败：复制安装包失败');
    }
    return staged;
  } finally {
    await execFileP('/usr/bin/hdiutil', ['detach', mount, '-force']).catch(() => {});
  }
}

async function plistValue(appPath, key) {
  const { stdout } = await execFileP('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', path.join(appPath, 'Contents', 'Info.plist')]);
  return stdout.trim();
}

/** Bundle id + version must match, and the signature must satisfy the running app's designated requirement. */
async function verify(staged, currentApp, expectedVersion) {
  try {
    const [id, curId, ver] = await Promise.all([
      plistValue(staged, 'CFBundleIdentifier'),
      plistValue(currentApp, 'CFBundleIdentifier'),
      plistValue(staged, 'CFBundleShortVersionString'),
    ]);
    if (id !== curId || ver !== expectedVersion) throw new Error();
  } catch {
    throw new Error('安装包的版本或标识不正确');
  }
  const req = await currentRequirement(currentApp);
  if (u.isAdHocRequirement(req)) throw new Error('安装包签名校验失败（与当前版本的签名证书不一致）');
  try {
    await execFileP('/usr/bin/codesign', ['--verify', '--deep', '--strict', '-R', `=${req}`, staged]);
  } catch {
    throw new Error('安装包签名校验失败（与当前版本的签名证书不一致）');
  }
}

/** Small script: wait for this process to exit → swap the app → reopen it. */
function launchInstaller(staged, target, work) {
  const script = `#!/bin/sh
PID="$1"; SRC="$2"; DST="$3"; WORK="$4"
i=0
while kill -0 "$PID" 2>/dev/null && [ $i -lt 300 ]; do sleep 0.1; i=$((i+1)); done
rm -rf "$DST.old"
if mv "$DST" "$DST.old"; then
    if ditto "$SRC" "$DST"; then
        rm -rf "$DST.old"
    else
        rm -rf "$DST"; mv "$DST.old" "$DST"
    fi
fi
xattr -dr com.apple.quarantine "$DST" 2>/dev/null
touch "$DST"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$DST" 2>/dev/null
open "$DST"
rm -rf "$WORK"
`;
  const scriptPath = path.join(work, 'install.sh');
  fs.writeFileSync(scriptPath, script, { mode: 0o755 });
  spawn('/bin/sh', [scriptPath, String(process.pid), staged, target, work], {
    detached: true,
    stdio: 'ignore',
  }).unref();
}

// ---------------------------------------------------------------- UI
async function offerManualDownload(release, reason) {
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    message: '无法自动更新',
    detail: `${reason}\n\n可以前往下载页面手动安装 ${release.version}。`,
    buttons: ['打开下载页面', '取消'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) shell.openExternal(release.pageURL);
}

function showAlert(message, detail) {
  return dialog.showMessageBox({ type: 'info', message, detail, buttons: ['好'] });
}

function showProgress(text) {
  hideProgress();
  progressWin = new BrowserWindow({
    width: 380, height: 110, resizable: false, minimizable: false, maximizable: false,
    fullscreenable: false, closable: false, title: `${APP_NAME} 更新`, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;gap:10px;font:13px -apple-system,sans-serif;background:#fff;color:#222"><div style="width:14px;height:14px;border:2px solid #ccc;border-top-color:#1f4ef5;border-radius:50%;animation:s 0.8s linear infinite"></div><span id="t"></span><style>@keyframes s{to{transform:rotate(360deg)}}</style></body>`;
  progressWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  progressWin.webContents.once('did-finish-load', () => {
    setProgress(text);
    if (progressWin) progressWin.show();
  });
}

function setProgress(text) {
  if (progressWin && !progressWin.isDestroyed()) {
    progressWin.webContents.executeJavaScript(`document.getElementById('t').textContent = ${JSON.stringify(text)}`).catch(() => {});
  }
}

function hideProgress() {
  if (progressWin && !progressWin.isDestroyed()) {
    progressWin.setClosable(true);
    progressWin.destroy();
  }
  progressWin = null;
}

module.exports = { startAutomaticChecks, checkForUpdates, isAutoCheckEnabled, setAutoCheckEnabled };
