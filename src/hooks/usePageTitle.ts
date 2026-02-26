import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAudioStore } from '@/stores/useAudioStore'

const ROUTE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/calls': 'Calls',
  '/talkgroups': 'Talkgroups',
  '/units': 'Units',
  '/affiliations': 'Affiliations',
  '/directory': 'Directory',
  '/transcriptions': 'Transcriptions',
  '/settings': 'Settings',
  '/admin': 'Admin',
}

function getTitleFromPath(pathname: string): string {
  // Exact match
  if (ROUTE_TITLES[pathname]) return ROUTE_TITLES[pathname]

  // Detail routes
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length >= 2) {
    const [section, id] = segments
    switch (section) {
      case 'calls':
        return `Call ${id}`
      case 'talkgroups':
        return `Talkgroup ${id}`
      case 'units':
        return `Unit ${id}`
    }
  }

  // Fallback to section name
  if (segments.length >= 1) {
    const section = segments[0]
    if (ROUTE_TITLES[`/${section}`]) return ROUTE_TITLES[`/${section}`]
  }

  return 'Dashboard'
}

export function usePageTitle() {
  const { pathname } = useLocation()
  const currentCall = useAudioStore((s) => s.currentCall)
  const playbackState = useAudioStore((s) => s.playbackState)

  useEffect(() => {
    const isPlaying = playbackState === 'playing'
    if (isPlaying && currentCall) {
      const tag = currentCall.tgAlphaTag || `TG ${currentCall.tgid}`
      document.title = `Playing: ${tag} | tr-dashboard`
    } else {
      const pageTitle = getTitleFromPath(pathname)
      document.title = `${pageTitle} | tr-dashboard`
    }
  }, [pathname, currentCall, playbackState])
}
