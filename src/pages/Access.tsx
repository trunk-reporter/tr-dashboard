import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import {
  RestrictionEditor,
  EMPTY_DRAFT,
  draftFromRestriction,
  restrictionFromDraft,
  restrictionAllowsNothing,
  describeRestriction,
  type RestrictionDraft,
} from '@/components/auth/RestrictionEditor'
import {
  listKeys,
  createKey,
  updateKey,
  revokeKey,
  getAnonymousAccess,
  putAnonymousAccess,
  getAuditLog,
  getSystems,
  describeError,
} from '@/api/client'
import { recheckAuth } from '@/api/auth'
import { useIsAdmin } from '@/stores/useAuthStore'
import type {
  APIKey,
  APIKeyCreated,
  APIKeyPatch,
  AnonymousAccess,
  AnonymousAccessLevel,
  AuditLogEntry,
  Scope,
  System,
} from '@/api/types'
import { formatDateTime, formatRelativeTime, cn } from '@/lib/utils'
import { copyText } from '@/lib/clipboard'
import {
  EXPIRY_DATE_HINT,
  expiryFromDate,
  dateFromExpiry,
  expiryDateProblem,
  minExpiryDate,
} from '@/lib/apiKeyInput'

// The engine names the key it mints on first start this way (§10.1)
const BOOTSTRAP_KEY_NAME = 'bootstrap admin'
const AUDIT_PAGE_SIZE = 50

/** What a key may do, as offered in the create/edit forms: one level, plus upload */
type Level = 'listen' | 'edit' | 'admin' | 'none'

function levelOf(scopes: Scope[]): Level {
  if (scopes.includes('admin')) return 'admin'
  if (scopes.includes('edit')) return 'edit'
  if (scopes.includes('listen')) return 'listen'
  return 'none'
}

function scopesFor(level: Level, upload: boolean): Scope[] {
  const scopes: Scope[] = level === 'none' ? [] : [level]
  if (upload) scopes.push('upload')
  return scopes
}

export default function Access() {
  const isAdmin = useIsAdmin()
  if (!isAdmin) {
    return (
      <EmptyState
        title="Access needs an admin key"
        description="Managing API keys, the anonymous access policy and the audit log needs an API key with the admin scope."
        action={
          <Link to="/settings" className="text-sm text-primary hover:underline">
            Use a different key in Settings
          </Link>
        }
      />
    )
  }
  return <AccessPage />
}

function AccessPage() {
  const [systems, setSystems] = useState<System[]>([])
  const [keys, setKeys] = useState<APIKey[]>([])
  const [includeRevoked, setIncludeRevoked] = useState(false)
  const [keysError, setKeysError] = useState<string | null>(null)
  const [keysLoading, setKeysLoading] = useState(true)
  const [auditVersion, setAuditVersion] = useState(0)

  useEffect(() => {
    getSystems().then((res) => setSystems(res.systems)).catch(console.error)
  }, [])

  const loadKeys = useCallback(() => {
    setKeysLoading(true)
    listKeys({ include_revoked: includeRevoked })
      .then((res) => {
        setKeys(res.keys)
        setKeysError(null)
      })
      .catch((err) => setKeysError(describeError(err, 'Failed to load keys.')))
      .finally(() => setKeysLoading(false))
  }, [includeRevoked])

  useEffect(() => {
    loadKeys()
  }, [loadKeys])

  // After any change: reload keys and the audit log, and re-check our own key
  // (it may have been the one edited)
  const afterChange = useCallback(() => {
    loadKeys()
    setAuditVersion((v) => v + 1)
    void recheckAuth()
  }, [loadKeys])

  const bootstrapActive = keys.some((k) => k.name === BOOTSTRAP_KEY_NAME && k.status === 'active')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Access</h1>
        <p className="text-muted-foreground">
          API keys for the clients of this tr-engine, what visitors without a key may do, and a log of changes made with keys.
        </p>
      </div>

      {bootstrapActive && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning" data-testid="bootstrap-warning">
          The <span className="font-mono">{BOOTSTRAP_KEY_NAME}</span> key that tr-engine created on its first start is still
          active. Replace this key with a named one and revoke it: create an admin key for yourself below, switch to it in
          Settings, then revoke <span className="font-mono">{BOOTSTRAP_KEY_NAME}</span>.
        </div>
      )}

      <CreateKeyCard systems={systems} onCreated={afterChange} />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>API keys</CardTitle>
              <CardDescription>Only a key's prefix is stored for display; the full key was shown once, when it was created.</CardDescription>
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={includeRevoked} onChange={(e) => setIncludeRevoked(e.target.checked)} />
              Show revoked
            </label>
          </div>
        </CardHeader>
        <CardContent>
          {keysError && <p className="text-sm text-destructive mb-2">{keysError}</p>}
          {keysLoading && keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading keys...</p>
          ) : keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No keys.</p>
          ) : (
            <div className="divide-y divide-border" data-testid="key-list">
              {keys.map((k) => (
                <KeyRow key={k.id} apiKey={k} systems={systems} onChanged={afterChange} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AnonymousAccessCard systems={systems} onChanged={afterChange} />

      <AuditLogCard version={auditVersion} />
    </div>
  )
}

// =============================================================================
// Create
// =============================================================================

function ScopeFields({
  level,
  upload,
  onLevel,
  onUpload,
}: {
  level: Level
  upload: boolean
  onLevel: (l: Level) => void
  onUpload: (u: boolean) => void
}) {
  const levels: { value: Level; label: string; hint: string }[] = [
    { value: 'listen', label: 'Listen', hint: 'browse, stream events and audio' },
    { value: 'edit', label: 'Edit', hint: 'also change talkgroup/unit tags and transcriptions' },
    { value: 'admin', label: 'Admin', hint: 'everything: keys, maintenance, merges, imports' },
    { value: 'none', label: 'Upload only', hint: 'trunk-recorder call upload, nothing else' },
  ]
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Scope">
        {levels.map((l) => (
          <Button
            key={l.value}
            type="button"
            size="sm"
            role="radio"
            aria-checked={level === l.value}
            variant={level === l.value ? 'default' : 'outline'}
            onClick={() => {
              // Upload-only keys have just `upload`; leaving it drops the implied upload
              if (l.value === 'none') onUpload(true)
              else if (level === 'none') onUpload(false)
              onLevel(l.value)
            }}
            title={l.hint}
          >
            {l.label}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{levels.find((l) => l.value === level)?.hint}</p>
      {level !== 'none' && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={upload} onChange={(e) => onUpload(e.target.checked)} />
          Can also upload calls (trunk-recorder upload plugins)
        </label>
      )}
    </div>
  )
}

function CreateKeyCard({ systems, onCreated }: { systems: System[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [level, setLevel] = useState<Level>('listen')
  const [upload, setUpload] = useState(false)
  const [restriction, setRestriction] = useState<RestrictionDraft>(EMPTY_DRAFT)
  const [expires, setExpires] = useState('')
  const [rateLimit, setRateLimit] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<APIKeyCreated | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'selected' | 'failed'>('idle')
  const keyTextRef = useRef<HTMLElement>(null)

  const restrictable = level === 'listen' && !upload
  const allowsNothing = restrictable && restrictionAllowsNothing(restriction)
  const rate = rateLimit.trim() ? Number(rateLimit) : null
  const rateInvalid = rate !== null && !(rate > 0)
  const expiryProblem = expiryDateProblem(expires)

  const reset = () => {
    setName('')
    setLevel('listen')
    setUpload(false)
    setRestriction(EMPTY_DRAFT)
    setExpires('')
    setRateLimit('')
    setError(null)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await createKey({
        name: name.trim(),
        scopes: scopesFor(level, upload),
        restriction: restrictable ? restrictionFromDraft(restriction) : null,
        expires_at: expiryFromDate(expires),
        rate_limit_rps: rate,
      })
      setCreated(res)
      setCopyState('idle')
      reset()
      setOpen(false)
      onCreated()
    } catch (err) {
      setError(describeError(err, 'Failed to create the key.'))
    } finally {
      setBusy(false)
    }
  }

  // Over plain HTTP (e.g. a LAN dashboard) there is no Clipboard API: fall
  // back to the legacy copy command, else select the key for a manual copy
  const copy = async () => {
    if (!created) return
    setCopyState(await copyText(created.key, keyTextRef.current))
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle>Create a key</CardTitle>
            <CardDescription>Give every client its own named key: a dashboard, a script, each upload host, Prometheus.</CardDescription>
          </div>
          {!open && !created && (
            <Button size="sm" onClick={() => setOpen(true)}>New key</Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {created && (
          <div className="space-y-3 rounded-lg border border-success/40 bg-success/5 p-4" data-testid="created-key">
            <p className="text-sm font-medium">
              Key <span className="font-mono">{created.name}</span> created. Copy it now: it will not be shown again.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code ref={keyTextRef} className="rounded bg-muted px-2 py-1 font-mono text-sm break-all select-all" data-testid="created-key-plaintext">
                {created.key}
              </code>
              <Button size="sm" variant="outline" onClick={copy}>{copyState === 'copied' ? 'Copied' : 'Copy'}</Button>
            </div>
            {(copyState === 'selected' || copyState === 'failed') && (
              <p role="status" className="text-sm text-warning" data-testid="copy-manually">
                {copyState === 'selected'
                  ? "Couldn't copy automatically: the key is selected, press Ctrl+C (Cmd+C on a Mac) to copy it."
                  : "Couldn't copy automatically: select the key above and copy it."}
              </p>
            )}
            <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
              Keys used in web pages that other people load are public: anyone who loads the page gets the key's
              access. Put a key only into clients you control, or into a server that keeps it from its visitors.
              For public listening, use the anonymous access policy below instead.
            </div>
            <Button size="sm" onClick={() => setCreated(null)}>I've stored it</Button>
          </div>
        )}

        {open && (
          <form onSubmit={handleCreate} className="space-y-4" data-testid="create-key-form">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="space-y-1">
              <label htmlFor="key-name" className="text-sm font-medium">What is this key for?</label>
              <Input
                id="key-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='e.g. "tr-dashboard at home", "trunk-recorder butco uploads"'
                maxLength={100}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Access</p>
              <ScopeFields level={level} upload={upload} onLevel={setLevel} onUpload={setUpload} />
            </div>
            {restrictable && (
              <div className="space-y-1">
                <p className="text-sm font-medium">Talkgroups</p>
                <RestrictionEditor value={restriction} onChange={setRestriction} systems={systems} noneLabel="All" />
                {allowsNothing && (
                  <p className="text-xs text-destructive">Select at least one system or talkgroup: this restriction allows nothing.</p>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-4">
              <div className="space-y-1">
                <label htmlFor="key-expires" className="text-sm font-medium">Expiry date (optional)</label>
                <Input
                  id="key-expires"
                  type="date"
                  value={expires}
                  min={minExpiryDate()}
                  onChange={(e) => setExpires(e.target.value)}
                  aria-describedby="key-expires-hint"
                  aria-invalid={!!expiryProblem}
                  className="w-44"
                />
                <p id="key-expires-hint" className={cn('text-xs max-w-56', expiryProblem ? 'text-destructive' : 'text-muted-foreground')}>
                  {expiryProblem ?? EXPIRY_DATE_HINT}
                </p>
              </div>
              <div className="space-y-1">
                <label htmlFor="key-rate" className="text-sm font-medium">Rate limit, requests/s (optional)</label>
                <Input id="key-rate" type="number" min="0" step="any" value={rateLimit} onChange={(e) => setRateLimit(e.target.value)} className="w-44" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || !name.trim() || allowsNothing || rateInvalid || !!expiryProblem}>
                {busy ? 'Creating...' : 'Create key'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => { reset(); setOpen(false) }} disabled={busy}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

// =============================================================================
// Key row: view, edit, revoke
// =============================================================================

function statusVariant(status: APIKey['status']): 'success' | 'warning' | 'destructive' {
  return status === 'active' ? 'success' : status === 'expired' ? 'warning' : 'destructive'
}

function KeyRow({ apiKey: k, systems, onChanged }: { apiKey: APIKey; systems: System[]; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRevoke = async () => {
    if (!window.confirm(`Revoke the key "${k.name}" (${k.prefix})? Clients using it stop working at once.`)) return
    setBusy(true)
    setError(null)
    try {
      await revokeKey(k.id)
      onChanged()
    } catch (err) {
      setError(describeError(err, 'Failed to revoke the key.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="py-3 space-y-2" data-testid={`key-row-${k.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{k.name}</span>
        <span className="font-mono text-xs text-muted-foreground">{k.prefix}</span>
        {k.scopes.map((s) => (
          <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
        ))}
        {k.legacy && <Badge variant="outline" className="text-[10px]">legacy</Badge>}
        <Badge variant={statusVariant(k.status)} className="text-[10px]" data-testid="key-status">{k.status}</Badge>
        <div className="ml-auto flex gap-2">
          {k.status !== 'revoked' && !editing && (
            <>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={busy}>Edit</Button>
              <Button size="sm" variant="outline" onClick={handleRevoke} disabled={busy} className="text-destructive">
                Revoke
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
        {k.scopes.includes('listen') && k.scopes.length === 1 && (
          <span>Talkgroups: {describeRestriction(k.restriction, systems)}</span>
        )}
        <span>Created {formatDateTime(k.created_at)}</span>
        <span>Last used {k.last_used_at ? formatRelativeTime(k.last_used_at) : 'never'}</span>
        {k.expires_at && <span>Expires {formatDateTime(k.expires_at)}</span>}
        {k.rate_limit_rps != null && <span>{k.rate_limit_rps} req/s</span>}
        {k.revoked_at && <span>Revoked {formatDateTime(k.revoked_at)}</span>}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {editing && (
        <EditKeyForm
          apiKey={k}
          systems={systems}
          onDone={(changed) => {
            setEditing(false)
            if (changed) onChanged()
          }}
        />
      )}
    </div>
  )
}

function EditKeyForm({ apiKey: k, systems, onDone }: { apiKey: APIKey; systems: System[]; onDone: (changed: boolean) => void }) {
  const [name, setName] = useState(k.name)
  const [level, setLevel] = useState<Level>(levelOf(k.scopes))
  const [upload, setUpload] = useState(k.scopes.includes('upload'))
  const [restriction, setRestriction] = useState<RestrictionDraft>(draftFromRestriction(k.restriction))
  const [expires, setExpires] = useState(dateFromExpiry(k.expires_at))
  const [rateLimit, setRateLimit] = useState(k.rate_limit_rps != null ? String(k.rate_limit_rps) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const restrictable = level === 'listen' && !upload
  const allowsNothing = restrictable && restrictionAllowsNothing(restriction)
  const rate = rateLimit.trim() ? Number(rateLimit) : null
  const rateInvalid = rate !== null && !(rate > 0)
  // Only a changed expiry is sent (and checked): an expired key keeps its date
  const expiryChanged = expires !== dateFromExpiry(k.expires_at)
  const expiryProblem = expiryChanged ? expiryDateProblem(expires) : null

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    // Send every field: absent means unchanged, null clears. A key that is
    // no longer listen-only must drop its restriction in the same request.
    const patch: APIKeyPatch = {
      name: name.trim(),
      scopes: scopesFor(level, upload),
      restriction: restrictable ? restrictionFromDraft(restriction) : null,
      rate_limit_rps: rate,
    }
    // Only touch expiry when it changed: re-sending a past date would be rejected
    if (expiryChanged) patch.expires_at = expiryFromDate(expires)
    try {
      await updateKey(k.id, patch)
      onDone(true)
    } catch (err) {
      setError(describeError(err, 'Failed to save the key.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-3 rounded-lg border border-border p-3" data-testid="edit-key-form">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor={`key-name-${k.id}`}>Name</label>
        <Input id={`key-name-${k.id}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
      </div>
      <ScopeFields level={level} upload={upload} onLevel={setLevel} onUpload={setUpload} />
      {restrictable && (
        <div className="space-y-1">
          <p className="text-sm font-medium">Talkgroups</p>
          <RestrictionEditor value={restriction} onChange={setRestriction} systems={systems} noneLabel="All" />
          {allowsNothing && (
            <p className="text-xs text-destructive">Select at least one system or talkgroup: this restriction allows nothing.</p>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor={`key-expires-${k.id}`}>Expiry date</label>
          <Input
            id={`key-expires-${k.id}`}
            type="date"
            value={expires}
            min={expiryChanged ? minExpiryDate() : undefined}
            onChange={(e) => setExpires(e.target.value)}
            aria-describedby={`key-expires-hint-${k.id}`}
            aria-invalid={!!expiryProblem}
            className="w-44"
          />
          <p id={`key-expires-hint-${k.id}`} className={cn('text-xs max-w-56', expiryProblem ? 'text-destructive' : 'text-muted-foreground')}>
            {expiryProblem ?? `${EXPIRY_DATE_HINT} Empty: never expires.`}
          </p>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor={`key-rate-${k.id}`}>Rate limit, requests/s</label>
          <Input id={`key-rate-${k.id}`} type="number" min="0" step="any" value={rateLimit} onChange={(e) => setRateLimit(e.target.value)} className="w-44" />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || !name.trim() || allowsNothing || rateInvalid || !!expiryProblem || (level === 'none' && !upload)}>
          {busy ? 'Saving...' : 'Save'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => onDone(false)} disabled={busy}>Cancel</Button>
      </div>
    </form>
  )
}

// =============================================================================
// Anonymous access policy
// =============================================================================

function AnonymousAccessCard({ systems, onChanged }: { systems: System[]; onChanged: () => void }) {
  const [policy, setPolicy] = useState<AnonymousAccess | null>(null)
  const [access, setAccess] = useState<AnonymousAccessLevel>('off')
  const [restriction, setRestriction] = useState<RestrictionDraft>(EMPTY_DRAFT)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const load = useCallback(() => {
    getAnonymousAccess()
      .then((res) => {
        setPolicy(res)
        setAccess(res.access)
        setRestriction(draftFromRestriction(res.restriction))
        setError(null)
      })
      .catch((err) => setError(describeError(err, 'Failed to load the anonymous access policy.')))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const allowsNothing = restrictionAllowsNothing(restriction)
  const dirty = useMemo(() => {
    if (!policy) return false
    return (
      access !== policy.access ||
      JSON.stringify(restrictionFromDraft(restriction)) !== JSON.stringify(restrictionFromDraft(draftFromRestriction(policy.restriction)))
    )
  }, [policy, access, restriction])

  const handleSave = async () => {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const res = await putAnonymousAccess({ access, restriction: restrictionFromDraft(restriction) })
      setPolicy(res)
      setAccess(res.access)
      setRestriction(draftFromRestriction(res.restriction))
      setSaved(true)
      onChanged()
    } catch (err) {
      setError(describeError(err, 'Failed to save the anonymous access policy.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card data-testid="anonymous-access">
      <CardHeader>
        <CardTitle>Anonymous access</CardTitle>
        <CardDescription>
          What a request without a key may do. Anonymous visitors can at most listen: never edit, administer or upload.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!policy ? (
          !error && <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Anonymous access">
              {(['off', 'listen'] as const).map((level) => (
                <Button
                  key={level}
                  type="button"
                  size="sm"
                  role="radio"
                  aria-checked={access === level}
                  variant={access === level ? 'default' : 'outline'}
                  onClick={() => { setAccess(level); setSaved(false) }}
                >
                  {level === 'off' ? 'Off: a key is required' : 'Listen: anyone can browse and play'}
                </Button>
              ))}
            </div>
            <div className={cn('space-y-1', access === 'off' && 'opacity-80')}>
              <p className="text-sm font-medium">Talkgroups visitors may see</p>
              {access === 'off' && (
                <p className="text-xs text-muted-foreground">Kept while access is off, so you can prepare it.</p>
              )}
              <RestrictionEditor
                value={restriction}
                onChange={(d) => { setRestriction(d); setSaved(false) }}
                systems={systems}
                noneLabel="All"
              />
              {allowsNothing && (
                <p className="text-xs text-destructive" data-testid="allows-nothing">
                  This allows nothing. Select at least one system or talkgroup, or set access to Off instead.
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={handleSave} disabled={busy || !dirty || allowsNothing}>
                {busy ? 'Saving...' : 'Save policy'}
              </Button>
              {saved && <span className="text-sm text-success">Saved</span>}
              {policy.updated_at && (
                <span className="text-xs text-muted-foreground">Last changed {formatDateTime(policy.updated_at)}</span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// =============================================================================
// Audit log
// =============================================================================

function AuditLogCard({ version }: { version: number }) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getAuditLog({ limit: AUDIT_PAGE_SIZE, offset })
      .then((res) => {
        setEntries(res.entries)
        setTotal(res.total)
        setError(null)
      })
      .catch((err) => setError(describeError(err, 'Failed to load the audit log.')))
      .finally(() => setLoading(false))
  }, [offset, version])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit log</CardTitle>
        <CardDescription>Changes made with API keys (everything but reads, call uploads and tickets), newest first.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {loading && entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No entries.</p>
        ) : (
          <div className="overflow-x-auto">
            {/* Every field is rendered as text: key names, actors and paths come from API clients */}
            <table className="w-full text-xs" data-testid="audit-log">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">Time</th>
                  <th className="py-1 pr-3 font-medium">Key</th>
                  <th className="py-1 pr-3 font-medium">Actor</th>
                  <th className="py-1 pr-3 font-medium">Request</th>
                  <th className="py-1 pr-3 font-medium">Status</th>
                  <th className="py-1 font-medium">Request ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="py-1 pr-3 whitespace-nowrap">{formatDateTime(e.time)}</td>
                    <td className="py-1 pr-3">{e.key_name} <span className="text-muted-foreground">#{e.key_id}</span></td>
                    <td className="py-1 pr-3">{e.actor ?? ''}</td>
                    <td className="py-1 pr-3 font-mono break-all">{e.method} {e.path}</td>
                    <td className={cn('py-1 pr-3 tabular-nums', e.status >= 400 && 'text-destructive')}>{e.status}</td>
                    <td className="py-1 font-mono text-muted-foreground break-all">{e.request_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > AUDIT_PAGE_SIZE && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - AUDIT_PAGE_SIZE))}>
              Newer
            </Button>
            <Button size="sm" variant="outline" disabled={offset + AUDIT_PAGE_SIZE >= total} onClick={() => setOffset(offset + AUDIT_PAGE_SIZE)}>
              Older
            </Button>
            <span>{offset + 1}–{Math.min(offset + AUDIT_PAGE_SIZE, total)} of {total}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
