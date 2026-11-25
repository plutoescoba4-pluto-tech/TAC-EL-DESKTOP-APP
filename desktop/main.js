/**
 * TAC-EL desktop app (Electron).
 *
 * It opens the hosted church app in its own window. Two window shapes, like WhatsApp for desktop:
 *   "link"  a medium window with the welcome / "scan with your phone" page (until you are signed in)
 *   "main"  the full app window (after you are linked), remembering its size and position
 * The web app tells this program which one it needs (through preload.js).
 *
 * Settings: config.json  ->  { "appUrl": "https://your-app.netlify.app" }
 *           npm run dev  ->  uses http://localhost:3000 (start the web app first with "npm run dev" in the parent folder)
 */
const { app, BrowserWindow, Menu, Tray, shell, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');

const DEV = process.argv.includes('--dev');

function readConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')); } catch { return {}; }
}
const configured = String(process.env.TAC_APP_URL || readConfig().appUrl || '').trim();
const APP_URL = (DEV ? 'http://localhost:3000' : configured).replace(/\/+$/, '');
const APP_URL_IS_SET = /^https?:\/\//i.test(APP_URL) && !/YOUR-APP/i.test(APP_URL);

const LINK_SIZE = { width: 1000, height: 660 };
const MAIN_DEFAULT = { width: 1280, height: 820 };
const MAIN_MIN = { width: 900, height: 600 };

let win = null;
let tray = null;
let quitting = false;
let mode = 'link';

// ---- remembers the last mode and the big window's size/position ----------------------------
const statePath = () => path.join(app.getPath('userData'), 'window-state.json');
function loadState() { try { return JSON.parse(fs.readFileSync(statePath(), 'utf8')); } catch { return {}; } }
function saveState(patch) {
  try { fs.writeFileSync(statePath(), JSON.stringify({ ...loadState(), ...patch })); } catch { /* not critical */ }
}
function rememberMainBounds() {
  if (!win || win.isDestroyed() || mode !== 'main') return;
  saveState({ main: { ...win.getNormalBounds(), maximized: win.isMaximized() } });
}

// ---- window shapes ----------------------------------------------------------------------------
function applyMode(next) {
  if (!win || win.isDestroyed()) return;
  if (mode === 'main' && next === 'link') rememberMainBounds();
  mode = next;
  saveState({ mode });
  if (next === 'link') {
    win.setMinimumSize(0, 0);
    win.unmaximize();
    win.setResizable(true);
    win.setSize(LINK_SIZE.width, LINK_SIZE.height);
    win.setResizable(false);
    win.setMaximizable(false);
    win.center();
  } else {
    const saved = loadState().main;
    win.setResizable(true);
    win.setMaximizable(true);
    win.setMinimumSize(MAIN_MIN.width, MAIN_MIN.height);
    if (saved && saved.width) {
      win.setBounds({ x: saved.x, y: saved.y, width: saved.width, height: saved.height });
      if (saved.maximized) win.maximize();
    } else {
      win.setSize(MAIN_DEFAULT.width, MAIN_DEFAULT.height);
      win.center();
    }
  }
}

const isAppOrigin = (url) => {
  try { return new URL(url).origin === new URL(APP_URL).origin; } catch { return false; }
};
const isWebLink = (url) => /^https?:\/\//i.test(url);

function createWindow() {
  mode = loadState().mode === 'main' ? 'main' : 'link';
  win = new BrowserWindow({
    width: mode === 'link' ? LINK_SIZE.width : MAIN_DEFAULT.width,
    height: mode === 'link' ? LINK_SIZE.height : MAIN_DEFAULT.height,
    show: false,
    backgroundColor: '#0D2660',
    title: 'TAC-EL',
    icon: path.join(__dirname, 'build', 'tray.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });
  applyMode(mode);
  win.once('ready-to-show', () => win.show());

  // Links to other websites open in the normal browser, never inside this window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAppOrigin(url)) return { action: 'allow' };
    if (isWebLink(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (isAppOrigin(url) || url.startsWith('file:')) return;
    event.preventDefault();
    if (isWebLink(url)) shell.openExternal(url);
  });

  // Offline or the address is wrong: a friendly page with a Try again button.
  win.webContents.on('did-fail-load', (_e, code, _desc, _url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;     // -3 = a normal cancel
    win.loadFile(path.join(__dirname, 'offline.html'), { query: { retry: APP_URL_IS_SET ? APP_URL : '' } });
  });

  win.on('resize', rememberMainBounds);
  win.on('move', rememberMainBounds);
  win.on('close', (event) => {
    // Like WhatsApp: closing the big window keeps the app running in the tray so alerts still arrive.
    if (!quitting && mode === 'main' && tray) {
      event.preventDefault();
      win.hide();
    }
  });

  if (APP_URL_IS_SET) win.loadURL(APP_URL);
  else win.loadFile(path.join(__dirname, 'offline.html'), { query: { retry: '' } });
}

function showWindow() {
  if (!win || win.isDestroyed()) { createWindow(); return; }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createTray() {
  if (process.platform === 'darwin') return;     // the dock does this job on a Mac
  try {
    tray = new Tray(path.join(__dirname, 'build', 'tray.png'));
    tray.setToolTip('TAC-EL');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open TAC-EL', click: showWindow },
      { type: 'separator' },
      { label: 'Quit', click: () => { quitting = true; app.quit(); } },
    ]));
    tray.on('click', showWindow);
  } catch { tray = null; }
}

function buildMenu() {
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }] },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---- only one copy at a time ---------------------------------------------------------------------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);

  app.whenReady().then(() => {
    app.setAppUserModelId('org.tacel.desktop');   // needed for Windows notifications to carry the app name

    // The app may use notifications, the microphone (voice rooms), the clipboard and full screen. Nothing else.
    session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
      const allowed = ['notifications', 'media', 'clipboard-sanitized-write', 'fullscreen'].includes(permission);
      callback(allowed && isAppOrigin(details.requestingUrl || wc.getURL()));
    });

    ipcMain.on('tac:set-mode', (_e, next) => { if (next === 'link' || next === 'main') applyMode(next); });
    ipcMain.on('tac:badge', (_e, count) => {
      try { app.setBadgeCount(Math.max(0, count | 0)); } catch { /* not supported everywhere */ }
    });
    ipcMain.on('tac:attention', () => {
      if (!win || win.isDestroyed() || win.isFocused()) return;
      if (process.platform === 'darwin') app.dock?.bounce();
      else win.flashFrame(true);
    });
    ipcMain.handle('tac:version', () => app.getVersion());

    buildMenu();
    createWindow();
    createTray();

    app.on('activate', showWindow);                // clicking the dock icon on a Mac
  });

  app.on('before-quit', () => { quitting = true; rememberMainBounds(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin' && !tray) app.quit(); });
}
