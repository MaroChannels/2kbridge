const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bridge', {
  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close:    () => ipcRenderer.send('window:close'),

  // Config
  configGet:    (key)        => ipcRenderer.invoke('config:get', key),
  configSet:    (key, value) => ipcRenderer.invoke('config:set', key, value),
  configDelete: (key)        => ipcRenderer.invoke('config:delete', key),

  // Screen capture sources
  getCaptureSources: () => ipcRenderer.invoke('capture:getSources'),

  // Game launcher
  launchGame: (gamePath) => ipcRenderer.invoke('game:launch', gamePath),

  // Input simulation (host side)
  sendKeyboard: (data) => ipcRenderer.send('input:keyboard', data),
  sendMouse:    (data) => ipcRenderer.send('input:mouse', data),
  sendGamepad:  (state) => ipcRenderer.send('input:gamepad', state),
  isInputAvailable: () => ipcRenderer.invoke('input:isAvailable'),

  // Mod installer
  installMod: (opts) => ipcRenderer.invoke('mod:install', opts),

  // Game installer
  choosePath:      ()     => ipcRenderer.invoke('game:choosePath'),
  downloadGame:    (opts) => ipcRenderer.invoke('game:download', opts),
  onGameProgress:  (cb)   => ipcRenderer.on('game:progress', (_e, data) => cb(data)),
  offGameProgress: ()     => ipcRenderer.removeAllListeners('game:progress'),
});
