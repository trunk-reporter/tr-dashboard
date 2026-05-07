import { useAuthStore, type AuthMode } from '@/stores/useAuthStore'
import { API_BASE } from '@/api/client'

const VALID_MODES = new Set<AuthMode>(['open', 'token', 'full'])

export interface AuthInitResult {
  mode: AuthMode
  readToken: string
  jwtEnabled: boolean
}

export async function detectAuthMode(): Promise<AuthInitResult | null> {
  const current = useAuthStore.getState()

  if (current.authState === 'open' || current.authState === 'token' || current.authState === 'authenticated') {
    return {
      mode: current.authMode!,
      readToken: current.readToken,
      jwtEnabled: current.jwtEnabled,
    }
  }

  // Check for a persisted token (survives page refresh since authState resets to idle
  // but readToken/writeToken are preserved via persist middleware).
  if (current.authState === 'idle' && (current.readToken || current.writeToken)) {
    const token = current.readToken || current.writeToken
    useAuthStore.getState().setToken(token)
    return { mode: 'token', readToken: token, jwtEnabled: false }
  }

  useAuthStore.getState().setDetecting()

  try {
    const res = await fetch(`${API_BASE}/auth-init`)
    if (!res.ok) {
      console.error(`auth-init returned ${res.status} ${res.statusText}`)
      useAuthStore.getState().setError(`auth-init returned ${res.status}`)
      return null
    }

    let data: any
    try {
      data = await res.json()
    } catch (parseErr) {
      console.error('auth-init returned OK but body is not valid JSON:', parseErr)
      useAuthStore.getState().setError('Invalid response from auth-init')
      return null
    }

    if (!data || typeof data !== 'object') {
      useAuthStore.getState().setError('Invalid auth-init response')
      return null
    }

    if (data.mode && VALID_MODES.has(data.mode)) {
      const mode = data.mode as AuthMode
      const readToken = data.read_token || ''
      const jwtEnabled = data.jwt_enabled ?? false
      useAuthStore.getState().setAuthInit(mode, readToken, jwtEnabled)
      return { mode, readToken, jwtEnabled }
    }

    if (data.mode) {
      console.warn(`auth-init returned unrecognized mode: "${data.mode}", requiring login`)
      useAuthStore.getState().setLoginRequired()
      return { mode: 'full', readToken: '', jwtEnabled: true }
    }

    // Fallback: no mode field — assume open
    const readToken = data.token || ''
    useAuthStore.getState().setOpen(readToken)
    return { mode: 'open', readToken, jwtEnabled: false }
  } catch (err) {
    console.error('auth-init fetch failed:', err)
    useAuthStore.getState().setError('Unable to connect to the API. Check that tr-engine is running.')
    return null
  }
}
