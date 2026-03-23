import { useState, useEffect, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/useAuthStore'
import { refreshAuth } from '@/api/client'

interface RequireAuthProps {
  children: ReactNode
}

export function RequireAuth({ children }: RequireAuthProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const setAuth = useAuthStore((s) => s.setAuth)
  const [checking, setChecking] = useState(!isAuthenticated)
  // When backend has no JWT auth configured, login endpoints return 404.
  // In that case, skip auth entirely and let legacy token mode work.
  const [authDisabled, setAuthDisabled] = useState(false)

  // On mount, attempt silent token refresh if not authenticated
  useEffect(() => {
    if (isAuthenticated) return

    let cancelled = false
    refreshAuth().then((result) => {
      if (cancelled) return
      if (result === null) {
        // Refresh failed — could be expired or backend has no JWT auth.
        // Probe the login endpoint to distinguish.
        fetch('/api/v1/auth/login', { method: 'OPTIONS' }).then((res) => {
          if (cancelled) return
          if (res.status === 404 || res.status === 405) {
            // Login endpoint doesn't exist — backend running in legacy token mode
            setAuthDisabled(true)
          }
          setChecking(false)
        }).catch(() => {
          if (!cancelled) {
            // Network error — can't determine auth state.
            // Don't bypass auth; let the !isAuthenticated check redirect to /login.
            setChecking(false)
          }
        })
        return
      }
      setAuth(result.access_token, result.user)
      setChecking(false)
    })

    return () => { cancelled = true }
  }, [isAuthenticated, setAuth])

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  // Backend has no JWT auth — skip login, run in legacy mode
  if (authDisabled) {
    return <>{children}</>
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
