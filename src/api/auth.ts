import { useAuthStore, type Whoami } from '@/stores/useAuthStore'
import { API_BASE, onAuthFailure } from '@/api/client'

/** Outcome of one GET /whoami */
export type WhoamiResult =
  | { kind: 'ok'; whoami: Whoami }
  | { kind: 'invalid-key'; message: string }
  | { kind: 'too-old' }
  | { kind: 'error'; message: string }

export const ENGINE_TOO_OLD_MESSAGE = "This tr-engine doesn't support API keys yet — upgrade tr-engine."
const UPLOAD_ONLY_MESSAGE = 'This key can only upload; use a listen, edit or admin key.'
const IGNORED_KEY_MESSAGE =
  "tr-engine ignored this value: it is the retired public AUTH_TOKEN, not an API key. Ask the operator for an API key."

function isWhoami(data: unknown): data is Whoami {
  if (!data || typeof data !== 'object') return false
  const w = data as Partial<Whoami>
  return (
    (w.credential === 'key' || w.credential === 'anonymous') &&
    Array.isArray(w.scopes) &&
    typeof w.restricted === 'boolean' &&
    !!w.anonymous && typeof w.anonymous === 'object' &&
    (w.anonymous.access === 'off' || w.anonymous.access === 'listen')
  )
}

/**
 * GET /whoami with `key` in the Authorization header (none when empty). Raw
 * fetch rather than request(): the key may not be stored yet, and a 401 here
 * must not trigger the auth-failure handler.
 */
export async function fetchWhoami(key: string): Promise<WhoamiResult> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}/whoami`, {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
      cache: 'no-store',
    })
  } catch {
    return { kind: 'error', message: 'Unable to connect to the API. Check that tr-engine is running.' }
  }

  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    // not JSON; handled below
  }
  const body = (data ?? {}) as { code?: unknown; error?: unknown }

  // Engines before API keys have no /whoami (404), or guard every route with
  // their own 401 (token/full mode) that carries no API-key error code.
  if (res.status === 404) return { kind: 'too-old' }
  if (res.status === 401) {
    if (body.code === 'invalid_key') {
      const detail = typeof body.error === 'string' && body.error ? body.error : 'unknown, revoked or expired key'
      return { kind: 'invalid-key', message: `tr-engine rejected this key (${detail}).` }
    }
    return { kind: 'too-old' }
  }
  if (!res.ok) {
    const detail = typeof body.error === 'string' && body.error ? `: ${body.error}` : ''
    return { kind: 'error', message: `tr-engine returned ${res.status}${detail}` }
  }
  if (!isWhoami(data)) {
    return {
      kind: 'error',
      message: `Unexpected response from ${API_BASE}/whoami. Check that your reverse proxy forwards ${API_BASE} to tr-engine.`,
    }
  }
  return { kind: 'ok', whoami: data }
}

/** Why a key /whoami answered 200 for can't be used by the dashboard, or null */
function keyProblem(whoami: Whoami): string | null {
  // The retired full-mode public token is treated as no credential.
  if (whoami.credential !== 'key') return IGNORED_KEY_MESSAGE
  if (!whoami.scopes.includes('listen')) return UPLOAD_ONLY_MESSAGE
  return null
}

async function anonymousWhoami(): Promise<Whoami | null> {
  const r = await fetchWhoami('')
  return r.kind === 'ok' ? r.whoami : null
}

/**
 * Decide the auth status from /whoami for the stored key (or none). It never
 * shows 'loading' itself, so a background re-check doesn't unmount the app.
 */
async function resolveAuth(): Promise<void> {
  const store = useAuthStore.getState
  const key = store().apiKey

  if (key) {
    const r = await fetchWhoami(key)
    if (store().apiKey !== key) return // the key changed meanwhile; that change resolved it
    switch (r.kind) {
      case 'ok': {
        const problem = keyProblem(r.whoami)
        if (!problem) {
          store().setKey(key, r.whoami)
          return
        }
        if (store().candidateKey) {
          store().dropKey()
          break
        }
        store().setInvalidKey(problem, await anonymousWhoami())
        return
      }
      case 'invalid-key': {
        if (store().candidateKey) {
          // A carried-over write token the engine didn't import: forget it quietly.
          store().dropKey()
          break
        }
        store().setInvalidKey(r.message, await anonymousWhoami())
        return
      }
      case 'too-old':
        store().setEngineTooOld()
        return
      case 'error':
        if (store().status !== 'ready') store().setError(r.message)
        return
    }
  }

  const r = await fetchWhoami('')
  if (store().apiKey) return
  switch (r.kind) {
    case 'ok':
      store().setAnonymous(r.whoami)
      return
    case 'too-old':
      store().setEngineTooOld()
      return
    case 'invalid-key':
    case 'error':
      if (store().status !== 'ready') store().setError(r.kind === 'error' ? r.message : 'Unexpected invalid_key without a key')
      return
  }
}

let inflight: Promise<void> | null = null

/** Re-run /whoami in the background (deduplicated); the status changes only if the answer does */
export function recheckAuth(): Promise<void> {
  if (!inflight) {
    inflight = resolveAuth().finally(() => {
      inflight = null
    })
  }
  return inflight
}

/** Show the loading screen and resolve from scratch (first load, Retry) */
export function initAuth(): Promise<void> {
  if (!inflight) useAuthStore.getState().setLoading()
  return recheckAuth()
}

// 401 invalid_key (or key_required without a key) from any API call, and a
// 403 restricted_credential from a Deny endpoint: re-check whoami.
onAuthFailure(() => {
  void recheckAuth()
})

/**
 * Validate a pasted key with /whoami and store it. Returns an error message,
 * or null once the key is stored and the status is 'ready'.
 */
export async function connectKey(raw: string): Promise<string | null> {
  const key = raw.trim()
  if (!key) return 'Paste an API key.'
  if (/\s/.test(key)) return 'An API key has no spaces or line breaks.'

  const r = await fetchWhoami(key)
  switch (r.kind) {
    case 'ok': {
      const problem = keyProblem(r.whoami)
      if (problem) return problem
      useAuthStore.getState().setKey(key, r.whoami)
      return null
    }
    case 'invalid-key':
      return r.message
    case 'too-old':
      return ENGINE_TOO_OLD_MESSAGE
    case 'error':
      return r.message
  }
}

/**
 * Forget the stored key. Browses anonymously when the engine allows it,
 * otherwise AuthGate shows the key screen.
 */
export async function forgetKey(): Promise<void> {
  const r = await fetchWhoami('')
  const store = useAuthStore.getState()
  switch (r.kind) {
    case 'ok':
      store.setAnonymous(r.whoami)
      return
    case 'too-old':
      store.dropKey()
      store.setEngineTooOld()
      return
    default:
      store.dropKey()
      store.setError(r.kind === 'error' ? r.message : 'Unexpected response from /whoami')
  }
}

/** "Continue without a key" on the invalid-key screen */
export async function continueWithoutKey(): Promise<void> {
  useAuthStore.getState().dropKey()
  // A re-check still running for the dropped key returns without deciding.
  if (inflight) await inflight
  return recheckAuth()
}
