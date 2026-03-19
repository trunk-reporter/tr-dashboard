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

  // On mount, attempt silent token refresh if not authenticated
  useEffect(() => {
    if (isAuthenticated) return

    let cancelled = false
    refreshAuth().then((result) => {
      if (cancelled) return
      if (result) {
        setAuth(result.access_token, result.user)
      }
      setChecking(false)
    })

    return () => { cancelled = true }
  }, [isAuthenticated, setAuth])

  // Show nothing while checking refresh
  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
