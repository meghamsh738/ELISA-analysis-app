const { contextBridge } = require('electron')

// Expose a tiny, read-only surface area. Add APIs here as-needed (file import/export, etc.).
contextBridge.exposeInMainWorld('easylab', {
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
})

