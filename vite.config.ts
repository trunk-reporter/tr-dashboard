import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import pkg from './package.json'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiKey = env.TR_API_KEY || process.env.TR_API_KEY || ''
  const engineUrl = env.TR_ENGINE_URL

  // Dev convenience: TR_API_KEY is added to proxied requests that carry no
  // Authorization header, so a local dashboard works against a keyed engine
  // without pasting a key. A key the browser sends (from Settings or the key
  // screen) always wins. Development only: in a deployment, a proxy that adds
  // a key to visitors' requests gives that key to every visitor.
  const proxyTo = (target: string): ProxyOptions => ({
    target,
    changeOrigin: true,
    ...(apiKey
      ? {
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              if (!req.headers.authorization) {
                proxyReq.setHeader('Authorization', `Bearer ${apiKey}`)
              }
            })
          },
        }
      : {}),
  })

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'prompt',
        injectRegister: false,
        manifest: {
          name: 'TR Dashboard',
          short_name: 'TR Dash',
          description: 'Real-time radio scanner monitoring dashboard',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          orientation: 'any',
          start_url: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,svg,png}'],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
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
      ...(engineUrl
        ? {
            proxy: {
              '/api': proxyTo(engineUrl),
              '/health': proxyTo(engineUrl),
            },
          }
        : {}),
    },
  }
})
