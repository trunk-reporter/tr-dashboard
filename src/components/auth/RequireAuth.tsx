import { useState, useEffect, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore, type AuthMode } from '@/stores/useAuthStore'
import { refreshAuth } from '@/api/client'

const VALID_MODES = new Set<AuthMode>(['open', 'token', 'full'])

interface RequireAuthProps {
  children: ReactNode
}

export function RequireAuth({ children }: RequireAuthProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const setAuth = useAuthStore((s) => s.setAuth)
  const setAuthInit = useAuthStore((s) => s.setAuthInit)
  const [checking, setChecking] = useState(true)
  const [authRequired, setAuthRequired] = useState(false)
  const [authError, setAuthError] = useState(false)

  useEffect(() => {
    if (isAuthenticated) {
      setChecking(false)
      return
    }

    let cancelled = false

    async function detectAuthMode() {
      let mode: AuthMode = 'full'
      let readToken = ''
      let jwtEnabled = true
      let fetchFailed = false

      try {
        const res = await fetch('/api/v1/auth-init')
        if (!res.ok) {
          console.error(`auth-init returned ${res.status} ${res.statusText}`)
          fetchFailed = true
        } else {
          let data: any
          try {
            data = await res.json()
          } catch (parseErr) {
            console.error('auth-init returned OK but body is not valid JSON:', parseErr)
            fetchFailed = true
          }

          if (data && typeof data === 'object') {
            if (data.mode && VALID_MODES.has(data.mode)) {
              // New mode-based response (tr-engine v0.10+)
              mode = data.mode
              readToken = data.read_token || ''
              jwtEnabled = data.jwt_enabled ?? false
            } else if (data.mode) {
              // Unrecognized mode — fail safe by requiring auth
              console.warn(`auth-init returned unrecognized mode: "${data.mode}", requiring login`)
              mode = 'full'
              jwtEnabled = true
            } else if ('token' in data) {
              // Legacy response: { token, guest_access }
              readToken = data.token || ''
              if (data.guest_access) {
                // guest_access means no login required; if there's a read token
                // treat as full mode with guest read, otherwise truly open
                mode = readToken ? 'full' : 'open'
                jwtEnabled = false
              } else {
                mode = 'full'
                jwtEnabled = true
              }
            }
          }
        }
      } catch (err) {
        console.error('auth-init fetch failed:', err)
        fetchFailed = true
      }

      if (cancelled) return

      if (fetchFailed) {
        // Cannot determine auth mode — show error rather than silently granting access
        setAuthError(true)
        setChecking(false)
        return
      }

      setAuthInit(mode, readToken, jwtEnabled)

      // Only full mode with JWT requires login; all other modes skip auth
      if (mode === 'full' && jwtEnabled) {
        const result = await refreshAuth()
        if (cancelled) return
        if (result) {
          setAuth(result.access_token, result.user)
        } else {
          setAuthRequired(true)
        }
      }

      setChecking(false)
    }

    detectAuthMode()
    return () => { cancelled = true }
  }, [isAuthenticated, setAuth, setAuthInit])

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (authError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <div className="text-destructive font-medium">Unable to connect to the API</div>
          <div className="text-sm text-muted-foreground">
            Could not determine authentication mode. Check that tr-engine is running.
          </div>
          <button
            onClick={() => window.location.reload()}
            className="text-sm text-primary underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (authRequired && !isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
