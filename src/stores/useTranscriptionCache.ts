import { create } from 'zustand'
import { getCallTranscription } from '@/api/client'
import type { Transcription } from '@/api/types'

type TranscriptionStatus = 'idle' | 'loading' | 'loaded' | 'none'

interface TranscriptionEntry {
  status: TranscriptionStatus
  transcription?: Transcription
}

interface TranscriptionCacheState {
  cache: Map<number, TranscriptionEntry>

  getEntry: (callId: number) => TranscriptionEntry | undefined
  fetchTranscription: (callId: number) => Promise<void>
}

// Simple concurrency limiter to avoid 429s from the backend rate limiter
const MAX_CONCURRENT = 6
let activeRequests = 0
const pendingQueue: Array<() => void> = []

function acquireSlot(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT) {
    activeRequests++
    return Promise.resolve()
  }
  return new Promise<void>((resolve) => {
    pendingQueue.push(() => {
      activeRequests++
      resolve()
    })
  })
}

function releaseSlot(): void {
  activeRequests--
  const next = pendingQueue.shift()
  if (next) next()
}

export const useTranscriptionCache = create<TranscriptionCacheState>((set, get) => ({
  cache: new Map(),

  getEntry: (callId) => get().cache.get(callId),

  fetchTranscription: async (callId) => {
    const existing = get().cache.get(callId)
    if (existing && existing.status !== 'idle') {
      return
    }

    // Mark as loading
    set((state) => {
      const newCache = new Map(state.cache)
      newCache.set(callId, { status: 'loading' })
      return { cache: newCache }
    })

    await acquireSlot()

    try {
      const transcription = await getCallTranscription(callId)
      set((state) => {
        const newCache = new Map(state.cache)
        newCache.set(callId, {
          status: 'loaded',
          transcription,
        })
        return { cache: newCache }
      })
    } catch {
      // No transcription available (404) or other error
      set((state) => {
        const newCache = new Map(state.cache)
        newCache.set(callId, { status: 'none' })
        return { cache: newCache }
      })
    } finally {
      releaseSlot()
    }
  },
}))
