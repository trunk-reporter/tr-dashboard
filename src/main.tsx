import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { setUpdateSW } from './hooks/usePWAUpdate'
import App from './App'
import './index.css'

// Register service worker with update prompt
const updateSW = registerSW({
  onNeedRefresh() {
    setUpdateSW(updateSW)
    window.dispatchEvent(new CustomEvent('sw-update-available'))
  },
  onOfflineReady() {
    console.log('[PWA] App ready for offline use')
  },
})

// Check for SW updates every 5 minutes
if ('serviceWorker' in navigator) {
  setInterval(() => {
    navigator.serviceWorker.getRegistration().then((r) => r?.update())
  }, 5 * 60 * 1000)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
)
