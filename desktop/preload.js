// Runs inside the app's window, before the page. It gives the web app a small, safe set of desktop abilities.
// The web app cannot use Node or the computer's files; it can only call these.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tacDesktop', {
  isDesktop: true,
  platform: process.platform,
  /** 'link' = the small welcome/linking window, 'main' = the big app window */
  setMode: (mode) => ipcRenderer.send('tac:set-mode', mode),
  /** unread count for the dock / taskbar */
  setBadge: (count) => ipcRenderer.send('tac:badge', Number(count) || 0),
  /** flash the taskbar / bounce the dock when something new arrives while the window is in the background */
  attention: () => ipcRenderer.send('tac:attention'),
  version: () => ipcRenderer.invoke('tac:version'),
});
