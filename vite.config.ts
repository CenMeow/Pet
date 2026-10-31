import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Tauri 開發模式需要固定的 port
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 5173, strictPort: true },
})
