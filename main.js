const { app, BrowserWindow, Menu, shell, session } = require('electron');
const updater = require('./updater');

const HOME_URL = 'https://mail.langgenius.ai/';

// Hosts that must stay inside the app window (Flux itself + login flow).
const INTERNAL_HOSTS = [
  'mail.langgenius.ai',
  'langgenius.cloudflareaccess.com',
  'accounts.google.com',
  'accounts.youtube.com',
];
const isInternal = (url) => {
  try {
    const host = new URL(url).hostname;
    return INTERNAL_HOSTS.some((h) => host === h || host.endsWith('.' + h)) ||
      host.endsWith('.cloudflareaccess.com') || host.endsWith('.google.com');
  } catch {
    return false;
  }
};

// Google refuses sign-in from embedded browsers whose UA mentions Electron,
// so present a plain Chrome user agent.
const CHROME_UA =
  `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ` +
  `(KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;
app.userAgentFallback = CHROME_UA;

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Flux',
    show: false,
    webPreferences: {
      partition: 'persist:flux', // keep login cookies between launches
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.loadURL(HOME_URL);

  // Links that open new windows: keep login popups in-app, send the rest to the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternal(url)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!isInternal(url)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  // Hide instead of quit when the red close button is clicked (macOS convention).
  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });
}

function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { label: '检查更新…', click: () => updater.checkForUpdates() },
        {
          label: '自动检查更新',
          type: 'checkbox',
          checked: updater.isAutoCheckEnabled(),
          click: (item) => updater.setAutoCheckEnabled(item.checked),
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Home', accelerator: 'CmdOrCtrl+Shift+H', click: () => win && win.loadURL(HOME_URL) },
        { label: 'Back', accelerator: 'CmdOrCtrl+[', click: () => win && win.webContents.navigationHistory.goBack() },
        { label: 'Forward', accelerator: 'CmdOrCtrl+]', click: () => win && win.webContents.navigationHistory.goForward() },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { win.show(); win.focus(); }
  });

  app.whenReady().then(() => {
    session.fromPartition('persist:flux').setUserAgent(CHROME_UA);
    buildMenu();
    createWindow();
    updater.startAutomaticChecks();
  });

  app.on('activate', () => {
    if (win) win.show(); else createWindow();
  });
  app.on('before-quit', () => { app.isQuitting = true; });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
