import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/stores/useAuthStore'
import { login, setupFirstUser, checkNeedsSetup } from '@/api/client'

export default function Login() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const authMode = useAuthStore((s) => s.authMode)
  const jwtEnabled = useAuthStore((s) => s.jwtEnabled)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [setupMode, setSetupMode] = useState(false)
  const [checkingSetup, setCheckingSetup] = useState(true)

  const needsLogin = authMode === 'full' && jwtEnabled

  useEffect(() => {
    // Auth mode not yet determined — wait for RequireAuth to fetch auth-init
    if (authMode === null) return

    // No JWT login available — redirect to home
    if (!needsLogin) {
      navigate('/', { replace: true })
      return
    }

    checkNeedsSetup().then((needs) => {
      setSetupMode(needs)
      setCheckingSetup(false)
    }).catch(() => {
      setError('Could not determine setup status. Check your connection and reload.')
      setCheckingSetup(false)
    })
  }, [authMode, needsLogin, navigate])

  // Show loading while auth mode is being determined
  if (authMode === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) return

    setError('')
    setLoading(true)

    try {
      const result = await login(username.trim(), password)
      setAuth(result.access_token, result.user)
      navigate('/', { replace: true })
    } catch (err: any) {
      const msg = err?.data?.error || err?.message || 'Login failed'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) return

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setError('')
    setLoading(true)

    try {
      const result = await setupFirstUser(username.trim(), password)
      setAuth(result.access_token, result.user)
      navigate('/', { replace: true })
    } catch (err: any) {
      if (err?.status === 409) {
        // Setup already completed — switch to login mode
        setSetupMode(false)
        setError('Setup already completed. Please sign in.')
        setPassword('')
        setConfirmPassword('')
      } else {
        const msg = err?.data?.error || err?.message || 'Setup failed'
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  if (checkingSetup) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="text-primary text-2xl">&#9673;</span>
            <span className="text-xl font-semibold">tr-dashboard</span>
          </div>
          {setupMode ? (
            <>
              <CardTitle>First-Time Setup</CardTitle>
              <CardDescription>Create the admin account to get started</CardDescription>
            </>
          ) : (
            <>
              <CardTitle>Sign In</CardTitle>
              <CardDescription>Enter your credentials to access the dashboard</CardDescription>
            </>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={setupMode ? handleSetup : handleLogin} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="username" className="text-sm font-medium">
                Username
              </label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                autoComplete={setupMode ? 'off' : 'username'}
                autoFocus
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={setupMode ? 'Min 8 characters' : 'Password'}
                autoComplete={setupMode ? 'new-password' : 'current-password'}
                disabled={loading}
              />
            </div>
            {setupMode && (
              <div className="space-y-2">
                <label htmlFor="confirm-password" className="text-sm font-medium">
                  Confirm Password
                </label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  autoComplete="new-password"
                  disabled={loading}
                />
              </div>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={loading || !username.trim() || !password || (setupMode && !confirmPassword)}
            >
              {loading
                ? (setupMode ? 'Creating account...' : 'Signing in...')
                : (setupMode ? 'Create Admin Account' : 'Sign In')
              }
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
