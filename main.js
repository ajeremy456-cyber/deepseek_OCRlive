const { app, BrowserWindow, ipcMain, desktopCapturer, screen, nativeImage } = require('electron')
const path = require('path')

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 850,
    minWidth: 900,
    minHeight: 650,
    title: 'SCRCPY OCR 直播監控',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  mainWindow.loadFile('renderer/index.html')
  mainWindow.setMenuBarVisibility(false)
}

// 全螢幕擷取（用於範圍選取的背景）
ipcMain.handle('capture-fullscreen', async () => {
  try {
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width, height } = primaryDisplay.size

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height }
    })

    if (sources.length === 0) {
      return { success: false, error: '找不到螢幕來源（請確認 scrcpy 正在執行）' }
    }

    return { success: true, image: sources[0].thumbnail.toDataURL() }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// 範圍擷取（用於預覽、OCR、監控）
ipcMain.handle('capture-region', async (event, { x, y, width, height }) => {
  try {
    const primaryDisplay = screen.getPrimaryDisplay()
    const displayW = primaryDisplay.size.width
    const displayH = primaryDisplay.size.height

    const rx = Math.round(x)
    const ry = Math.round(y)
    const rw = Math.round(width)
    const rh = Math.round(height)

    if (rw <= 0 || rh <= 0) {
      return { success: false, error: '選取範圍無效' }
    }

    // 先擷取全螢幕取得 thumbnail
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: displayW, height: displayH }
    })

    if (sources.length === 0) {
      return { success: false, error: '找不到螢幕來源' }
    }

    const fullImage = sources[0].thumbnail

    // 確保不超出邊界
    const cropX = Math.max(0, Math.min(rx, displayW - 1))
    const cropY = Math.max(0, Math.min(ry, displayH - 1))
    const cropW = Math.min(rw, displayW - cropX)
    const cropH = Math.min(rh, displayH - cropY)

    const cropped = nativeImage.createFromBuffer(fullImage.toPNG(), {
      width: fullImage.getSize().width,
      height: fullImage.getSize().height
    })

    const result = cropped.crop({ x: cropX, y: cropY, width: cropW, height: cropH })
    return {
      success: true,
      image: result.toDataURL(),
      region: { x: cropX, y: cropY, width: cropW, height: cropH }
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// 取得螢幕資訊
ipcMain.handle('get-display-info', async () => {
  const primaryDisplay = screen.getPrimaryDisplay()
  return {
    width: primaryDisplay.size.width,
    height: primaryDisplay.size.height,
    scaleFactor: primaryDisplay.scaleFactor
  }
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => { app.quit() })
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})