const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const {
  assertLocalBuild,
  assertNoSourceOverrides,
  assertNoSymlinkDirectoryComponents,
  configureRuntimePaths,
  ensureDirectoryTree,
  resolvePlaywrightBrowserRoot,
  resolveRuntimePaths,
} = require('./next-runtime.cjs')

function withTemporaryDirectory(run) {
  const root = fs.mkdtempSync(path.join(path.dirname(__dirname), '.elisa-next-runtime-test-'))
  try {
    return run(root)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

test('development and packaged profiles resolve under their own Next locations', () => {
  withTemporaryDirectory((root) => {
    const workspaceRoot = path.join(root, 'easylab-next')
    const projectRoot = path.join(workspaceRoot, 'modules', 'elisa-analysis')
    const cloneRoot = path.join(root, 'standalone-checkout')
    const appDataRoot = path.join(root, 'app-data')
    const devPaths = resolveRuntimePaths({ projectRoot, isPackaged: false })
    const clonePaths = resolveRuntimePaths({ projectRoot: cloneRoot, isPackaged: false })
    const packagedPaths = resolveRuntimePaths({ projectRoot, appDataRoot, isPackaged: true })
    const sharedBrowserPath = resolvePlaywrightBrowserRoot(projectRoot)
    const cloneBrowserPath = resolvePlaywrightBrowserRoot(cloneRoot)

    assert.equal(devPaths.runtimeRoot, path.join(workspaceRoot, 'runtime', 'elisa-standalone'))
    assert.equal(clonePaths.runtimeRoot, path.join(cloneRoot, '.next-runtime', 'easylab-next', 'elisa-standalone'))
    assert.equal(sharedBrowserPath, path.join(workspaceRoot, 'runtime', 'playwright'))
    assert.equal(cloneBrowserPath, path.join(cloneRoot, '.playwright-browsers'))
    assert.equal(packagedPaths.runtimeRoot, path.join(appDataRoot, 'EasyLab Next ELISA', 'runtime'))
    for (const paths of [devPaths, packagedPaths]) {
      for (const key of ['userData', 'sessionData', 'data', 'exports', 'downloads']) {
        assert.ok(paths[key].startsWith(`${paths.runtimeRoot}${path.sep}`))
      }
    }
  })
})

test('Electron receives private userData, sessionData, and downloads paths before startup', () => {
  withTemporaryDirectory((root) => {
    const projectRoot = path.join(root, 'worktree')
    const previousEnvironment = Object.fromEntries(
      ['EASYLAB_RUNTIME_ROOT', 'EASYLAB_DATA_PATH', 'EASYLAB_EXPORTS_PATH', 'EASYLAB_SETTINGS_PATH']
        .map((key) => [key, process.env[key]]),
    )
    const appPaths = {}

    try {
      const paths = configureRuntimePaths({
        isPackaged: false,
        setPath: (key, value) => { appPaths[key] = value },
      }, { projectRoot })

      assert.equal(appPaths.userData, paths.userData)
      assert.equal(appPaths.sessionData, paths.sessionData)
      assert.equal(appPaths.downloads, paths.downloads)
      assert.equal(process.env.EASYLAB_RUNTIME_ROOT, paths.runtimeRoot)
      assert.equal(process.env.EASYLAB_DATA_PATH, paths.data)
      assert.equal(process.env.EASYLAB_EXPORTS_PATH, paths.exports)
      assert.equal(process.env.EASYLAB_SETTINGS_PATH, paths.settings)
    } finally {
      for (const [key, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  })
})

test('runtime directory creation refuses a symlinked worktree runtime root', () => {
  withTemporaryDirectory((root) => {
    const projectRoot = path.join(root, 'standalone-checkout')
    const outsideRoot = path.join(root, 'outside')
    fs.mkdirSync(projectRoot)
    fs.mkdirSync(outsideRoot)
    fs.symlinkSync(outsideRoot, path.join(projectRoot, '.next-runtime'), 'dir')

    assert.throws(
      () => ensureDirectoryTree(resolveRuntimePaths({ projectRoot, isPackaged: false }).runtimeRoot),
      /Refusing symlink directory/,
    )
  })
})

test('shared Next runtime creation refuses a symlinked workspace runtime root', () => {
  withTemporaryDirectory((root) => {
    const workspaceRoot = path.join(root, 'easylab-next')
    const projectRoot = path.join(workspaceRoot, 'modules', 'elisa-analysis')
    const outsideRoot = path.join(root, 'outside')
    fs.mkdirSync(workspaceRoot)
    fs.mkdirSync(outsideRoot)
    fs.symlinkSync(outsideRoot, path.join(workspaceRoot, 'runtime'), 'dir')

    const paths = resolveRuntimePaths({ projectRoot, isPackaged: false })
    assert.throws(() => ensureDirectoryTree(paths.runtimeRoot), /Refusing symlink directory/)
  })
})

test('Playwright cache path validation refuses a symlinked shared runtime', () => {
  withTemporaryDirectory((root) => {
    const workspaceRoot = path.join(root, 'easylab-next')
    const projectRoot = path.join(workspaceRoot, 'modules', 'elisa-analysis')
    const outsideRoot = path.join(root, 'outside')
    fs.mkdirSync(workspaceRoot)
    fs.mkdirSync(outsideRoot)
    fs.symlinkSync(outsideRoot, path.join(workspaceRoot, 'runtime'), 'dir')

    assert.throws(
      () => assertNoSymlinkDirectoryComponents(resolvePlaywrightBrowserRoot(projectRoot)),
      /Refusing symlink directory/,
    )
  })
})

test('packaged runtime directory creation refuses a symlinked app data root', () => {
  withTemporaryDirectory((root) => {
    const appDataRoot = path.join(root, 'app-data')
    const outsideRoot = path.join(root, 'outside')
    fs.mkdirSync(outsideRoot)
    fs.symlinkSync(outsideRoot, appDataRoot, 'dir')
    const paths = resolveRuntimePaths({
      projectRoot: path.join(root, 'worktree'),
      appDataRoot,
      isPackaged: true,
    })

    assert.throws(() => ensureDirectoryTree(paths.runtimeRoot), /Refusing symlink directory/)
  })
})

test('desktop startup rejects inherited source and server overrides', () => {
  assert.throws(
    () => assertNoSourceOverrides({ VITE_DEV_SERVER_URL: 'http://127.0.0.1:5180' }),
    /VITE_DEV_SERVER_URL/,
  )
  assert.throws(
    () => assertNoSourceOverrides({ EASYLAB_ELISA_ANALYSIS_PATH: '/stable/elisa-analysis' }),
    /EASYLAB_ELISA_ANALYSIS_PATH/,
  )
  assert.doesNotThrow(() => assertNoSourceOverrides({ PATH: '/usr/bin' }))
})

test('desktop startup refuses a redirected dist directory', () => {
  withTemporaryDirectory((root) => {
    const projectRoot = path.join(root, 'worktree')
    const outsideRoot = path.join(root, 'outside')
    fs.mkdirSync(projectRoot)
    fs.mkdirSync(outsideRoot)
    fs.writeFileSync(path.join(outsideRoot, 'index.html'), '<!doctype html>')
    fs.symlinkSync(outsideRoot, path.join(projectRoot, 'dist'), 'dir')

    assert.throws(() => assertLocalBuild(projectRoot), /build directory must be a local directory/)
  })
})
