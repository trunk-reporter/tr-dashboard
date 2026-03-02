import { useEffect, useRef, useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { useHotkeys } from 'react-hotkeys-hook'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { TransmissionTimeline, TransmissionLegend } from './TransmissionTimeline'
import { useAudioStore, selectIsPlaying, selectIsBlocked, selectRetryCount } from '@/stores/useAudioStore'
import { cn, formatDuration, getTalkgroupDisplayName } from '@/lib/utils'
import { KEYBOARD_SHORTCUTS, AUDIO } from '@/lib/constants'

export function AudioPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null)
  // Ref to prevent redundant play attempts during a single load cycle
  const playAttemptedRef = useRef(false)
  // Ref to track the current audio URL to detect when we need to reload
  const currentUrlRef = useRef<string | null>(null)

  const [showHistory, setShowHistory] = useState(false)

  const {
    playbackState,
    currentCall,
    transmissions,
    unitTags,
    currentTime,
    duration,
    volume,
    muted,
    queue,
    history,
    // Actions
    requestSeek,
    setVolume,
    toggleMute,
    skipNext,
    skipPrevious,
    loadCall,
    // Event handlers
    onPlay,
    onPause,
    onEnded,
    onError,
    onTimeUpdate,
    onAutoplayBlocked,
  } = useAudioStore()

  const isPlaying = useAudioStore(selectIsPlaying)
  const isBlocked = useAudioStore(selectIsBlocked)
  const retryCount = useAudioStore(selectRetryCount)

  // Attempt to play audio, handling autoplay restrictions
  const attemptPlay = useCallback(async () => {
    const audio = audioRef.current
    if (!audio || playAttemptedRef.current) return

    playAttemptedRef.current = true

    try {
      await audio.play()
      // Success - onPlay event will update state
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        // Browser blocked autoplay
        onAutoplayBlocked()
      } else {
        console.error('Audio playback error:', err)
        onError()
      }
    }
  }, [onAutoplayBlocked, onError])

  // Handle user click to unlock audio
  const handleUnlockClick = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !currentCall) return

    // Ensure audio is loaded
    if (audio.src !== currentCall.audioUrl) {
      audio.src = currentCall.audioUrl
      audio.load()
    }

    // User gesture - attempt play
    audio.play()
      .then(() => {
        // onPlay event will update state to 'playing'
      })
      .catch((err) => {
        console.error('Audio unlock failed:', err)
      })
  }, [currentCall])

  // Load audio when currentCall changes
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    if (currentCall) {
      // Only reload if URL changed
      if (currentUrlRef.current !== currentCall.audioUrl) {
        currentUrlRef.current = currentCall.audioUrl
        playAttemptedRef.current = false
        audio.src = currentCall.audioUrl
        audio.load()
      }
    } else {
      currentUrlRef.current = null
      audio.src = ''
    }
  }, [currentCall])

  // Handle retry attempts - force reload when retryCount changes
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !currentCall || retryCount === 0) return

    // Force reload the audio element for retry
    playAttemptedRef.current = false
    audio.load()
  }, [retryCount, currentCall])

  // Handle playback state changes
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !currentCall) return

    if (playbackState === 'loading') {
      // Will attempt play when canplay fires
    } else if (playbackState === 'paused') {
      audio.pause()
    } else if (playbackState === 'playing') {
      // Already playing via audio element
    }
  }, [playbackState, currentCall])

  // Sync volume
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = muted ? 0 : volume
  }, [volume, muted])

  // Audio element event handlers
  const handleCanPlay = useCallback(() => {
    // Audio is ready - attempt to play if we're in loading state
    if (useAudioStore.getState().playbackState === 'loading') {
      attemptPlay()
    }
  }, [attemptPlay])

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      onTimeUpdate(audio.currentTime, audio.duration || 0)
    }
  }, [onTimeUpdate])

  const handleEnded = useCallback(() => {
    playAttemptedRef.current = false
    onEnded()
  }, [onEnded])

  const handleError = useCallback((e: React.SyntheticEvent<HTMLAudioElement>) => {
    const audio = e.currentTarget
    const error = audio.error

    // Only handle actual media errors
    if (error && error.code) {
      console.error('Audio error:', error.code, error.message, 'URL:', currentCall?.audioUrl)

      // MEDIA_ERR_ABORTED (1) = user cancelled, ignore
      if (error.code !== 1) {
        playAttemptedRef.current = false
        onError()
      }
    }
  }, [currentCall?.audioUrl, onError])

  const handlePlay = useCallback(() => {
    onPlay()
  }, [onPlay])

  const handlePause = useCallback(() => {
    // Only call onPause if we're actually playing (not during loading)
    const state = useAudioStore.getState()
    if (state.playbackState === 'playing') {
      onPause()
    }
  }, [onPause])

  // Seek handler
  const handleSeek = useCallback((time: number) => {
    const audio = audioRef.current
    if (audio) {
      audio.currentTime = time
      requestSeek(time)
    }
  }, [requestSeek])

  // Play/pause toggle for UI
  const handlePlayPause = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.pause()
    } else {
      audio.play().catch(console.error)
    }
  }, [isPlaying])

  // Keyboard shortcuts
  useHotkeys(
    KEYBOARD_SHORTCUTS.PLAY_PAUSE,
    (e) => {
      e.preventDefault()
      if (!currentCall) return
      handlePlayPause()
    },
    { enabled: !!currentCall && !isBlocked }
  )

  useHotkeys(
    KEYBOARD_SHORTCUTS.SKIP_NEXT,
    (e) => {
      e.preventDefault()
      playAttemptedRef.current = false
      skipNext()
    },
    { enabled: !!currentCall }
  )

  useHotkeys(
    KEYBOARD_SHORTCUTS.SKIP_PREVIOUS,
    (e) => {
      e.preventDefault()
      skipPrevious()
    },
    { enabled: !!currentCall }
  )

  useHotkeys(
    KEYBOARD_SHORTCUTS.MUTE,
    (e) => {
      e.preventDefault()
      toggleMute()
    },
    { enabled: !!currentCall }
  )

  useHotkeys(
    KEYBOARD_SHORTCUTS.VOLUME_UP,
    (e) => {
      e.preventDefault()
      setVolume(Math.min(1, volume + AUDIO.VOLUME_STEP))
    },
    { enabled: !!currentCall }
  )

  useHotkeys(
    KEYBOARD_SHORTCUTS.VOLUME_DOWN,
    (e) => {
      e.preventDefault()
      setVolume(Math.max(0, volume - AUDIO.VOLUME_STEP))
    },
    { enabled: !!currentCall }
  )

  useHotkeys(
    KEYBOARD_SHORTCUTS.SEEK_FORWARD,
    (e) => {
      e.preventDefault()
      const audio = audioRef.current
      if (audio) {
        const newTime = Math.min(audio.duration || 0, audio.currentTime + AUDIO.SEEK_STEP)
        audio.currentTime = newTime
        requestSeek(newTime)
      }
    },
    { enabled: !!currentCall && !isBlocked }
  )

  useHotkeys(
    KEYBOARD_SHORTCUTS.SEEK_BACKWARD,
    (e) => {
      e.preventDefault()
      const audio = audioRef.current
      if (audio) {
        const newTime = Math.max(0, audio.currentTime - AUDIO.SEEK_STEP)
        audio.currentTime = newTime
        requestSeek(newTime)
      }
    },
    { enabled: !!currentCall && !isBlocked }
  )

  useHotkeys(
    KEYBOARD_SHORTCUTS.REPLAY,
    (e) => {
      e.preventDefault()
      const audio = audioRef.current
      if (audio) {
        audio.currentTime = 0
        requestSeek(0)
        if (!isPlaying) {
          audio.play().catch(console.error)
        }
      }
    },
    { enabled: !!currentCall && !isBlocked }
  )

  // Update page title with queue count so user can see activity from background tab
  useEffect(() => {
    const base = 'TR Dashboard'
    if (queue.length > 0 && currentCall) {
      document.title = `(${queue.length}) ${getTalkgroupDisplayName(currentCall.tgid, currentCall.tgAlphaTag)} — ${base}`
    } else if (currentCall && isPlaying) {
      document.title = `▶ ${getTalkgroupDisplayName(currentCall.tgid, currentCall.tgAlphaTag)} — ${base}`
    } else {
      document.title = base
    }
  }, [queue.length, currentCall, isPlaying])

  // Auto-resume when tab regains visibility (browser blocks autoplay in background tabs)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return
      const audio = audioRef.current
      const state = useAudioStore.getState()

      if (state.playbackState === 'blocked' && audio && state.currentCall) {
        // Tab is visible again — try to play (user gesture context may be restored)
        playAttemptedRef.current = false
        audio.play()
          .then(() => { /* onPlay will update state */ })
          .catch(() => { /* still blocked, user will see Enable Audio button */ })
      } else if (state.playbackState === 'idle' && state.queue.length > 0) {
        // Queue has items but nothing is playing — kick it off
        state.skipNext()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  // Idle state - no call loaded
  if (!currentCall) {
    return (
      <div className="border-t border-border bg-card card-glass px-4 py-3">
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground/60">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-50">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
          Select a call to begin playback
        </div>
      </div>
    )
  }

  // Blocked state - awaiting user gesture
  if (isBlocked) {
    return (
      <div className="border-t border-border bg-card card-glass px-4 py-3">
        <audio
          ref={audioRef}
          onCanPlay={handleCanPlay}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onError={handleError}
          onPlay={handlePlay}
          onPause={handlePause}
        />
        <div className="flex items-center justify-center gap-4">
          <Button onClick={handleUnlockClick} variant="default" size="sm" className="gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Enable Audio
          </Button>
          <span className="text-sm text-muted-foreground">
            <Link
              to={`/talkgroups/${currentCall.systemId}:${currentCall.tgid}`}
              className="font-medium text-foreground hover:underline"
            >
              {getTalkgroupDisplayName(currentCall.tgid, currentCall.tgAlphaTag)}
            </Link>
            {' '}is ready
          </span>
          {queue.length > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary font-medium">
              +{queue.length} queued
            </span>
          )}
        </div>
      </div>
    )
  }

  const isActive = playbackState === 'playing' || playbackState === 'paused'

  // Normal player UI
  return (
    <div className={cn(
      "border-t border-border bg-card card-glass px-4 py-2.5 transition-all duration-300",
      isActive && "player-active"
    )}>
      <audio
        ref={audioRef}
        onCanPlay={handleCanPlay}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onError={handleError}
        onPlay={handlePlay}
        onPause={handlePause}
      />

      <div className="flex items-center gap-3">
        {/* Now playing indicator + call info — left side */}
        <div className="flex items-center gap-3 min-w-[180px]">
          {/* Play/pause — prominent center button */}
          <Button
            variant={isPlaying ? "default" : "ghost"}
            size="icon"
            onClick={handlePlayPause}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            className={cn(
              "h-10 w-10 rounded-full shrink-0 transition-all",
              isPlaying && "shadow-[0_0_12px_rgba(245,158,11,0.3)]"
            )}
          >
            {isPlaying ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="6 3 20 12 6 21 6 3" />
              </svg>
            )}
          </Button>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {isPlaying && (
                <span className="flex items-end gap-[2px] h-3">
                  <span className="w-[3px] bg-primary rounded-full animate-[player-bar1_0.8s_ease-in-out_infinite]" />
                  <span className="w-[3px] bg-primary rounded-full animate-[player-bar2_0.8s_ease-in-out_0.2s_infinite]" />
                  <span className="w-[3px] bg-primary rounded-full animate-[player-bar3_0.8s_ease-in-out_0.4s_infinite]" />
                </span>
              )}
              <Link
                to={`/talkgroups/${currentCall.systemId}:${currentCall.tgid}`}
                className="font-medium text-sm truncate hover:underline"
              >
                {getTalkgroupDisplayName(currentCall.tgid, currentCall.tgAlphaTag)}
              </Link>
            </div>
            <span className="text-[11px] text-muted-foreground truncate block">
              {currentCall.systemName || `System ${currentCall.systemId}`}
            </span>
          </div>
        </div>

        {/* Skip prev */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => {
            playAttemptedRef.current = false
            skipPrevious()
          }}
          title="Previous (K)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="19 20 9 12 19 4 19 20" />
            <line x1="5" x2="5" y1="19" y2="5" />
          </svg>
        </Button>

        {/* Progress and timeline — takes remaining space */}
        <div className="flex flex-1 items-center gap-2 min-w-0">
          <span className="w-10 text-right font-mono text-[11px] text-muted-foreground tabular-nums shrink-0">
            {formatDuration(currentTime)}
          </span>

          <div className="relative flex-1 overflow-hidden min-w-[80px]">
            <Slider
              value={currentTime}
              max={duration || 100}
              step={0.1}
              onChange={handleSeek}
              className="cursor-pointer"
            />
            {transmissions && transmissions.length > 0 && (
              <TransmissionTimeline
                transmissions={transmissions}
                unitTags={unitTags}
                duration={duration}
                currentTime={currentTime}
                onSeek={handleSeek}
              />
            )}
          </div>

          <span className="w-10 font-mono text-[11px] text-muted-foreground tabular-nums shrink-0">
            {formatDuration(duration)}
          </span>
        </div>

        {/* Skip next */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => {
            playAttemptedRef.current = false
            skipNext()
          }}
          title="Next (J)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 4 15 12 5 20 5 4" />
            <line x1="19" x2="19" y1="5" y2="19" />
          </svg>
        </Button>

        {/* Volume controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={toggleMute}
            title={muted ? 'Unmute (M)' : 'Mute (M)'}
          >
            {muted || volume === 0 ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="22" x2="16" y1="9" y2="15" />
                <line x1="16" x2="22" y1="9" y2="15" />
              </svg>
            ) : volume < 0.5 ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            )}
          </Button>

          <Slider
            value={muted ? 0 : volume * 100}
            max={100}
            step={1}
            onChange={(v) => setVolume(v / 100)}
            className="w-20"
          />
        </div>

        {/* Queue + history — right side compact group */}
        <div className="flex items-center gap-2 shrink-0">
          {queue.length > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary font-medium tabular-nums">
              {queue.length} queued
            </span>
          )}

          {history.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
              className={cn(
                "h-7 px-2 text-xs gap-1",
                showHistory ? "text-primary" : "text-muted-foreground"
              )}
              title="Play history"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M12 7v5l4 2" />
              </svg>
              {history.length}
            </Button>
          )}

          {/* Keyboard hints */}
          <div className="hidden items-center gap-1 text-[10px] text-muted-foreground/50 xl:flex">
            <kbd className="rounded border border-border/50 bg-muted/30 px-1 py-0.5 font-mono">Space</kbd>
            <kbd className="rounded border border-border/50 bg-muted/30 px-1 py-0.5 font-mono">J</kbd>
            <kbd className="rounded border border-border/50 bg-muted/30 px-1 py-0.5 font-mono">K</kbd>
          </div>
        </div>
      </div>

      {/* Transmission legend - unit names below timeline */}
      {transmissions && transmissions.length > 0 && (
        <div className="mt-1.5 flex items-center gap-4 pl-[196px]">
          <TransmissionLegend transmissions={transmissions} unitTags={unitTags} />
        </div>
      )}

      {/* History panel */}
      {showHistory && history.length > 0 && (
        <div className="mt-2 border-t border-border/50 pt-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">History</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHistory(false)}
              className="h-5 w-5 p-0 text-muted-foreground/50 hover:text-muted-foreground"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            {history.map((call, index) => (
              <button
                key={`${call.callId}-${index}`}
                onClick={() => {
                  playAttemptedRef.current = false
                  loadCall(call)
                  setShowHistory(false)
                }}
                className="flex items-center gap-1.5 rounded-full bg-muted/40 px-2.5 py-1 text-xs hover:bg-muted transition-colors"
                title={`${call.tgAlphaTag || `TG ${call.tgid}`} - ${call.systemName || `System ${call.systemId}`}`}
              >
                <span className="font-medium truncate max-w-[120px]">
                  {call.tgAlphaTag || `TG ${call.tgid}`}
                </span>
                <span className="text-muted-foreground/60 font-mono tabular-nums">{formatDuration(call.duration)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
