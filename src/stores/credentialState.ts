import { create } from 'zustand'
import { useAuthStore, type Whoami } from './useAuthStore'
import { useAudioStore } from './useAudioStore'
import { useRealtimeStore } from './useRealtimeStore'
import { useTranscriptionCache } from './useTranscriptionCache'
import { useAlertStore } from './useAlertStore'
import { resetAlertCooldowns } from '@/hooks/useAlertEngine'

/**
 * Drop client state that holds data fetched or streamed with the previous
 * credential: the player (current call, queue, history), what arrived over
 * the event stream (active calls, unit events, decode rates, recorders),
 * cached transcriptions and the alert history (persisted, and its messages
 * name talkgroups, systems and units; the alert rules are the user's own and
 * stay). React Query's cache goes with the QueryProvider that App keys on the
 * API key and the credential epoch; these stores live outside it.
 */
export function clearCredentialBoundState(): void {
  useAudioStore.getState().reset()
  useRealtimeStore.getState().clearStreamData()
  useTranscriptionCache.getState().clear()
  useAlertStore.getState().clearHistory()
  resetAlertCooldowns()
}

/**
 * Bumped when the current credential's access narrows while the key stays
 * the same (installCredentialReset). App keys the QueryProvider on the key and
 * this epoch, so the pages remount with an empty cache and the event stream
 * reconnects, as they do when the key changes.
 */
export const useCredentialEpoch = create<{ epoch: number }>(() => ({ epoch: 0 }))

/** A whoami's own restriction lists in a comparable form ('' when it has none) */
function restrictionOf(w: Whoami): string {
  const r = w.key?.restriction
  if (!r) return ''
  return JSON.stringify([
    !!r.allow_all,
    [...(r.systems ?? [])].sort((a, b) => a - b),
    [...(r.talkgroups ?? [])].sort(),
    [...(r.exclude_talkgroups ?? [])].sort(),
  ])
}

/**
 * True when `next` (a later /whoami for the same stored key, or for no key)
 * may allow less than `prev`: a scope lost, a restriction added or changed, the
 * key rejected. tr-engine applies such a change to open streams in place and
 * filters out later events, including the call_end of a call that started
 * before, so what the dashboard already holds would otherwise stay on screen.
 * Widening (a restriction lifted, a scope added) keeps it. An anonymous
 * /whoami carries no restriction lists, so a change among restricted
 * anonymous policies is invisible here; the live view's active-call re-sync
 * (useRealtimeStore) covers that case.
 */
export function accessNarrowed(prev: Whoami, next: Whoami | null): boolean {
  if (!next) return true
  if (prev.credential !== next.credential) return true
  if ((prev.key?.id ?? null) !== (next.key?.id ?? null)) return true
  if (prev.scopes.some((s) => !next.scopes.includes(s))) return true
  if (!next.restricted) return false
  if (!prev.restricted) return true
  return restrictionOf(prev) !== restrictionOf(next)
}

let installed = false
/** The current credential's latest /whoami; null until it is known */
let known: Whoami | null = null

/**
 * Clear credential-bound state whenever the API key is set, replaced or
 * forgotten (in this tab or, through the storage sync, in another one), and
 * whenever a later /whoami for the same key (or for no key) shows narrower
 * access, so nothing seen with the previous credential stays visible under
 * the new one.
 */
export function installCredentialReset(): void {
  if (installed) return
  installed = true
  known = useAuthStore.getState().whoami
  useAuthStore.subscribe((state, prev) => {
    if (state.apiKey !== prev.apiKey) {
      clearCredentialBoundState()
      // setKey/setAnonymous bring the new credential's whoami in the same
      // update; a bare key change (dropKey, another tab's key) does not.
      known = state.whoami !== prev.whoami ? state.whoami : null
      return
    }
    if (state.whoami === prev.whoami) return
    const before = known
    known = state.whoami
    if (before && accessNarrowed(before, state.whoami)) {
      clearCredentialBoundState()
      useCredentialEpoch.setState((s) => ({ epoch: s.epoch + 1 }))
    }
  })
}
