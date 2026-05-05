import { useEffect, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/useAuthStore'
import { refreshAuth } from '@/api/client'
import { detectAuthMode } from '@/api/auth-init'

interface RequireAuthProps {
  children: React.ReactNode
}

export function RequireAuth({ children }: RequireAuthProps) {
  const authState = useAuthStore((s) => s.authState)
  const errorMessage = useAuthStore((s) => s.errorMessage)
  const setAuth = useAuthStore((s) => s.setAuth)
  const setLoginRequired = useAuthStore((s) => s.setLoginRequired)

  const init = useCallback(async () => {
    const result = await detectAuthMode()
    if (!result) return

    if (result.mode === 'full' && result.jwtEnabled) {
      const refreshResult = await refreshAuth()
      if (refreshResult) {
        setAuth(refreshResult.access_token, refreshResult.user)
      } else {
        setLoginRequired()
      }
    }
  }, [setAuth, setLoginRequired])

  useEffect(() => {
    if (authState === 'idle') {
      init()
    }
  }, [authState, init])

  switch (authState) {
    case 'idle':
    case 'detecting':
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      )

    case 'open':
    case 'token':
      return <>{children}</>

    case 'authenticated':
      return <>{children}</>

    case 'login-required':
      return <Navigate to="/login" replace />

    case 'error':
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="text-center space-y-2">
            <div className="text-destructive font-medium">Unable to connect to the API</div>
            <div className="text-sm text-muted-foreground">
              {errorMessage || 'Could not determine authentication mode. Check that tr-engine is running.'}
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
}
