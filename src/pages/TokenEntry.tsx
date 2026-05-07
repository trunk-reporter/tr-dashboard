import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { KeyRound } from 'lucide-react'
import { useAuthStore } from '@/stores/useAuthStore'

export default function TokenEntry() {
  const navigate = useNavigate()
  const setToken = useAuthStore((s) => s.setToken)
  const [tokenInput, setTokenInput] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = tokenInput.trim()
    if (!trimmed) {
      setError('Please enter your API token.')
      return
    }

    setError('')
    setLoading(true)

    try {
      // In token mode, AUTH_TOKEN is a single shared token used for all API calls.
      // Set it in readToken so RequireAuth allows access, and the API client
      // will include it in the Authorization header for every request.
      // The backend decides whether this token grants read-only or write access.
      setToken(trimmed)
      navigate('/', { replace: true })
    } catch {
      setError('Failed to authenticate. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <KeyRound className="h-6 w-6 text-primary" />
            <span className="text-xl font-semibold">tr-dashboard</span>
          </div>
          <CardTitle>API Token Required</CardTitle>
          <CardDescription>
            Your tr-engine instance uses a shared API token for authentication. Enter your token to access the dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="api-token" className="text-sm font-medium">
                API Token
              </label>
              <Input
                id="api-token"
                type="password"
                value={tokenInput}
                onChange={(e) => { setTokenInput(e.target.value); setError('') }}
                placeholder="Paste your AUTH_TOKEN or WRITE_TOKEN"
                autoFocus
                disabled={loading}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                This token may be read-only or write-capable depending on your tr-engine WRITE_TOKEN/JWT configuration.
              </p>
            </div>
            <Button type="submit" className="w-full" disabled={loading || !tokenInput.trim()}>
              {loading ? 'Authenticating...' : 'Continue'}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Your token is stored locally in your browser. You can change it later in Settings.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
