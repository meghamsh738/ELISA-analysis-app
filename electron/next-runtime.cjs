const fs = require('node:fs')
const path = require('node:path')

const APP_DATA_DIRECTORY = 'EasyLab Next ELISA'
const SOURCE_OVERRIDE_ENV_KEYS = Object.freeze([
  'APP_DIST_DIR',
  'EASYLAB_ELISA_ANALYSIS_PATH',
  'EASYLAB_ELISA_ANALYSIS_DIST_DIR',
  'EASYLAB_MODULE_SOURCE',
  'EASYLAB_SOURCE_DIR',
  'VITE_DEV_SERVER_URL',
])

function resolveMultiModuleWorkspaceRoot(projectRoot) {
  const sourceRoot = path.resolve(projectRoot)
  const modulesRoot = path.dirname(sourceRoot)
  const workspaceRoot = path.dirname(modulesRoot)

  if (path.basename(modulesRoot) === 'modules' && path.basename(workspaceRoot) === 'easylab-next') {
    return workspaceRoot
  }

  return null
}

function resolveDevelopmentRuntimeRoot(projectRoot) {
  const sourceRoot = path.resolve(projectRoot)
  const workspaceRoot = resolveMultiModuleWorkspaceRoot(sourceRoot)
  if (workspaceRoot) return path.join(workspaceRoot, 'runtime', 'elisa-standalone')
  return path.join(sourceRoot, '.next-runtime', 'easylab-next', 'elisa-standalone')
}

function resolvePlaywrightBrowserRoot(projectRoot) {
  const sourceRoot = path.resolve(projectRoot)
  const workspaceRoot = resolveMultiModuleWorkspaceRoot(sourceRoot)
  if (workspaceRoot) return path.join(workspaceRoot, 'runtime', 'playwright')
  return path.join(sourceRoot, '.playwright-browsers')
}

function assertNoSymlinkDirectoryComponents(directoryPath, fsImpl = fs) {
  const absolutePath = path.resolve(directoryPath)
  const root = path.parse(absolutePath).root
  const components = absolutePath.slice(root.length).split(path.sep).filter(Boolean)
  let currentPath = root

  for (const component of components) {
    currentPath = path.join(currentPath, component)
    let stat
    try {
      stat = fsImpl.lstatSync(currentPath)
    } catch (error) {
      if (error.code === 'ENOENT') break
      throw error
    }
    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing symlink directory in ELISA Next path: ${currentPath}`)
    }
    if (!stat.isDirectory()) {
      throw new Error(`Expected a directory in ELISA Next path: ${currentPath}`)
    }
  }

  return absolutePath
}

function resolveRuntimePaths({ projectRoot, isPackaged, appDataRoot }) {
  if (!projectRoot || !path.isAbsolute(projectRoot)) {
    throw new Error('The ELISA Next source root must be an absolute path.')
  }

  let runtimeRoot
  if (isPackaged) {
    if (!appDataRoot || !path.isAbsolute(appDataRoot)) {
      throw new Error('The ELISA Next app data root must be an absolute path.')
    }
    runtimeRoot = path.join(appDataRoot, APP_DATA_DIRECTORY, 'runtime')
  } else {
    runtimeRoot = resolveDevelopmentRuntimeRoot(projectRoot)
  }

  return Object.freeze({
    runtimeRoot,
    userData: path.join(runtimeRoot, 'electron-user-data'),
    sessionData: path.join(runtimeRoot, 'electron-session-data'),
    data: path.join(runtimeRoot, 'data'),
    exports: path.join(runtimeRoot, 'exports'),
    settings: path.join(runtimeRoot, 'settings.json'),
    downloads: path.join(runtimeRoot, 'downloads'),
  })
}

function ensureDirectoryTree(directoryPath, fsImpl = fs) {
  const absolutePath = path.resolve(directoryPath)
  const root = path.parse(absolutePath).root
  const components = absolutePath.slice(root.length).split(path.sep).filter(Boolean)
  let currentPath = root

  for (const component of components) {
    currentPath = path.join(currentPath, component)
    let stat
    try {
      stat = fsImpl.lstatSync(currentPath)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      try {
        fsImpl.mkdirSync(currentPath, { mode: 0o700 })
      } catch (mkdirError) {
        if (mkdirError.code !== 'EEXIST') throw mkdirError
      }
      stat = fsImpl.lstatSync(currentPath)
    }

    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing symlink directory in ELISA Next runtime path: ${currentPath}`)
    }
    if (!stat.isDirectory()) {
      throw new Error(`Expected a directory in ELISA Next runtime path: ${currentPath}`)
    }
  }

  return absolutePath
}

function assertNoSourceOverrides(environment = process.env) {
  const present = SOURCE_OVERRIDE_ENV_KEYS.filter((key) => environment[key] !== undefined)
  if (present.length > 0) {
    throw new Error(`ELISA Next refuses external source or server overrides: ${present.join(', ')}`)
  }
}

function configureRuntimePaths(app, { projectRoot, isPackaged = app.isPackaged, appDataRoot }) {
  const paths = resolveRuntimePaths({ projectRoot, isPackaged, appDataRoot })
  for (const directoryPath of [
    paths.runtimeRoot,
    paths.userData,
    paths.sessionData,
    paths.data,
    paths.exports,
    paths.downloads,
  ]) {
    ensureDirectoryTree(directoryPath)
  }

  // Set every Electron profile path before Electron creates its default profile or lock.
  app.setPath('userData', paths.userData)
  app.setPath('sessionData', paths.sessionData)
  app.setPath('downloads', paths.downloads)

  // If later app code needs a persistence path, keep it inside this app's private root.
  process.env.EASYLAB_RUNTIME_ROOT = paths.runtimeRoot
  process.env.EASYLAB_DATA_PATH = paths.data
  process.env.EASYLAB_EXPORTS_PATH = paths.exports
  process.env.EASYLAB_SETTINGS_PATH = paths.settings

  return paths
}

function assertLocalBuild(projectRoot, fsImpl = fs) {
  const distPath = path.join(projectRoot, 'dist')
  const indexPath = path.join(distPath, 'index.html')
  const distStat = fsImpl.lstatSync(distPath)
  const indexStat = fsImpl.lstatSync(indexPath)

  if (distStat.isSymbolicLink() || !distStat.isDirectory()) {
    throw new Error(`ELISA Next build directory must be a local directory: ${distPath}`)
  }
  if (indexStat.isSymbolicLink() || !indexStat.isFile()) {
    throw new Error(`ELISA Next build entry must be a local file: ${indexPath}`)
  }

  return indexPath
}

module.exports = {
  APP_DATA_DIRECTORY,
  SOURCE_OVERRIDE_ENV_KEYS,
  assertLocalBuild,
  assertNoSymlinkDirectoryComponents,
  assertNoSourceOverrides,
  configureRuntimePaths,
  ensureDirectoryTree,
  resolvePlaywrightBrowserRoot,
  resolveRuntimePaths,
}
