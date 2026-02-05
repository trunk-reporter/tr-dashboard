import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import pkg from './package.json'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: ['eddie', 'localhost'],
    proxy: {
      '/api/ws': {
        target: 'wss://tr-api.luxprimatech.com',
        ws: true,
        changeOrigin: true,
      },
      '/api': {
        target: 'https://tr-api.luxprimatech.com',
        changeOrigin: true,
      },
      '/health': {
        target: 'https://tr-api.luxprimatech.com',
        changeOrigin: true,
      },
    },
  },
})
