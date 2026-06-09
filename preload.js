const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  captureFullscreen: () => ipcRenderer.invoke('capture-fullscreen'),
  captureRegion: (region) => ipcRenderer.invoke('capture-region', region),
  getDisplayInfo: () => ipcRenderer.invoke('get-display-info')
})