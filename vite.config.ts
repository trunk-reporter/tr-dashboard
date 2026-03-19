import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import pkg from './package.json'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const authToken = env.TR_AUTH_TOKEN || process.env.TR_AUTH_TOKEN || ''

  // When JWT auth is active, the browser sends its own Authorization header.
  // Only inject the static auth token if TR_AUTH_TOKEN is set (legacy dev mode).
  const proxyHeaders: Record<string, string> = {}
  if (authToken) {
    proxyHeaders['Authorization'] = `Bearer ${authToken}`
  }

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
          ...(authToken ? { headers: proxyHeaders } : {}),
        },
        '/health': {
          target: 'https://tr-engine.luxprimatech.com',
          changeOrigin: true,
          ...(authToken ? { headers: proxyHeaders } : {}),
        },
      },
    },
  }
})
