const { app, BrowserWindow, dialog, session, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const {
  assertLocalBuild,
  assertNoSourceOverrides,
  configureRuntimePaths,
} = require('./next-runtime.cjs')

const APP_NAME = 'ELISA Analysis Next (Dev)'
const projectRoot = path.resolve(__dirname, '..')
let mainWindow = null
let runtimePaths = null

app.setName(APP_NAME)
if (process.platform === 'win32') {
  app.setAppUserModelId('com.easylab.elisa-analysis.nextdev')
}

function reportStartupFailure(error) {
  const message = error instanceof Error ? error.message : String(error)
  dialog.showErrorBox('ELISA Analysis Next could not start safely', message)
  process.exitCode = 1
  app.quit()
}

try {
  assertNoSourceOverrides(process.env)
  runtimePaths = configureRuntimePaths(app, {
    projectRoot,
    isPackaged: app.isPackaged,
    appDataRoot: app.getPath('appData'),
  })
  // Never load an inherited Vite URL or a redirected/bundled source directory.
  assertLocalBuild(projectRoot)
} catch (error) {
  reportStartupFailure(error)
}

if (runtimePaths) {
  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    app.quit()
  } else {
    app.on('second-instance', () => {
      if (!mainWindow) return
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    })

    function chooseDownloadPath(filename) {
      const basename = path.basename(String(filename || 'download').replace(/[\\/]/g, path.sep))
      const parsed = path.parse(basename)
      let candidate = path.join(runtimePaths.downloads, basename)
      let suffix = 1
      while (fs.existsSync(candidate)) {
        candidate = path.join(runtimePaths.downloads, `${parsed.name} (${suffix})${parsed.ext}`)
        suffix += 1
      }
      return candidate
    }

    function createMainWindow() {
      const win = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 960,
        minHeight: 640,
        backgroundColor: '#0b1020',
        show: false,
        title: APP_NAME,
        webPreferences: {
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

      const indexPath = path.join(projectRoot, 'dist', 'index.html')
      win.loadFile(indexPath).catch(reportStartupFailure)
      return win
    }

    app.whenReady().then(() => {
      session.defaultSession.on('will-download', (_event, item) => {
        item.setSavePath(chooseDownloadPath(item.getFilename()))
      })

      mainWindow = createMainWindow()
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          mainWindow = createMainWindow()
        }
      })
    }).catch(reportStartupFailure)

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit()
    })
  }
}
