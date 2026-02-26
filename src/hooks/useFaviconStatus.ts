import { useEffect } from 'react'
import { useRealtimeStore } from '@/stores/useRealtimeStore'
import type { ConnectionStatus } from '@/api/eventsource'

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  connected: '#22c55e',
  connecting: '#f59e0b',
  disconnected: '#ef4444',
  error: '#ef4444',
}

function generateFaviconSvg(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
    <circle cx="16" cy="16" r="14" fill="${color}"/>
    <path d="M16 8 C12 8 10 11 10 14 L10 18 C10 21 12 24 16 24 C20 24 22 21 22 18 L22 14 C22 11 20 8 16 8Z" fill="white" opacity="0.9"/>
    <path d="M12 18 L12 20 C12 22.2 13.8 24 16 24 C18.2 24 20 22.2 20 20 L20 18" fill="none" stroke="white" stroke-width="1.5" opacity="0.7"/>
  </svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export function useFaviconStatus() {
  const connectionStatus = useRealtimeStore((s) => s.connectionStatus)

  useEffect(() => {
    const color = STATUS_COLORS[connectionStatus] || STATUS_COLORS.disconnected
    const dataUri = generateFaviconSvg(color)

    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = dataUri
  }, [connectionStatus])
}
