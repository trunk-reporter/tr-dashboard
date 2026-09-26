import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/useAuthStore'
import { forgetKey } from '@/api/auth'
import { formatDateTime } from '@/lib/utils'
import { KeyForm } from './ConnectKey'

/** Settings card: the stored API key (name, prefix, scopes) with replace and forget */
export function ApiKeyCard() {
  const whoami = useAuthStore((s) => s.whoami)
  const key = whoami?.key ?? null
  const [replacing, setReplacing] = useState(false)
  const [forgetting, setForgetting] = useState(false)

  const anonymousListen = whoami?.anonymous.access === 'listen'

  const handleForget = async () => {
    const note = anonymousListen
      ? 'You will browse without a key (read-only).'
      : 'This tr-engine needs a key, so you will be asked for one.'
    if (!window.confirm(`Forget the API key "${key?.name ?? ''}" in this browser? ${note}`)) return
    setForgetting(true)
    try {
      await forgetKey()
    } finally {
      setForgetting(false)
    }
  }

  return (
    <Card data-testid="api-key-card">
      <CardHeader>
        <CardTitle>API key</CardTitle>
        <CardDescription>
          tr-dashboard sends this key to tr-engine as <span className="font-mono">Authorization: Bearer</span>.
          It is stored in this browser only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {key ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium" data-testid="api-key-name">{key.name}</span>
              <span className="font-mono text-sm text-muted-foreground">{key.prefix}…</span>
              {key.scopes.map((scope) => (
                <Badge key={scope} variant="secondary" className="text-[10px]">{scope}</Badge>
              ))}
              {whoami?.restricted && (
                <Badge variant="warning" className="text-[10px]">restricted</Badge>
              )}
              {key.legacy && (
                <Badge variant="outline" className="text-[10px]">legacy</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Can: {whoami?.scopes.join(', ') || 'nothing'}
              {whoami?.restricted && ' — limited to some systems or talkgroups; units, stats and recorders are unavailable'}
              {key.expires_at && ` · expires ${formatDateTime(key.expires_at)}`}
            </p>
            {key.legacy && (
              <p className="text-xs text-warning">
                This key was imported from an old AUTH_TOKEN or WRITE_TOKEN. Ask the operator for a named key and use that instead.
              </p>
            )}
            {!replacing && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setReplacing(true)}>
                  Replace
                </Button>
                <Button variant="outline" size="sm" onClick={handleForget} disabled={forgetting}>
                  {forgetting ? 'Forgetting...' : 'Forget'}
                </Button>
              </div>
            )}
            {replacing && (
              <KeyForm
                submitLabel="Use this key"
                autoFocus
                onConnected={() => setReplacing(false)}
                onCancel={() => setReplacing(false)}
              />
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground" data-testid="api-key-none">
              No key: browsing with this tr-engine's anonymous access
              {whoami?.restricted ? ' (read-only, limited to some systems or talkgroups)' : ' (read-only)'}.
              Paste a key to edit tags or manage the engine.
            </p>
            <KeyForm submitLabel="Use this key" />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
