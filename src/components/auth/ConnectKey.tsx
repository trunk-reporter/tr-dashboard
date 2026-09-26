import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/stores/useAuthStore'
import { connectKey, continueWithoutKey } from '@/api/auth'

interface KeyFormProps {
  submitLabel?: string
  autoFocus?: boolean
  onConnected?: () => void
  onCancel?: () => void
}

/**
 * Paste-a-key form: validates the key with GET /whoami and stores it. Keys
 * whose scopes lack `listen` (upload-only keys) are rejected.
 */
export function KeyForm({ submitLabel = 'Connect', autoFocus, onConnected, onCancel }: KeyFormProps) {
  const [value, setValue] = useState('')
  const [reveal, setReveal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const problem = await connectKey(value)
      if (problem) {
        setError(problem)
      } else {
        setValue('')
        onConnected?.()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3" data-testid="key-form">
      {error && (
        <div role="alert" className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          type={reveal ? 'text' : 'password'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="tre_..."
          aria-label="API key"
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          disabled={busy}
          className="font-mono"
        />
        <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => setReveal((v) => !v)}>
          {reveal ? 'Hide' : 'Show'}
        </Button>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !value.trim()}>
          {busy ? 'Checking...' : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}

/** Full-page "Connect to tr-engine" screen (AuthGate: needs-key, invalid-key) */
export function ConnectKey() {
  const status = useAuthStore((s) => s.status)
  const error = useAuthStore((s) => s.error)
  const anonymousListen = useAuthStore((s) => s.whoami?.anonymous.access === 'listen')
  const [continuing, setContinuing] = useState(false)

  const rejected = status === 'invalid-key'

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md" data-testid="connect-key">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="text-primary text-2xl">&#9673;</span>
            <span className="text-xl font-semibold">tr-dashboard</span>
          </div>
          <CardTitle>Connect to tr-engine</CardTitle>
          <CardDescription>
            {rejected
              ? 'Your API key was not accepted. Paste another key.'
              : 'This tr-engine needs an API key. Paste the key you were given.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {rejected && error && (
            <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning" data-testid="key-rejected">
              {error}
            </div>
          )}

          <KeyForm autoFocus />

          {rejected && anonymousListen && (
            <Button
              variant="outline"
              className="w-full"
              disabled={continuing}
              onClick={async () => {
                setContinuing(true)
                try {
                  await continueWithoutKey()
                } finally {
                  setContinuing(false)
                }
              }}
            >
              Continue without a key
            </Button>
          )}

          <p className="text-xs text-muted-foreground">
            A key with <span className="font-mono">listen</span> lets you browse and play audio;{' '}
            <span className="font-mono">edit</span> also lets you change talkgroup and unit tags;{' '}
            <span className="font-mono">admin</span> also manages keys and the engine. The key is
            kept in this browser only. Operators create keys on the Access page, or on the engine
            host with <span className="font-mono">tr-engine keys create --name "tr-dashboard" --scopes listen</span>.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
