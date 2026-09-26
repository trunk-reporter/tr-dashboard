import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import pkg from './package.json'

/** The parts of a proxied request mayAddDevKey looks at */
interface ProxiedRequest {
  socket: { remoteAddress?: string }
  headers: Record<string, string | string[] | undefined>
}

function headerValue(req: ProxiedRequest, name: string): string {
  const v = req.headers[name]
  return (Array.isArray(v) ? v[0] : v) ?? ''
}

/**
 * Whether the dev proxy may add TR_API_KEY to a request: only when it comes
 * from this machine (not from another device on the network), and not from
 * another site open in the developer's browser. tr-engine answers every origin
 * with `Access-Control-Allow-Origin: *`, so without the second check any web
 * page could call http://localhost:5173/api/... and use the key.
 */
export function mayAddDevKey(req: ProxiedRequest): boolean {
  const addr = req.socket.remoteAddress ?? ''
  const loopback = addr === '::1' || addr.startsWith('127.') || addr.startsWith('::ffff:127.')
  if (!loopback) return false
  // Sent by current browsers on every request; 'none' is a typed-in URL
  const site = headerValue(req, 'sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') return false
  // Sent on cross-origin requests (and same-origin non-GET ones)
  const origin = headerValue(req, 'origin')
  if (origin) {
    let host: string
    try {
      host = new URL(origin).host
    } catch {
      return false // e.g. "null" from a sandboxed frame or file: page
    }
    if (host !== headerValue(req, 'host')) return false
  }
  return true
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiKey = env.TR_API_KEY || process.env.TR_API_KEY || ''
  const engineUrl = env.TR_ENGINE_URL

  // Dev convenience: TR_API_KEY is added to proxied requests that carry no
  // Authorization header, so a local dashboard works against a keyed engine
  // without pasting a key. A key the browser sends (from Settings or the key
  // screen) always wins. Development only: a proxy that adds a key to
  // visitors' requests gives that key to every visitor. The dev server listens
  // on every interface (server.host below), so the key is added only for this
  // machine's own browser tab (mayAddDevKey), and `vite preview` never adds it.
  const proxyTo = (target: string, addKey: boolean): ProxyOptions => ({
    target,
    changeOrigin: true,
    ...(addKey && apiKey
      ? {
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              if (!req.headers.authorization && mayAddDevKey(req)) {
                proxyReq.setHeader('Authorization', `Bearer ${apiKey}`)
              }
            })
          },
        }
      : {}),
  })
  const proxy = (addKey: boolean) =>
    engineUrl ? { '/api': proxyTo(engineUrl, addKey), '/health': proxyTo(engineUrl, addKey) } : undefined

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
      // Reachable from the LAN (allowedHosts names this machine); LAN clients
      // never get TR_API_KEY added, they paste a key like any other visitor.
      host: '0.0.0.0',
      allowedHosts: ['eddie', 'localhost'],
      proxy: proxy(true),
    },
    // Without its own proxy, preview would inherit server.proxy (and the key).
    // It serves the production build, so it behaves like a deployment.
    preview: {
      proxy: proxy(false),
    },
  }
})
