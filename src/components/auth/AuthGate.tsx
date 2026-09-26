import { useEffect } from 'react'
import { useAuthStore } from '@/stores/useAuthStore'
import { initAuth, ENGINE_TOO_OLD_MESSAGE } from '@/api/auth'
import { API_BASE } from '@/api/client'
import { ConnectKey } from './ConnectKey'

interface AuthGateProps {
  children: React.ReactNode
}

function FullPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      {children}
    </div>
  )
}

/**
 * Asks GET /whoami what the stored key (or no key) may do before rendering
 * the app: the key screen when a key is needed or was rejected, an upgrade
 * notice for engines without API keys, otherwise the children. Anonymous
 * visitors browse read-only when the engine's anonymous access is `listen`.
 */
export function AuthGate({ children }: AuthGateProps) {
  const status = useAuthStore((s) => s.status)
  const error = useAuthStore((s) => s.error)

  useEffect(() => {
    if (useAuthStore.getState().status === 'loading') {
      void initAuth()
    }
  }, [])

  switch (status) {
    case 'loading':
      return (
        <FullPage>
          <div className="text-muted-foreground">Connecting to tr-engine...</div>
        </FullPage>
      )

    case 'ready':
      return <>{children}</>

    case 'needs-key':
    case 'invalid-key':
      return <ConnectKey />

    case 'engine-too-old':
      return (
        <FullPage>
          <div className="max-w-md text-center space-y-2" data-testid="engine-too-old">
            <div className="font-medium">{ENGINE_TOO_OLD_MESSAGE}</div>
            <div className="text-sm text-muted-foreground">
              This dashboard authenticates with API keys, which need a newer tr-engine.
              If tr-engine is already up to date, check that your reverse proxy
              forwards {API_BASE} to it.
            </div>
            <button
              onClick={() => void initAuth()}
              className="text-sm text-primary underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        </FullPage>
      )

    case 'error':
      return (
        <FullPage>
          <div className="text-center space-y-2">
            <div className="text-destructive font-medium">Unable to connect to the API</div>
            <div className="text-sm text-muted-foreground">
              {error || 'Check that tr-engine is running.'}
            </div>
            <button
              onClick={() => void initAuth()}
              className="text-sm text-primary underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        </FullPage>
      )
  }
}
