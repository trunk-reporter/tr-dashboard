import { create } from 'zustand'
import type {
  CallStartData,
  CallEndData,
  CallActiveData,
  AudioAvailableData,
  UnitEventData,
  RateUpdateData,
  RecorderUpdateData,
  RecentCallInfo,
} from '@/api/types'
import { getWebSocketManager, type ConnectionStatus } from '@/api/websocket'
import { useMonitorStore } from './useMonitorStore'
import { useAudioStore } from './useAudioStore'
import { useTalkgroupCache } from './useTalkgroupCache'
import { useTranscriptionCache } from './useTranscriptionCache'

// Delay before queuing audio after audio_available event (ms)
// Gives backend time to finish writing the file to disk
const AUDIO_QUEUE_DELAY_MS = 500

// Delay before fetching transcription after audio_available event (ms)
// Transcription processing takes longer than audio file creation
const TRANSCRIPTION_FETCH_DELAY_MS = 5000

export interface ActiveCall {
  system: string
  sysid: string
  talkgroup: number
  tgAlphaTag?: string
  unit: number
  unitAlphaTag?: string
  freq: number
  encrypted: boolean
  emergency: boolean
  elapsed: number              // Server-provided elapsed time in seconds
  elapsedReceivedAt: number    // Client timestamp (Date.now()) when elapsed was received
  isActive: boolean            // false when call has ended but slot is preserved
  endedAt?: number             // Client timestamp when call ended
}

export interface UnitActivity {
  system: string
  sysid: string
  unit: number
  unitAlphaTag?: string
  eventType: string
  talkgroup: number
  time: number
}

export interface DecodeRate {
  system: string
  sysid: string
  decodeRate: number
  maxRate: number
  controlChannel: number
  time: number
}

export interface RecorderState {
  system: string
  recNum: number
  state: number
  stateName: string
  freq: number
  talkgroup: number
  tgAlphaTag?: string
  unit: number
}

interface RealtimeState {
  connectionStatus: ConnectionStatus
  activeCalls: Map<string, ActiveCall>
  recentCalls: RecentCallInfo[]
  unitEvents: UnitActivity[]
  decodeRates: Map<string, DecodeRate>
  recorders: Map<string, RecorderState>

  // Actions
  setConnectionStatus: (status: ConnectionStatus) => void
  handleCallStart: (data: CallStartData, timestamp: number) => void
  handleCallEnd: (data: CallEndData) => void
  handleCallActive: (data: CallActiveData, timestamp: number) => void
  handleAudioAvailable: (data: AudioAvailableData) => void
  handleUnitEvent: (data: UnitEventData, timestamp: number) => void
  handleRateUpdate: (data: RateUpdateData, timestamp: number) => void
  handleRecorderUpdate: (data: RecorderUpdateData) => void
  clearActiveCalls: () => void
}

function getCallKey(system: string, talkgroup: number): string {
  return `${system}:${talkgroup}`
}

function getRecorderKey(system: string, recNum: number): string {
  return `${system}:${recNum}`
}

// Clean up ended calls older than this (2 minutes)
const ENDED_CALL_TTL_MS = 2 * 60 * 1000

function cleanupOldEndedCalls(calls: Map<string, ActiveCall>): Map<string, ActiveCall> {
  const now = Date.now()
  const newCalls = new Map<string, ActiveCall>()
  for (const [key, call] of calls) {
    // Keep active calls and ended calls that aren't too old
    if (call.isActive || !call.endedAt || (now - call.endedAt) < ENDED_CALL_TTL_MS) {
      newCalls.set(key, call)
    }
  }
  return newCalls
}

export const useRealtimeStore = create<RealtimeState>((set) => ({
  connectionStatus: 'disconnected',
  activeCalls: new Map(),
  recentCalls: [],
  unitEvents: [],
  decodeRates: new Map(),
  recorders: new Map(),

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  handleCallStart: (data, _timestamp) =>
    set((state) => {
      const key = getCallKey(data.system, data.talkgroup)
      // Clean up old ended calls periodically
      const newCalls = cleanupOldEndedCalls(state.activeCalls)
      // Use client time to track when we received this event
      const now = Date.now()
      newCalls.set(key, {
        system: data.system,
        sysid: data.sysid,
        talkgroup: data.talkgroup,
        tgAlphaTag: data.talkgroup_alpha_tag,
        unit: data.unit,
        unitAlphaTag: data.unit_alpha_tag,
        freq: data.freq,
        encrypted: data.encrypted,
        emergency: data.emergency,
        elapsed: 0,
        elapsedReceivedAt: now,
        isActive: true,
      })
      return { activeCalls: newCalls }
    }),

  handleCallEnd: (data) =>
    set((state) => {
      const key = getCallKey(data.system, data.talkgroup)
      const existing = state.activeCalls.get(key)
      if (!existing) return state

      const newCalls = new Map(state.activeCalls)
      // Mark as inactive instead of deleting - preserve the slot
      // Update unit info in case it changed, and capture alpha tag if provided
      newCalls.set(key, {
        ...existing,
        unit: data.unit,
        unitAlphaTag: data.unit_alpha_tag || existing.unitAlphaTag,
        isActive: false,
        endedAt: Date.now(),
        elapsed: data.duration,
      })
      return { activeCalls: newCalls }
    }),

  handleCallActive: (data, _timestamp) =>
    set((state) => {
      const key = getCallKey(data.system, data.talkgroup)
      const existing = state.activeCalls.get(key)
      const newCalls = new Map(state.activeCalls)
      // Use client time to track when we received this elapsed value
      const now = Date.now()

      if (existing && existing.isActive) {
        // Preserve unitAlphaTag if unit hasn't changed, otherwise clear it
        // (CallActiveData doesn't include unit_alpha_tag)
        const unitAlphaTag = existing.unit === data.unit ? existing.unitAlphaTag : undefined
        newCalls.set(key, {
          ...existing,
          unit: data.unit,
          unitAlphaTag,
          elapsed: data.elapsed,
          elapsedReceivedAt: now,
        })
      } else {
        // New call or replacing an ended call
        // Note: CallActiveData doesn't include unit_alpha_tag
        newCalls.set(key, {
          system: data.system,
          sysid: data.sysid,
          talkgroup: data.talkgroup,
          tgAlphaTag: data.tg_alpha_tag,
          unit: data.unit,
          unitAlphaTag: undefined,
          freq: data.freq,
          encrypted: data.encrypted,
          emergency: data.emergency,
          elapsed: data.elapsed,
          elapsedReceivedAt: now,
          isActive: true,
        })
      }

      return { activeCalls: newCalls }
    }),

  handleAudioAvailable: (data) =>
    set((state) => {
      const newCall: RecentCallInfo = {
        call_id: data.call_id,
        tr_call_id: data.tr_call_id,
        call_num: 0,
        start_time: new Date(Date.now() - data.duration * 1000).toISOString(),
        stop_time: new Date().toISOString(),
        duration: data.duration,
        system: data.system,
        sysid: data.sysid,
        tgid: data.talkgroup,
        tg_alpha_tag: data.talkgroup_alpha_tag,
        freq: 0,
        encrypted: false,
        emergency: false,
        audio_url: `/api/v1/calls/${data.call_id}/audio`,
        has_audio: true,
        units: [],
      }

      return {
        recentCalls: [newCall, ...state.recentCalls].slice(0, 100),
      }
    }),

  handleUnitEvent: (data, timestamp) =>
    set((state) => ({
      unitEvents: [
        {
          system: data.system,
          sysid: data.sysid,
          unit: data.unit,
          unitAlphaTag: data.unit_tag,
          eventType: data.event_type,
          talkgroup: data.talkgroup,
          time: timestamp,
        },
        ...state.unitEvents,
      ].slice(0, 200),
    })),

  handleRateUpdate: (data, timestamp) =>
    set((state) => {
      const newRates = new Map(state.decodeRates)
      newRates.set(data.system, {
        system: data.system,
        sysid: data.sysid,
        decodeRate: data.decode_rate,
        maxRate: data.max_rate,
        controlChannel: data.control_channel,
        time: timestamp,
      })
      return { decodeRates: newRates }
    }),

  handleRecorderUpdate: (data) =>
    set((state) => {
      const key = getRecorderKey(data.system, data.rec_num)
      const newRecorders = new Map(state.recorders)
      newRecorders.set(key, {
        system: data.system,
        recNum: data.rec_num,
        state: data.state,
        stateName: data.state_name,
        freq: data.freq,
        talkgroup: data.talkgroup,
        tgAlphaTag: data.tg_alpha_tag,
        unit: data.unit,
      })
      return { recorders: newRecorders }
    }),

  clearActiveCalls: () => set({ activeCalls: new Map() }),
}))

// Initialize WebSocket connection and bind to store
export function initializeRealtimeConnection(): () => void {
  const ws = getWebSocketManager()
  const store = useRealtimeStore.getState()

  const unsubscribeStatus = ws.onStatusChange((status) => {
    store.setConnectionStatus(status)
    if (status === 'disconnected') {
      store.clearActiveCalls()
    }
  })

  const unsubCallStart = ws.on('call_start', (data, ts) => {
    store.handleCallStart(data, ts)
    // Cache talkgroup alpha tag if available
    if (data.sysid && data.talkgroup_alpha_tag) {
      useTalkgroupCache.getState().addFromCall(data.sysid, data.talkgroup, data.talkgroup_alpha_tag)
    }
  })
  const unsubCallEnd = ws.on('call_end', (data) => store.handleCallEnd(data))
  const unsubCallActive = ws.on('call_active', (data, ts) => {
    store.handleCallActive(data, ts)
    // Cache talkgroup alpha tag if available
    if (data.sysid && data.tg_alpha_tag) {
      useTalkgroupCache.getState().addFromCall(data.sysid, data.talkgroup, data.tg_alpha_tag)
    }
  })
  const unsubAudio = ws.on('audio_available', (data) => {
    store.handleAudioAvailable(data)

    // Cache talkgroup alpha tag if available
    if (data.sysid && data.talkgroup_alpha_tag) {
      useTalkgroupCache.getState().addFromCall(data.sysid, data.talkgroup, data.talkgroup_alpha_tag)
    }

    // Schedule transcription fetch after delay (gives backend time to process)
    setTimeout(() => {
      useTranscriptionCache.getState().fetchTranscription(data.call_id)
    }, TRANSCRIPTION_FETCH_DELAY_MS)

    // Check if this talkgroup is being monitored
    const monitorState = useMonitorStore.getState()
    const isMonitored = data.sysid
      ? monitorState.isMonitored(data.sysid, data.talkgroup)
      : monitorState.isMonitoredByTgid(data.talkgroup)

    if (monitorState.isMonitoring && isMonitored) {
      // Create a call object for playback
      const callForPlayback: RecentCallInfo = {
        call_id: data.call_id,
        tr_call_id: data.tr_call_id,
        call_num: 0,
        start_time: new Date(Date.now() - data.duration * 1000).toISOString(),
        stop_time: new Date().toISOString(),
        duration: data.duration,
        system: data.system,
        sysid: data.sysid,
        tgid: data.talkgroup,
        tg_alpha_tag: data.talkgroup_alpha_tag,
        freq: 0,
        encrypted: false,
        emergency: false,
        audio_url: `/api/v1/calls/${data.call_id}/audio`,
        has_audio: true,
        units: [],
      }

      // Delay audio queue to give backend time to finish writing the file
      setTimeout(() => {
        useAudioStore.getState().addToQueue(callForPlayback)
      }, AUDIO_QUEUE_DELAY_MS)
    }
  })
  const unsubUnit = ws.on('unit_event', (data, ts) => store.handleUnitEvent(data, ts))
  const unsubRate = ws.on('rate_update', (data, ts) => store.handleRateUpdate(data, ts))
  const unsubRecorder = ws.on('recorder_update', (data) => store.handleRecorderUpdate(data))

  ws.connect()
  ws.subscribe(['calls', 'units', 'rates', 'recorders'])

  return () => {
    unsubscribeStatus()
    unsubCallStart()
    unsubCallEnd()
    unsubCallActive()
    unsubAudio()
    unsubUnit()
    unsubRate()
    unsubRecorder()
    ws.disconnect()
  }
}
