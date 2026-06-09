const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  captureScreen: (region) => ipcRenderer.invoke('capture-screen', region),
  getDisplays: () => ipcRenderer.invoke('get-displays')
})