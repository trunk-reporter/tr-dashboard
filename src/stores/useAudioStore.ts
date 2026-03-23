import { create } from 'zustand'
import type { Call, CallTransmission } from '@/api/types'
import { getCallAudioUrl, getCallTransmissions } from '@/api/client'

// Explicit state machine for audio playback
export type PlaybackState =
  | 'idle'      // No call loaded
  | 'loading'   // Call set, waiting for audio to load
  | 'playing'   // Audio actively playing
  | 'paused'    // User paused
  | 'blocked'   // Autoplay blocked, awaiting user gesture
  | 'error'     // Playback failed

export interface QueuedCall {
  id: number                     // call_id
  callId: number                 // same as id
  systemId: number
  systemName?: string
  tgid: number
  tgAlphaTag?: string
  duration: number
  audioUrl: string
}

// Audio retry configuration
const AUDIO_RETRY = {
  MAX_ATTEMPTS: 3,
  INITIAL_DELAY_MS: 500,
  BACKOFF_MULTIPLIER: 2,
} as const

interface AudioState {
  // Playback state machine
  playbackState: PlaybackState

  // Current call data
  currentCall: QueuedCall | null
  transmissions: CallTransmission[]
  unitTags: Map<number, string>

  // Playback position (updated by audio element)
  currentTime: number
  duration: number

  // Volume (user preference)
  volume: number
  muted: boolean

  // Queue
  queue: QueuedCall[]

  // Auto-advance to next in queue
  autoPlay: boolean

  // History for "previous" functionality
  history: QueuedCall[]

  // Retry tracking for audio load failures
  retryCount: number
  retryTimeoutId: ReturnType<typeof setTimeout> | null

  // Actions - called by UI
  loadCall: (call: Call | QueuedCall) => void
  requestPlay: () => void
  requestPause: () => void
  requestSeek: (time: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  skipNext: () => void
  skipPrevious: () => void
  addToQueue: (call: Call) => void
  removeFromQueue: (index: number) => void
  clearQueue: () => void
  setAutoPlay: (enabled: boolean) => void

  // Actions - called by audio element event handlers
  onLoadStart: () => void
  onCanPlay: () => void
  onPlay: () => void
  onPause: () => void
  onEnded: () => void
  onError: () => void
  onTimeUpdate: (time: number, duration: number) => void
  onAutoplayBlocked: () => void

  // User gesture to unlock blocked audio
  unlockAndPlay: () => void

  // For transmissions loading
  loadTransmissions: (callId: number) => Promise<void>
}

function toQueuedCall(call: Call | QueuedCall): QueuedCall {
  if ('audioUrl' in call) {
    return call
  }

  return {
    id: call.call_id,
    callId: call.call_id,
    systemId: call.system_id,
    systemName: call.system_name,
    tgid: call.tgid,
    tgAlphaTag: call.tg_alpha_tag,
    duration: call.duration ?? 0,
    audioUrl: call.audio_url ?? getCallAudioUrl(call.call_id),
  }
}

export const useAudioStore = create<AudioState>((set, get) => ({
  playbackState: 'idle',
  currentCall: null,
  transmissions: [],
  unitTags: new Map(),
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  muted: false,
  queue: [],
  autoPlay: true,
  history: [],
  retryCount: 0,
  retryTimeoutId: null,

  loadCall: (call) => {
    const state = get()
    const queued = toQueuedCall(call)

    // Clear any pending retry timeout
    if (state.retryTimeoutId) {
      clearTimeout(state.retryTimeoutId)
    }

    // Extract unit tags if available
    const unitTags = new Map<number, string>()
    if ('units' in call && Array.isArray(call.units)) {
      for (const unit of call.units) {
        if (unit.unit_id && unit.alpha_tag) {
          unitTags.set(unit.unit_id, unit.alpha_tag)
        }
      }
    }

    // If we have a current call, add it to history
    const history = state.currentCall
      ? [state.currentCall, ...state.history].slice(0, 20)
      : state.history

    // Use inline src_list if available, otherwise fetch separately
    const inlineTransmissions = 'src_list' in call && Array.isArray(call.src_list)
      ? call.src_list
      : []

    set({
      currentCall: queued,
      transmissions: inlineTransmissions,
      unitTags,
      playbackState: 'loading',
      currentTime: 0,
      duration: queued.duration,
      history,
      retryCount: 0,
      retryTimeoutId: null,
    })

    // Only fetch separately if no inline data
    if (inlineTransmissions.length === 0) {
      get().loadTransmissions(queued.callId)
    }
  },

  requestPlay: () => {
    const { playbackState } = get()
    if (playbackState === 'paused') {
      // Don't set playing here - wait for onPlay event
    }
  },

  requestPause: () => {
    const { playbackState } = get()
    if (playbackState === 'playing') {
      set({ playbackState: 'paused' })
    }
  },

  requestSeek: (time) => {
    set({ currentTime: time })
  },

  setVolume: (volume) => {
    set({ volume: Math.max(0, Math.min(1, volume)) })
  },

  toggleMute: () => {
    set((state) => ({ muted: !state.muted }))
  },

  skipNext: () => {
    const { queue } = get()
    if (queue.length > 0) {
      const [next, ...rest] = queue
      set({ queue: rest })
      get().loadCall(next)
    } else {
      set({
        playbackState: 'idle',
        currentCall: null,
        transmissions: [],
        unitTags: new Map(),
        currentTime: 0,
        duration: 0,
      })
    }
  },

  skipPrevious: () => {
    const { currentTime, history } = get()
    if (currentTime > 3) {
      set({ currentTime: 0 })
    } else if (history.length > 0) {
      const [prev, ...rest] = history
      set({ history: rest })
      get().loadCall(prev)
    }
  },

  addToQueue: (call) => {
    const queued = toQueuedCall(call)
    const { currentCall, playbackState, currentTime } = get()

    // Auto-load if: no call, idle, errored out, or previous call finished naturally
    // (paused at time 0 = call ended, vs paused mid-way = user paused)
    const shouldAutoLoad = !currentCall
      || playbackState === 'idle'
      || playbackState === 'error'
      || (playbackState === 'paused' && currentTime === 0)

    if (shouldAutoLoad) {
      get().loadCall(queued)
    } else {
      set((state) => ({ queue: [...state.queue, queued] }))
    }
  },

  removeFromQueue: (index) => {
    set((state) => ({
      queue: state.queue.filter((_, i) => i !== index),
    }))
  },

  clearQueue: () => set({ queue: [] }),

  setAutoPlay: (enabled) => set({ autoPlay: enabled }),

  // Audio element event handlers
  onLoadStart: () => {
    const { playbackState } = get()
    if (playbackState !== 'blocked') {
      set({ playbackState: 'loading' })
    }
  },

  onCanPlay: () => {
    // Audio is ready - component will attempt to play
  },

  onPlay: () => {
    set({ playbackState: 'playing' })
  },

  onPause: () => {
    const { playbackState } = get()
    if (playbackState === 'playing') {
      set({ playbackState: 'paused' })
    }
  },

  onEnded: () => {
    const { autoPlay, queue } = get()
    if (autoPlay && queue.length > 0) {
      get().skipNext()
    } else {
      set({ playbackState: 'paused', currentTime: 0 })
    }
  },

  onError: () => {
    const { queue, retryCount, currentCall, retryTimeoutId: existingTimeout } = get()

    if (retryCount < AUDIO_RETRY.MAX_ATTEMPTS && currentCall) {
      const delay = AUDIO_RETRY.INITIAL_DELAY_MS * Math.pow(AUDIO_RETRY.BACKOFF_MULTIPLIER, retryCount)
      console.warn(`Audio load failed, retrying in ${delay}ms (attempt ${retryCount + 1}/${AUDIO_RETRY.MAX_ATTEMPTS})`)

      if (existingTimeout) {
        clearTimeout(existingTimeout)
      }

      // Defer both retryCount increment and loading state to the timeout
      // so the AudioPlayer retry effect and handleCanPlay don't fire immediately
      const timeoutId = setTimeout(() => {
        set({
          retryCount: retryCount + 1,
          playbackState: 'loading',
          retryTimeoutId: null,
        })
      }, delay)

      set({
        retryTimeoutId: timeoutId,
        playbackState: 'error',
      })
      return
    }

    console.error('Audio playback error after retries, skipping to next')
    if (queue.length > 0) {
      get().skipNext()
    } else {
      set({ playbackState: 'error', retryCount: 0, retryTimeoutId: null })
    }
  },

  onTimeUpdate: (time, duration) => {
    set({ currentTime: time, duration })
  },

  onAutoplayBlocked: () => {
    set({ playbackState: 'blocked' })
  },

  unlockAndPlay: () => {
    // Called when user clicks to unlock audio
    // Component will handle the actual play() call
  },

  loadTransmissions: async (callId) => {
    try {
      const response = await getCallTransmissions(callId)
      set({ transmissions: response.transmissions })
    } catch (err) {
      console.error('Failed to load transmissions:', err)
    }
  },
}))

// Selectors for common derived state
export const selectIsPlaying = (state: AudioState) => state.playbackState === 'playing'
export const selectIsBlocked = (state: AudioState) => state.playbackState === 'blocked'
export const selectIsLoading = (state: AudioState) => state.playbackState === 'loading'
export const selectHasCall = (state: AudioState) => state.currentCall !== null
export const selectRetryCount = (state: AudioState) => state.retryCount
