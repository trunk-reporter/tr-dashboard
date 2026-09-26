import { useAuthStore } from '@/stores/useAuthStore'
import { mintTicket } from '@/api/client'

/**
 * Tickets for the URLs a browser can't attach an Authorization header to
 * (`EventSource`, `<audio src>`). A ticket is short-lived and listen-only,
 * and is minted with the stored key (POST /tickets). Without a key there is
 * no ticket: those URLs then go out bare and use the anonymous policy.
 *
 * One ticket is cached per key. Callers say how much lifetime they need:
 * media 5 minutes (an <audio> element keeps making Range requests while it
 * plays and seeks), the event stream 60 seconds (the engine closes a ticket
 * stream at expiry with `ticket_expired`, and the manager reconnects).
 */

const TICKET_TTL_SECONDS = 600
export const MEDIA_TICKET_MIN_REMAINING_MS = 5 * 60 * 1000
export const SSE_TICKET_MIN_REMAINING_MS = 60 * 1000

interface CachedTicket {
  key: string
  ticket: string
  /** Local-clock expiry: measured from when the mint was requested, so a skewed clock can't overstate it */
  expiresAt: number
}

let cached: CachedTicket | null = null
let inflight: { key: string; promise: Promise<CachedTicket> } | null = null

function mint(key: string): Promise<CachedTicket> {
  if (inflight && inflight.key === key) return inflight.promise
  const requestedAt = Date.now()
  const promise = mintTicket(TICKET_TTL_SECONDS)
    .then((res) => {
      // The engine clamps ttl_seconds to 60–3600, so it grants the 600 asked
      // for. Counting from the local request time (not the server's
      // expires_at) keeps a skewed client clock from misjudging the lifetime.
      const ticket: CachedTicket = { key, ticket: res.ticket, expiresAt: requestedAt + TICKET_TTL_SECONDS * 1000 }
      if (useAuthStore.getState().apiKey === key) cached = ticket
      return ticket
    })
    .finally(() => {
      if (inflight?.promise === promise) inflight = null
    })
  inflight = { key, promise }
  return promise
}

/**
 * A ticket with at least `minRemaining` ms left: the cached one, or a newly
 * minted one. `fresh` always mints (after a media error or `ticket_expired`).
 * Resolves to null when no key is stored. Rejects with the ApiError of a
 * failed mint (a 401 invalid_key also re-runs /whoami via request()).
 */
export async function getTicket(options: { minRemaining?: number; fresh?: boolean } = {}): Promise<string | null> {
  const key = useAuthStore.getState().apiKey
  if (!key) return null
  const minRemaining = options.minRemaining ?? SSE_TICKET_MIN_REMAINING_MS

  if (!options.fresh && cached && cached.key === key && cached.expiresAt - Date.now() >= minRemaining) {
    return cached.ticket
  }
  if (options.fresh && cached?.key === key) cached = null

  const minted = await mint(key)
  return minted.ticket
}

/** The cached ticket when it has `minRemaining` left, synchronously; null otherwise */
export function peekTicket(minRemaining: number): string | null {
  const key = useAuthStore.getState().apiKey
  if (!key || !cached || cached.key !== key) return null
  return cached.expiresAt - Date.now() >= minRemaining ? cached.ticket : null
}

export function appendTicket(url: string, ticket: string | null): string {
  if (!ticket) return url
  return `${url}${url.includes('?') ? '&' : '?'}ticket=${encodeURIComponent(ticket)}`
}

/**
 * `url` (a call audio URL from callAudioUrl) with a ticket when a key is
 * stored. If minting fails the bare URL is returned: it still works under an
 * anonymous `listen` policy, and otherwise the media error path retries.
 */
export async function mediaUrl(url: string, fresh = false): Promise<string> {
  try {
    return appendTicket(url, await getTicket({ minRemaining: MEDIA_TICKET_MIN_REMAINING_MS, fresh }))
  } catch (err) {
    console.warn('Could not mint an audio ticket:', err)
    return url
  }
}
