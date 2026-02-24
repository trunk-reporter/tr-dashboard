import { create } from 'zustand'
import type {
  Call,
  UnitEvent,
  DecodeRate,
  Recorder,
} from '@/api/types'
import { getSSEManager, type ConnectionStatus } from '@/api/eventsource'
import { useMonitorStore } from './useMonitorStore'
import { useAudioStore } from './useAudioStore'

interface RealtimeState {
  connectionStatus: ConnectionStatus
  activeCalls: Map<number, Call>           // keyed by call_id
  unitEvents: UnitEvent[]                  // rolling buffer, max 200
  decodeRates: Map<number, DecodeRate>     // keyed by system_id
  recorders: Recorder[]

  // Actions
  setConnectionStatus: (status: ConnectionStatus) => void
  handleCallStart: (call: Call) => void
  handleCallUpdate: (update: Partial<Call> & { call_id: number }) => void
  handleCallEnd: (call: Call) => void
  handleUnitEvent: (event: UnitEvent) => void
  handleRateUpdate: (rate: DecodeRate) => void
  handleRecorderUpdate: (recorder: Recorder) => void
  clearActiveCalls: () => void
}

export const useRealtimeStore = create<RealtimeState>((set) => ({
  connectionStatus: 'disconnected',
  activeCalls: new Map(),
  unitEvents: [],
  decodeRates: new Map(),
  recorders: [],

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  handleCallStart: (call) =>
    set((state) => {
      const newCalls = new Map(state.activeCalls)
      newCalls.set(call.call_id, call)
      return { activeCalls: newCalls }
    }),

  handleCallUpdate: (update) =>
    set((state) => {
      const existing = state.activeCalls.get(update.call_id)
      if (!existing) return state
      const newCalls = new Map(state.activeCalls)
      newCalls.set(update.call_id, { ...existing, ...update })
      return { activeCalls: newCalls }
    }),

  handleCallEnd: (call) =>
    set((state) => {
      const newCalls = new Map(state.activeCalls)
      newCalls.delete(call.call_id)
      return { activeCalls: newCalls }
    }),

  handleUnitEvent: (event) =>
    set((state) => ({
      unitEvents: [event, ...state.unitEvents].slice(0, 200),
    })),

  handleRateUpdate: (rate) =>
    set((state) => {
      const newRates = new Map(state.decodeRates)
      newRates.set(rate.system_id, rate)
      return { decodeRates: newRates }
    }),

  handleRecorderUpdate: (recorder) =>
    set((state) => {
      const existing = state.recorders.findIndex((r) => r.id === recorder.id)
      if (existing >= 0) {
        const newRecorders = [...state.recorders]
        newRecorders[existing] = recorder
        return { recorders: newRecorders }
      }
      return { recorders: [...state.recorders, recorder] }
    }),

  clearActiveCalls: () => set({ activeCalls: new Map() }),
}))

// Initialize SSE connection and bind to store
export function initializeRealtimeConnection(): () => void {
  const sse = getSSEManager()
  const store = useRealtimeStore.getState()

  const unsubStatus = sse.onStatusChange((status) => {
    store.setConnectionStatus(status)
    if (status === 'disconnected') {
      store.clearActiveCalls()
    }
  })

  const unsubCallStart = sse.on('call_start', (call) => {
    store.handleCallStart(call)
  })

  const unsubCallUpdate = sse.on('call_update', (update) => {
    store.handleCallUpdate(update)
  })

  const unsubCallEnd = sse.on('call_end', (call) => {
    store.handleCallEnd(call)

    // Check if this talkgroup is monitored and queue for audio playback
    const monitorState = useMonitorStore.getState()
    if (monitorState.isMonitoring && monitorState.isMonitored(call.system_id, call.tgid)) {
      useAudioStore.getState().addToQueue(call)
    }
  })

  const unsubUnit = sse.on('unit_event', (event) => {
    store.handleUnitEvent(event)
  })

  const unsubRate = sse.on('rate_update', (rate) => {
    store.handleRateUpdate(rate)
  })

  const unsubRecorder = sse.on('recorder_update', (recorder) => {
    store.handleRecorderUpdate(recorder)
  })

  sse.connect()

  return () => {
    unsubStatus()
    unsubCallStart()
    unsubCallUpdate()
    unsubCallEnd()
    unsubUnit()
    unsubRate()
    unsubRecorder()
    sse.disconnect()
  }
}
