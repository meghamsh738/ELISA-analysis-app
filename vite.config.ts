import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Required for file:// loading in Electron (assets resolve relatively in prod builds).
  base: './',
  // Avoid drvfs copyfile EPERM on Windows-mounted drives during public asset copy.
  publicDir: false,
})
