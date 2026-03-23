import type {
  SSEEventType,
  Call,
  UnitEvent,
  Recorder,
  DecodeRate,
} from './types'

import { useAuthStore } from '@/stores/useAuthStore'

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export interface SSEFilters {
  systems?: string
  sites?: string
  tgids?: string
  units?: string
  types?: string
  emergency_only?: boolean
}

// Map SSE event types to their payload types
interface SSEEventPayloads {
  call_start: Call
  call_update: Partial<Call> & { call_id: number }
  call_end: Call
  unit_event: UnitEvent
  recorder_update: Recorder
  rate_update: DecodeRate
  trunking_message: unknown
  console: unknown
}

type EventHandler<T> = (data: T) => void
type StatusChangeHandler = (status: ConnectionStatus) => void

export class SSEManager {
  private es: EventSource | null = null
  private filters: SSEFilters
  private handlers = new Map<string, Set<EventHandler<unknown>>>()
  private statusHandlers = new Set<StatusChangeHandler>()
  private _status: ConnectionStatus = 'disconnected'

  constructor(filters?: SSEFilters) {
    this.filters = filters ?? {}
  }

  get status(): ConnectionStatus {
    return this._status
  }

  private setStatus(status: ConnectionStatus) {
    if (this._status === status) return
    this._status = status
    this.statusHandlers.forEach((h) => h(status))
  }

  connect(): void {
    if (this.es) {
      this.es.close()
    }

    const url = this.buildUrl()
    this.setStatus('connecting')

    try {
      this.es = new EventSource(url)

      this.es.onopen = () => {
        console.log('SSE connected to tr-engine')
        this.setStatus('connected')
      }

      this.es.onerror = () => {
        // EventSource auto-reconnects on error.
        // readyState CONNECTING means it's retrying; CLOSED means it gave up.
        if (this.es?.readyState === EventSource.CONNECTING) {
          console.log('SSE connection lost, reconnecting...')
          this.setStatus('connecting')
        } else {
          console.error('SSE connection failed')
          this.setStatus('error')
        }
      }

      // Register a listener for each known SSE event type
      const eventTypes: SSEEventType[] = [
        'call_start', 'call_update', 'call_end',
        'unit_event', 'recorder_update', 'rate_update',
        'trunking_message', 'console',
      ]

      for (const eventType of eventTypes) {
        this.es.addEventListener(eventType, (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data)
            this.dispatch(eventType, data)
          } catch (err) {
            console.error(`Failed to parse SSE ${eventType} event:`, err)
          }
        })
      }
    } catch (err) {
      console.error('Failed to create EventSource:', err)
      this.setStatus('error')
    }
  }

  disconnect(): void {
    if (this.es) {
      this.es.close()
      this.es = null
    }
    this.setStatus('disconnected')
  }

  reconnect(newFilters?: SSEFilters): void {
    if (newFilters) {
      this.filters = newFilters
    }
    this.disconnect()
    this.connect()
  }

  on<E extends SSEEventType>(
    event: E,
    handler: EventHandler<SSEEventPayloads[E]>
  ): () => void {
    let handlerSet = this.handlers.get(event)
    if (!handlerSet) {
      handlerSet = new Set()
      this.handlers.set(event, handlerSet)
    }
    handlerSet.add(handler as EventHandler<unknown>)

    return () => {
      handlerSet!.delete(handler as EventHandler<unknown>)
    }
  }

  onStatusChange(handler: StatusChangeHandler): () => void {
    this.statusHandlers.add(handler)
    return () => {
      this.statusHandlers.delete(handler)
    }
  }

  private buildUrl(): string {
    const params = new URLSearchParams()
    if (this.filters.systems) params.set('systems', this.filters.systems)
    if (this.filters.sites) params.set('sites', this.filters.sites)
    if (this.filters.tgids) params.set('tgids', this.filters.tgids)
    if (this.filters.units) params.set('units', this.filters.units)
    if (this.filters.types) params.set('types', this.filters.types)
    if (this.filters.emergency_only) params.set('emergency_only', 'true')

    // Security tradeoff: the EventSource API cannot send custom headers, so
    // we pass the JWT as a query parameter. This has the same exposure risk as
    // getCallAudioUrl (server logs, browser history, Referrer). Mitigated by:
    // short token lifetime (1 hr) and same-origin requests. Long-term: consider
    // a fetch-based SSE wrapper (ReadableStream) that can send Auth headers.
    const { accessToken } = useAuthStore.getState()
    if (accessToken) {
      params.set('token', accessToken)
    }

    const query = params.toString()
    return `/api/v1/events/stream${query ? `?${query}` : ''}`
  }

  private dispatch(event: string, data: unknown): void {
    const handlerSet = this.handlers.get(event)
    if (handlerSet) {
      handlerSet.forEach((h) => h(data))
    }
  }
}

// Singleton instance
let sseManager: SSEManager | null = null
export function getSSEManager(filters?: SSEFilters): SSEManager {
  if (!sseManager) {
    sseManager = new SSEManager(filters)

    // Reconnect SSE when access token changes (e.g. after refresh)
    // so the new token is used in the ?token= query param.
    let prevToken = useAuthStore.getState().accessToken
    useAuthStore.subscribe((state) => {
      if (state.accessToken !== prevToken) {
        prevToken = state.accessToken
        if (sseManager) {
          if (state.accessToken) {
            // Token changed (e.g. after refresh) — reconnect with new token
            if (sseManager.status !== 'disconnected') {
              sseManager.reconnect()
            }
          } else {
            // Token cleared (logout) — disconnect instead of reconnecting
            sseManager.disconnect()
          }
        }
      }
    })
  }
  return sseManager
}
