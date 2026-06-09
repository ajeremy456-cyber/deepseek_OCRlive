const { app, BrowserWindow, ipcMain, desktopCapturer, screen } = require('electron')
const path = require('path')

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 850,
    minWidth: 900,
    minHeight: 650,
    title: 'SCRCPY OCR 直播監控',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.loadFile('renderer/index.html')
  mainWindow.setMenuBarVisibility(false)

  // 開發時可開 DevTools
  // mainWindow.webContents.openDevTools()
}

// === IPC: 擷取螢幕畫面 ===
ipcMain.handle('capture-screen', async (event, { x, y, width, height }) => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: screen.getPrimaryDisplay().workAreaSize
    })

    if (sources.length === 0) {
      return { success: false, error: '找不到畫面來源' }
    }

    const source = sources[0]
    const fullImage = source.thumbnail

    // 裁剪指定範圍
    const cropWidth = width || fullImage.getSize().width
    const cropHeight = height || fullImage.getSize().height

    // 建立 canvas 裁剪
    const { nativeImage } = require('electron')
    const cropped = nativeImage.createFromBuffer(
      fullImage.toPNG(),
      { width: fullImage.getSize().width, height: fullImage.getSize().height }
    )

    // 用 crop 方法
    const result = cropped.crop({ x: Math.round(x || 0), y: Math.round(y || 0), width: Math.round(cropWidth), height: Math.round(cropHeight) })
    const base64 = result.toDataURL()

    return { success: true, image: base64 }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// === IPC: 取得所有螢幕資訊 ===
ipcMain.handle('get-displays', async () => {
  const displays = screen.getAllDisplays()
  return displays.map(d => ({
    id: d.id,
    bounds: d.bounds,
    workArea: d.workArea,
    scaleFactor: d.scaleFactor,
    isPrimary: d.id === screen.getPrimaryDisplay().id
  }))
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})