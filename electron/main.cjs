const { app, BrowserWindow, dialog, shell } = require('electron')
const path = require('node:path')

let mainWindow = null

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0b1020',
    show: false,
    title: 'ELISA Analysis',
    webPreferences: {
      // Keep the renderer locked down; if we later need file access, expose it via preload.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  win.once('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  if (!app.isPackaged) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5180'
    win
      .loadURL(devUrl)
      .catch((err) => dialog.showErrorBox('Failed to load dev server', String(err)))
  } else {
    const indexHtml = path.join(__dirname, '..', 'dist', 'index.html')
    win
      .loadFile(indexHtml)
      .catch((err) => dialog.showErrorBox('Failed to load app', String(err)))
  }

  return win
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    mainWindow = createMainWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow()
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
