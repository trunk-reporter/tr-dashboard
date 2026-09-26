import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { components } from '@/api/generated'

export type Scope = components['schemas']['Scope']
export type Whoami = components['schemas']['Whoami']

/**
 * Auth status, decided by AuthGate from `GET /whoami`:
 *   loading        → whoami in flight (first load or retry)
 *   ready          → browse: with the stored key, or anonymously when the
 *                    engine's anonymous access policy is `listen`
 *   needs-key      → no key stored and anonymous access is `off`
 *   invalid-key    → the stored key was rejected (401 invalid_key), can only
 *                    upload, or was ignored by the engine
 *   engine-too-old → /whoami is missing (404) or answered a 401 without an
 *                    API-key error code: the engine predates API keys
 *   error          → network failure or unexpected response; retryable
 */
export type AuthStatus = 'loading' | 'ready' | 'needs-key' | 'invalid-key' | 'engine-too-old' | 'error'

interface AuthStore {
  /** The API key sent as `Authorization: Bearer`; '' when browsing without one */
  apiKey: string
  /**
   * True while `apiKey` is a v2 `writeToken` carried over by the persist
   * migration and not yet accepted by /whoami (it may be an imported legacy
   * token, or a value the engine no longer knows). A rejected candidate is
   * dropped silently instead of showing the key screen.
   */
  candidateKey: boolean
  /** Latest /whoami for the current credential (the anonymous one while on the key screen) */
  whoami: Whoami | null
  status: AuthStatus
  /** Explanation for invalid-key / error */
  error: string
  /** whoami.restricted, kept as a field so components can subscribe to it */
  restricted: boolean

  setLoading: () => void
  /** Store a key /whoami accepted, with its whoami */
  setKey: (apiKey: string, whoami: Whoami) => void
  /** Browse without a key (anonymous access `listen`), or land on needs-key when it is `off` */
  setAnonymous: (whoami: Whoami) => void
  /** Drop the stored key without deciding the status (callers re-run whoami) */
  dropKey: () => void
  setInvalidKey: (message: string, anonymous: Whoami | null) => void
  setEngineTooOld: () => void
  setError: (message: string) => void
  /** Refresh whoami for the current credential without changing status */
  updateWhoami: (whoami: Whoami) => void

  hasScope: (scope: Scope) => boolean
  canEdit: () => boolean
  isAdmin: () => boolean
}

export function scopesAllow(whoami: Whoami | null, scope: Scope): boolean {
  return !!whoami && whoami.scopes.includes(scope)
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      apiKey: '',
      candidateKey: false,
      whoami: null,
      status: 'loading',
      error: '',
      restricted: false,

      setLoading: () => set({ status: 'loading', error: '' }),

      setKey: (apiKey, whoami) =>
        set({ apiKey, candidateKey: false, whoami, restricted: whoami.restricted, status: 'ready', error: '' }),

      setAnonymous: (whoami) =>
        set({
          apiKey: '',
          candidateKey: false,
          whoami,
          restricted: whoami.restricted,
          status: whoami.scopes.includes('listen') ? 'ready' : 'needs-key',
          error: '',
        }),

      dropKey: () => set({ apiKey: '', candidateKey: false }),

      setInvalidKey: (message, anonymous) =>
        set({ status: 'invalid-key', error: message, whoami: anonymous, restricted: anonymous?.restricted ?? false }),

      setEngineTooOld: () => set({ status: 'engine-too-old', error: '' }),

      setError: (message) => set({ status: 'error', error: message }),

      updateWhoami: (whoami) => set({ whoami, restricted: whoami.restricted }),

      hasScope: (scope) => scopesAllow(get().whoami, scope),
      canEdit: () => scopesAllow(get().whoami, 'edit'),
      isAdmin: () => scopesAllow(get().whoami, 'admin'),
    }),
    {
      name: 'tr-dashboard-auth',
      version: 3,
      partialize: (state) => ({
        apiKey: state.apiKey,
        candidateKey: state.candidateKey,
      }),
      // v0–v2 persisted only `writeToken` (a WRITE_TOKEN, a token-mode
      // AUTH_TOKEN or an API key pasted in Settings). The engine may have
      // imported it as a legacy key, so it becomes a candidate key that
      // AuthGate keeps only if /whoami accepts it.
      migrate: (persisted: unknown, version: number) => {
        const old = (persisted && typeof persisted === 'object' ? persisted : {}) as Record<string, unknown>
        if (version < 3) {
          const token = typeof old.writeToken === 'string' ? old.writeToken.trim() : ''
          return { apiKey: token, candidateKey: token !== '' }
        }
        return {
          apiKey: typeof old.apiKey === 'string' ? old.apiKey : '',
          candidateKey: old.candidateKey === true,
        }
      },
    }
  )
)

/** Reactive scope check for components */
export function useHasScope(scope: Scope): boolean {
  return useAuthStore((s) => scopesAllow(s.whoami, scope))
}

export function useCanEdit(): boolean {
  return useHasScope('edit')
}

export function useIsAdmin(): boolean {
  return useHasScope('admin')
}

/** True when a restriction applies: Deny endpoints are unavailable */
export function useRestricted(): boolean {
  return useAuthStore((s) => s.restricted)
}
