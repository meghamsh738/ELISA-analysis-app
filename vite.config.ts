import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Required for file:// loading in Electron (assets resolve relatively in prod builds).
  base: './',
  // Avoid drvfs copyfile EPERM on Windows-mounted drives during public asset copy.
  publicDir: false,
  // Keep all build output in this Next worktree; never honor an inherited dist path.
  build: {
    outDir: path.join(root, 'dist'),
    emptyOutDir: true,
  },
  server: {
    host: '127.0.0.1',
    port: 18514,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 18514,
    strictPort: true,
  },
})
