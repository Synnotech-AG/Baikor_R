import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { themeStylesheet } from './scripts/theme-stylesheet.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), themeStylesheet(new URL('./public/theme.css', import.meta.url))],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:5080',
      '/health': 'http://localhost:5080',
    },
  },
})
