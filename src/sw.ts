/// <reference lib="webworker" />

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope

// Precache build assets injected by vite-plugin-pwa
precacheAndRoute(self.__WB_MANIFEST)

// Remove old caches from previous versions
cleanupOutdatedCaches()

// Listen for skip waiting message from the app
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// Custom fetch handler: never intercept real-time or API requests
self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url)

  // Never intercept cross-origin requests
  if (url.origin !== self.location.origin) return

  // Never intercept API, SSE, audio, or health requests
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/events/stream') ||
    url.pathname.startsWith('/audio') ||
    url.pathname.startsWith('/health')
  ) {
    return
  }

  // For navigation requests, serve cached index.html (SPA fallback)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then((cached) => {
        return cached || fetch(event.request)
      }).catch(() =>
        new Response('<h1>Offline</h1><p>TR Dashboard requires a network connection.</p>',
          { status: 503, headers: { 'Content-Type': 'text/html' } })
      )
    )
    return
  }

  // For everything else (JS, CSS, images), try cache first then network
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request)
    }).catch(() =>
      new Response('', { status: 503 })
    )
  )
})

// Handle notification clicks - focus or open app window
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing window if available
      for (const client of clients) {
        if ('focus' in client) {
          return (client as WindowClient).focus()
        }
      }
      // Otherwise open new window
      return self.clients.openWindow('/')
    })
  )
})
