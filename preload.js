// Preload for the Flux window: reads the sidebar groups (name + unread badge) and
// reports them to the main process, which decides whether to show a notification.
// Runs sandboxed, so it can only require('electron').
const { ipcRenderer } = require('electron');

const SHARED_HEADERS = ['已共享', 'Shared'];
const IGNORED_NAMES = ['更多', 'More'];
const CANDIDATES = 'a[href], [role="link"], [role="treeitem"], [role="menuitem"], [role="option"], button, li';

function textLines(el) {
  return (el.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean);
}

/** Sidebar entries: one or two lines of text ("Support" + optional "8") in the left column. */
function sidebarItems() {
  const maxX = Math.min(window.innerWidth * 0.45, 380);
  const header = Array.from(document.querySelectorAll('body *')).find(
    (e) => e.children.length === 0 && SHARED_HEADERS.includes((e.textContent || '').trim()),
  );
  const items = [];
  const seen = new Set();
  for (const el of document.querySelectorAll(CANDIDATES)) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.right > maxX || r.width < 100 || r.height > 80) continue;
    const lines = textLines(el);
    if (lines.length < 1 || lines.length > 2) continue;
    let name = lines[0];
    let count = 0;
    if (lines.length === 2) {
      if (!/^\d+$/.test(lines[1])) continue;
      count = Number(lines[1]);
    } else {
      const m = name.match(/^(.*\S)\s+(\d+)$/);
      if (m) { name = m[1]; count = Number(m[2]); }
    }
    if (/^\d+$/.test(name) || name.length > 60 || IGNORED_NAMES.includes(name) || seen.has(name)) continue;
    seen.add(name);
    const shared = !!header && !!(header.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
    items.push({ name, count, shared, el });
  }
  return items;
}

let lastSent = '';
function scan() {
  try {
    const groups = sidebarItems().map(({ name, count, shared }) => ({ name, count, shared }));
    if (!groups.length) return;
    const payload = JSON.stringify(groups);
    if (payload === lastSent) return;
    lastSent = payload;
    ipcRenderer.send('flux:groups', groups);
  } catch (e) {
    console.error('flux group scan failed', e);
  }
}

let timer = null;
function scheduleScan() {
  if (timer) return;
  timer = setTimeout(() => { timer = null; scan(); }, 1500);
}

function start() {
  new MutationObserver(scheduleScan).observe(document.body, { subtree: true, childList: true, characterData: true });
  setInterval(scan, 20 * 1000);
  scheduleScan();
}

// Clicking a notification opens that group.
ipcRenderer.on('flux:open-group', (_event, name) => {
  const item = sidebarItems().find((g) => g.name === name);
  if (!item) return;
  const target = item.el.matches('a[href], [role="link"], button')
    ? item.el
    : item.el.querySelector('a[href], [role="link"], button') || item.el;
  target.click();
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
