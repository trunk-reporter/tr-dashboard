import type {
  SSEEventType,
  SSEAuthSignal,
  Call,
  UnitEvent,
  Recorder,
  DecodeRate,
} from './types'

import { useAuthStore } from '@/stores/useAuthStore'
import { API_BASE, ApiError } from './client'
import { recheckAuth } from './auth'
import { getTicket, appendTicket, SSE_TICKET_MIN_REMAINING_MS } from './tickets'

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
  transcription: { call_id: number; system_id: number; tgid: number; text?: string } & Record<string, unknown>
  unit_event: UnitEvent
  recorder_update: Recorder
  rate_update: DecodeRate
  trunking_message: unknown
  console: unknown
}

type EventHandler<T> = (data: T) => void
type StatusChangeHandler = (status: ConnectionStatus) => void

// Reconnect backoff after an error: 1s, 2s, 4s ... capped at 30s, ±20% jitter.
const BACKOFF_INITIAL_MS = 1000
const BACKOFF_MAX_MS = 30_000
// Consecutive failures without an open before re-checking /whoami: a stream
// refused with 401/403 looks like any other error to EventSource.
const FAILURES_BEFORE_RECHECK = 3

/**
 * The event stream. EventSource can't send headers, so with a stored key it
 * connects with `?ticket=`, minted right before every (re)connect. The
 * browser's own reconnect would reuse an expired ticket, so on `error` the
 * manager closes and reconnects itself with a fresh ticket, `last_event_id`
 * (gapless resume) and backoff. Without a key it connects bare and the
 * anonymous access policy applies.
 *
 * The engine closes streams whose credential no longer allows them with
 * `event: auth`: on `ticket_expired` the manager reconnects with a new ticket;
 * on any other code it stops and re-runs /whoami (which shows the key screen
 * when the key was revoked).
 */
export class SSEManager {
  private es: EventSource | null = null
  private filters: SSEFilters
  private handlers = new Map<string, Set<EventHandler<unknown>>>()
  private statusHandlers = new Set<StatusChangeHandler>()
  private _status: ConnectionStatus = 'disconnected'

  /** True between connect() and disconnect() */
  private wanted = false
  /** Bumped by every open/disconnect; a stale async open() gives up */
  private generation = 0
  private lastEventId = ''
  private failures = 0
  private backoffMs = BACKOFF_INITIAL_MS
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

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
    this.wanted = true
    this.backoffMs = BACKOFF_INITIAL_MS
    this.failures = 0
    void this.open(false)
  }

  disconnect(): void {
    this.wanted = false
    this.generation++
    this.clearReconnectTimer()
    this.closeSource()
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

  private closeSource(): void {
    if (this.es) {
      this.es.close()
      this.es = null
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  /** Stop for good after an auth signal or an unusable key; /whoami decides what's next */
  private stopForAuth(): void {
    this.wanted = false
    this.generation++
    this.clearReconnectTimer()
    this.closeSource()
    this.setStatus('error')
    void recheckAuth()
  }

  private scheduleReconnect(): void {
    if (!this.wanted) return
    this.clearReconnectTimer()
    const jitter = 0.8 + Math.random() * 0.4
    const delay = Math.round(this.backoffMs * jitter)
    this.backoffMs = Math.min(this.backoffMs * 2, BACKOFF_MAX_MS)
    this.setStatus('connecting')
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      // A fresh ticket: the error may have been the old one being refused
      void this.open(true)
    }, delay)
  }

  private async open(freshTicket: boolean): Promise<void> {
    const generation = ++this.generation
    this.clearReconnectTimer()
    this.closeSource()
    if (!this.wanted) return
    this.setStatus('connecting')

    let ticket: string | null = null
    try {
      ticket = await getTicket({ minRemaining: SSE_TICKET_MIN_REMAINING_MS, fresh: freshTicket })
    } catch (err) {
      if (generation !== this.generation) return
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        // Key revoked (request() already re-runs /whoami) or can't mint.
        console.error('SSE: could not mint a ticket:', err.message)
        this.stopForAuth()
        return
      }
      console.warn('SSE: ticket mint failed, retrying:', err)
      this.scheduleReconnect()
      return
    }
    if (generation !== this.generation || !this.wanted) return

    try {
      const es = new EventSource(this.buildUrl(ticket))
      this.es = es

      es.onopen = () => {
        if (this.es !== es) return
        console.log('SSE connected to tr-engine')
        this.failures = 0
        this.backoffMs = BACKOFF_INITIAL_MS
        this.setStatus('connected')
      }

      es.onerror = () => {
        if (this.es !== es) return
        // Don't let the browser retry with the same (possibly expired) ticket.
        this.closeSource()
        this.failures++
        console.log('SSE connection lost, reconnecting...')
        if (this.failures >= FAILURES_BEFORE_RECHECK) {
          // Maybe the key was revoked or anonymous access turned off.
          void recheckAuth()
        }
        this.scheduleReconnect()
      }

      es.addEventListener('auth', (event: MessageEvent) => {
        if (this.es !== es) return
        let code: SSEAuthSignal['code'] | undefined
        try {
          code = (JSON.parse(event.data) as SSEAuthSignal).code
        } catch {
          // unparseable: treat as a non-ticket auth loss
        }
        this.closeSource()
        if (code === 'ticket_expired') {
          void this.open(true)
        } else {
          console.warn(`SSE closed by tr-engine: ${code ?? 'auth'}`)
          this.stopForAuth()
        }
      })

      // Register a listener for each known SSE event type
      const eventTypes: SSEEventType[] = [
        'call_start', 'call_update', 'call_end',
        'unit_event', 'recorder_update', 'rate_update',
        'trunking_message', 'console',
      ]

      for (const eventType of eventTypes) {
        es.addEventListener(eventType, (event: MessageEvent) => {
          if (event.lastEventId) this.lastEventId = event.lastEventId
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
      this.scheduleReconnect()
    }
  }

  private buildUrl(ticket: string | null): string {
    const params = new URLSearchParams()
    if (this.filters.systems) params.set('systems', this.filters.systems)
    if (this.filters.sites) params.set('sites', this.filters.sites)
    if (this.filters.tgids) params.set('tgids', this.filters.tgids)
    if (this.filters.units) params.set('units', this.filters.units)
    if (this.filters.types) params.set('types', this.filters.types)
    if (this.filters.emergency_only) params.set('emergency_only', 'true')
    // A re-created EventSource can't send the Last-Event-ID header.
    if (this.lastEventId) params.set('last_event_id', this.lastEventId)

    const query = params.toString()
    return appendTicket(`${API_BASE}/events/stream${query ? `?${query}` : ''}`, ticket)
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

    // Reconnect whenever the key is set, replaced or forgotten: the stream's
    // credential (a ticket minted with the key, or none) changes with it.
    useAuthStore.subscribe((state, prev) => {
      if (state.apiKey !== prev.apiKey && sseManager && sseManager.status !== 'disconnected') {
        sseManager.reconnect()
      }
    })
  }
  return sseManager
}
