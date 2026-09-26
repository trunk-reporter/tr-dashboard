import { useEffect } from 'react'
import { useAudioStore, selectIsPlaying } from '@/stores/useAudioStore'

export function useMediaSession(audioRef: React.RefObject<HTMLAudioElement | null>) {
  const currentCall = useAudioStore((s) => s.currentCall)
  const isPlaying = useAudioStore(selectIsPlaying)
  const skipNext = useAudioStore((s) => s.skipNext)
  const skipPrevious = useAudioStore((s) => s.skipPrevious)
  const requestSeek = useAudioStore((s) => s.requestSeek)

  // Update metadata when current call changes
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    if (!currentCall) {
      // Nothing loaded (e.g. the player was reset after a key change): don't
      // leave the previous call on the lock screen / OS media controls
      navigator.mediaSession.metadata = null
      return
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentCall.tgAlphaTag || `TG ${currentCall.tgid}`,
      artist: currentCall.systemName || `System ${currentCall.systemId}`,
      album: 'TR Dashboard',
      artwork: [
        { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      ],
    })
  }, [currentCall])

  // Update playback state
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
  }, [isPlaying])

  // Register action handlers
  useEffect(() => {
    if (!('mediaSession' in navigator)) return

    const audio = audioRef.current

    navigator.mediaSession.setActionHandler('play', () => {
      audio?.play().catch(console.error)
    })

    navigator.mediaSession.setActionHandler('pause', () => {
      audio?.pause()
    })

    navigator.mediaSession.setActionHandler('nexttrack', () => {
      skipNext()
    })

    navigator.mediaSession.setActionHandler('previoustrack', () => {
      skipPrevious()
    })

    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (audio && details.seekTime != null) {
        audio.currentTime = details.seekTime
        requestSeek(details.seekTime)
      }
    })

    return () => {
      navigator.mediaSession.setActionHandler('play', null)
      navigator.mediaSession.setActionHandler('pause', null)
      navigator.mediaSession.setActionHandler('nexttrack', null)
      navigator.mediaSession.setActionHandler('previoustrack', null)
      navigator.mediaSession.setActionHandler('seekto', null)
    }
  }, [audioRef, skipNext, skipPrevious, requestSeek])
}
