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
    }
  },
}))
