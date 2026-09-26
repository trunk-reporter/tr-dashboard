import { create } from 'zustand'
import type {
  Call,
  UnitEvent,
  DecodeRate,
  Recorder,
} from '@/api/types'
import { getSSEManager, type ConnectionStatus } from '@/api/eventsource'
import { getActiveCalls } from '@/api/client'
import { useMonitorStore } from './useMonitorStore'
import { useAudioStore } from './useAudioStore'

interface RealtimeState {
  connectionStatus: ConnectionStatus
  activeCalls: Map<number, Call>           // keyed by call_id
  unitEvents: UnitEvent[]                  // rolling buffer, max 200
  decodeRates: Map<string, DecodeRate>      // keyed by sys_name (site short_name)
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
  /** Drop active calls whose call_end never arrived (resyncActiveCalls) */
  removeActiveCalls: (callIds: number[]) => void
  /** Drop everything received over the stream (the credential changed) */
  clearStreamData: () => void
}

/** Bumped whenever the active calls are cleared, so a resync in flight gives up */
let clearGeneration = 0

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
      const key = rate.sys_name || `system-${rate.system_id}`
      newRates.set(key, rate)
      return { decodeRates: newRates }
    }),

  handleRecorderUpdate: (recorder) =>
    set((state) => {
      const key = recorder.instance_id ? `${recorder.instance_id}:${recorder.id}` : recorder.id
      const existing = state.recorders.findIndex((r) => {
        const rKey = r.instance_id ? `${r.instance_id}:${r.id}` : r.id
        return rKey === key
      })
      if (existing >= 0) {
        const newRecorders = [...state.recorders]
        newRecorders[existing] = recorder
        return { recorders: newRecorders }
      }
      return { recorders: [...state.recorders, recorder] }
    }),

  clearActiveCalls: () => {
    clearGeneration++
    set({ activeCalls: new Map() })
  },

  removeActiveCalls: (callIds) =>
    set((state) => {
      if (!callIds.some((id) => state.activeCalls.has(id))) return state
      const newCalls = new Map(state.activeCalls)
      for (const id of callIds) newCalls.delete(id)
      return { activeCalls: newCalls }
    }),

  clearStreamData: () => {
    clearGeneration++
    set({ activeCalls: new Map(), unitEvents: [], decodeRates: new Map(), recorders: [] })
  },
}))

/** How often the live view re-checks its active calls against tr-engine */
export const ACTIVE_CALLS_RESYNC_MS = 60_000

/**
 * Drop active calls that tr-engine no longer lists (GET /calls/active, which
 * applies the caller's restriction). Their call_end may never arrive: after
 * the credential's access narrows, tr-engine keeps the stream open and
 * filters out later events for talkgroups it no longer allows, and a
 * disconnect longer than the stream's replay window loses events. Only calls
 * already held before the request are candidates, so a call_start that races
 * the request is kept. No request while nothing is active.
 */
export async function resyncActiveCalls(): Promise<void> {
  const held = [...useRealtimeStore.getState().activeCalls.keys()]
  if (held.length === 0) return
  const generation = clearGeneration
  let listed: Set<number>
  try {
    const res = await getActiveCalls()
    listed = new Set(res.calls.map((c) => c.call_id))
  } catch {
    return // try again next time
  }
  if (generation !== clearGeneration) return // cleared meanwhile (credential change)
  const gone = held.filter((id) => !listed.has(id))
  if (gone.length > 0) useRealtimeStore.getState().removeActiveCalls(gone)
}

// Initialize SSE connection and bind to store
export function initializeRealtimeConnection(): () => void {
  const sse = getSSEManager()
  const store = useRealtimeStore.getState()

  const unsubStatus = sse.onStatusChange((status) => {
    store.setConnectionStatus(status)
    if (status === 'disconnected') {
      store.clearActiveCalls()
    } else if (status === 'connected') {
      // (Re)connected: calls that ended while the stream was down are gone
      void resyncActiveCalls()
    }
  })
  // Calls whose call_end the stream will never deliver (resyncActiveCalls)
  const resyncTimer = setInterval(() => {
    if (sse.status === 'connected') void resyncActiveCalls()
  }, ACTIVE_CALLS_RESYNC_MS)

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
    // SSE sends sys_name (site short_name), use as display name if system_name absent
    const normalized = {
      ...rate,
      system_name: rate.system_name || rate.sys_name,
    }
    store.handleRateUpdate(normalized)
  })

  const unsubRecorder = sse.on('recorder_update', (recorder) => {
    store.handleRecorderUpdate(recorder)
  })

  sse.connect()

  return () => {
    unsubStatus()
    clearInterval(resyncTimer)
    // unsubStatus() runs first, so the 'disconnected' status below no longer
    // clears the active calls: do it here
    store.clearActiveCalls()
    unsubCallStart()
    unsubCallUpdate()
    unsubCallEnd()
    unsubUnit()
    unsubRate()
    unsubRecorder()
    sse.disconnect()
  }
}
