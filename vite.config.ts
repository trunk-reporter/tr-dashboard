import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import pkg from './package.json'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const authToken = env.TR_AUTH_TOKEN || process.env.TR_AUTH_TOKEN || ''

  return {
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
        '/api': {
          target: 'https://tr-engine.luxprimatech.com',
          changeOrigin: true,
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        },
        '/health': {
          target: 'https://tr-engine.luxprimatech.com',
          changeOrigin: true,
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        },
      },
    },
  }
})
