import { useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useHotkeys } from 'react-hotkeys-hook'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { TransmissionTimeline, TransmissionLegend } from './TransmissionTimeline'
import { useAudioStore, selectIsPlaying, selectIsBlocked, selectRetryCount } from '@/stores/useAudioStore'
import { formatDuration, getTalkgroupDisplayName } from '@/lib/utils'
import { KEYBOARD_SHORTCUTS, AUDIO } from '@/lib/constants'

export function AudioPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null)
  // Ref to prevent redundant play attempts during a single load cycle
  const playAttemptedRef = useRef(false)
  // Ref to track the current audio URL to detect when we need to reload
  const currentUrlRef = useRef<string | null>(null)

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
    // Actions
    requestSeek,
    setVolume,
    toggleMute,
    skipNext,
    skipPrevious,
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

  // Idle state - no call loaded
  if (!currentCall) {
    return (
      <div className="border-t border-border bg-card px-4 py-3">
        <div className="flex items-center justify-center text-sm text-muted-foreground">
          No audio playing. Select a call to begin playback.
        </div>
      </div>
    )
  }

  // Blocked state - awaiting user gesture
  if (isBlocked) {
    return (
      <div className="border-t border-border bg-card px-4 py-3">
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
          <span className="text-sm text-muted-foreground">
            Browser blocked autoplay.
          </span>
          <Button onClick={handleUnlockClick} variant="default" size="sm">
            Click to Enable Audio
          </Button>
          <span className="text-sm text-muted-foreground">
            {currentCall.sysid ? (
              <Link
                to={`/talkgroups/${currentCall.sysid}:${currentCall.tgid}`}
                className="hover:underline"
              >
                {getTalkgroupDisplayName(currentCall.tgid, currentCall.tgAlphaTag)}
              </Link>
            ) : (
              getTalkgroupDisplayName(currentCall.tgid, currentCall.tgAlphaTag)
            )} is ready to play
          </span>
          {queue.length > 0 && (
            <span className="text-xs text-muted-foreground">
              +{queue.length} queued
            </span>
          )}
        </div>
      </div>
    )
  }

  // Normal player UI
  return (
    <div className="border-t border-border bg-card px-4 py-3">
      <audio
        ref={audioRef}
        onCanPlay={handleCanPlay}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onError={handleError}
        onPlay={handlePlay}
        onPause={handlePause}
      />

      <div className="flex items-center gap-4">
        {/* Playback controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              playAttemptedRef.current = false
              skipPrevious()
            }}
            title="Previous (K)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="19 20 9 12 19 4 19 20" />
              <line x1="5" x2="5" y1="19" y2="5" />
            </svg>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={handlePlayPause}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            className="h-10 w-10"
          >
            {isPlaying ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              playAttemptedRef.current = false
              skipNext()
            }}
            title="Next (J)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="5 4 15 12 5 20 5 4" />
              <line x1="19" x2="19" y1="5" y2="19" />
            </svg>
          </Button>
        </div>

        {/* Progress and timeline */}
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex items-center gap-3">
            <span className="w-12 text-right font-mono text-xs text-muted-foreground">
              {formatDuration(currentTime)}
            </span>

            <div className="relative flex-1 overflow-hidden">
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

            <span className="w-12 font-mono text-xs text-muted-foreground">
              {formatDuration(duration)}
            </span>
          </div>
        </div>

        {/* Call info */}
        <div className="flex min-w-[160px] flex-col items-end">
          {currentCall.sysid ? (
            <Link
              to={`/talkgroups/${currentCall.sysid}:${currentCall.tgid}`}
              className="font-medium hover:underline"
            >
              {getTalkgroupDisplayName(currentCall.tgid, currentCall.tgAlphaTag)}
            </Link>
          ) : (
            <span className="font-medium">
              {getTalkgroupDisplayName(currentCall.tgid, currentCall.tgAlphaTag)}
            </span>
          )}
          <span className="text-xs text-muted-foreground">{currentCall.system}</span>
        </div>

        {/* Volume controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMute}
            title={muted ? 'Unmute (M)' : 'Mute (M)'}
          >
            {muted || volume === 0 ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="22" x2="16" y1="9" y2="15" />
                <line x1="16" x2="22" y1="9" y2="15" />
              </svg>
            ) : volume < 0.5 ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
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

        {/* Queue indicator */}
        {queue.length > 0 && (
          <div className="text-xs text-muted-foreground">{queue.length} in queue</div>
        )}

        {/* Keyboard hints */}
        <div className="hidden items-center gap-1 text-xs text-muted-foreground xl:flex">
          <kbd className="rounded border bg-muted px-1.5 py-0.5">J</kbd>
          <kbd className="rounded border bg-muted px-1.5 py-0.5">K</kbd>
          <kbd className="rounded border bg-muted px-1.5 py-0.5">Space</kbd>
        </div>
      </div>

      {/* Transmission legend - unit names below timeline */}
      {transmissions && transmissions.length > 0 && (
        <div className="mt-1 ml-[136px]">
          <TransmissionLegend transmissions={transmissions} unitTags={unitTags} />
        </div>
      )}
    </div>
  )
}
