import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  getSystems,
  mergeSystems,
  getTalkgroups,
  updateTalkgroup,
  getUnits,
  updateUnit,
  importTalkgroupDirectory,
  importUnitTags,
  getMaintenanceStatus,
  runMaintenance,
  isMissingEndpoint,
  isUnavailable,
  describeError,
} from '@/api/client'
import { useIsAdmin } from '@/stores/useAuthStore'
import { EmptyState } from '@/components/ui/empty-state'
import type {
  System,
  Talkgroup,
  Unit,
  SystemMergeResponse,
  MaintenanceStatusResponse,
} from '@/api/types'

// Everything on this page (maintenance, merges, CSV imports) needs the admin scope
export default function Admin() {
  const isAdmin = useIsAdmin()
  if (!isAdmin) {
    return (
      <EmptyState
        title="Admin needs an admin key"
        description="Maintenance, system merges and CSV imports need an API key with the admin scope."
        action={
          <Link to="/settings" className="text-sm text-primary hover:underline">
            Use a different key in Settings
          </Link>
        }
      />
    )
  }
  return <AdminPage />
}

function AdminPage() {
  const [systems, setSystems] = useState<System[]>([])
  const [maintenance, setMaintenance] = useState<MaintenanceStatusResponse | null>(null)
  const [maintenanceRunning, setMaintenanceRunning] = useState(false)
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null)

  useEffect(() => {
    getSystems().then((res) => setSystems(res.systems)).catch(console.error)
    getMaintenanceStatus().then((res) => setMaintenance(res)).catch(() => {})
  }, [])

  const handleRunMaintenance = async () => {
    setMaintenanceRunning(true)
    setMaintenanceError(null)
    try {
      await runMaintenance()
      const updated = await getMaintenanceStatus()
      setMaintenance(updated)
    } catch (err) {
      console.error('Maintenance run failed:', err)
      setMaintenanceError(describeError(err, 'Maintenance run failed.'))
    } finally {
      setMaintenanceRunning(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="text-muted-foreground">System administration and data management</p>
      </div>

      <MaintenanceSection
        maintenance={maintenance}
        running={maintenanceRunning}
        onRun={handleRunMaintenance}
        error={maintenanceError}
      />
      <Separator />
      <SystemMergeSection systems={systems} />
      <Separator />
      <TalkgroupEditSection />
      <Separator />
      <UnitEditSection />
      <Separator />
      <TalkgroupDirectoryImportSection systems={systems} />
      <Separator />
      <UnitTagsImportSection systems={systems} />
    </div>
  )
}

// =============================================================================
// Maintenance
// =============================================================================

function MaintenanceSection({
  maintenance,
  running,
  onRun,
  error,
}: {
  maintenance: MaintenanceStatusResponse | null
  running: boolean
  onRun: () => void
  error: string | null
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Maintenance</CardTitle>
            <CardDescription>Database maintenance and data retention</CardDescription>
          </div>
          {maintenance?.running && (
            <Badge variant="default" className="animate-pulse">Running</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {maintenance?.config && (
          <div>
            <p className="text-sm font-medium mb-2">Retention Settings</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
              {Object.entries({
                'Calls': maintenance.config.retention_calls,
                'Raw Messages': maintenance.config.retention_raw_messages,
                'Console Logs': maintenance.config.retention_console_logs,
                'Plugin Status': maintenance.config.retention_plugin_status,
                'Checkpoints': maintenance.config.retention_checkpoints,
                'Stale Calls': maintenance.config.retention_stale_calls,
                'Audit Log': maintenance.config.retention_audit_log,
              }).map(([label, value]) => (
                value && (
                  <div key={label} className="rounded border px-2 py-1">
                    <div className="text-xs text-muted-foreground">{label}</div>
                    <div className="font-mono text-xs">{value}</div>
                  </div>
                )
              ))}
            </div>
            {maintenance.config.schedule && (
              <p className="text-xs text-muted-foreground mt-2">
                Schedule: <span className="font-mono">{maintenance.config.schedule}</span>
              </p>
            )}
          </div>
        )}

        {maintenance?.last_run && (
          <div>
            <p className="text-sm font-medium mb-2">Last Maintenance Run</p>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>Started: {new Date(maintenance.last_run.started_at).toLocaleString()}</p>
              {maintenance.last_run.completed_at && (
                <p>Completed: {new Date(maintenance.last_run.completed_at).toLocaleString()}</p>
              )}
              <p>Partitions created: {maintenance.last_run.partitions_created ?? 0}</p>
              <p>Calls deleted: {maintenance.last_run.calls_deleted ?? 0}</p>
              {maintenance.last_run.errors && maintenance.last_run.errors.length > 0 && (
                <div className="text-destructive mt-1">
                  {maintenance.last_run.errors.map((e, i) => (
                    <p key={i}>{e}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={onRun} disabled={running || maintenance?.running}>
            {running || maintenance?.running ? 'Running...' : 'Run Maintenance Now'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// =============================================================================
// System Merge
// =============================================================================

function SystemMergeSection({ systems }: { systems: System[] }) {
  const [sourceId, setSourceId] = useState('')
  const [targetId, setTargetId] = useState('')
  const [merging, setMerging] = useState(false)
  const [result, setResult] = useState<SystemMergeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleMerge = async () => {
    if (!sourceId || !targetId || sourceId === targetId) return
    setMerging(true)
    setError(null)
    setResult(null)

    try {
      const res = await mergeSystems({
        source_id: parseInt(sourceId, 10),
        target_id: parseInt(targetId, 10),
      })
      setResult(res)
    } catch (err) {
      setError(describeError(err, 'Merge failed'))
    } finally {
      setMerging(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>System Merge</CardTitle>
        <CardDescription>Merge data from one system into another</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">Source (will be emptied)</label>
            <select
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              className="w-48 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Select source...</option>
              {systems.map((sys) => (
                <option key={sys.system_id} value={sys.system_id}>
                  {sys.name || `System ${sys.system_id}`} (#{sys.system_id})
                </option>
              ))}
            </select>
          </div>
          <span className="pb-2 text-muted-foreground">→</span>
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">Target (will receive data)</label>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-48 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Select target...</option>
              {systems.filter((s) => String(s.system_id) !== sourceId).map((sys) => (
                <option key={sys.system_id} value={sys.system_id}>
                  {sys.name || `System ${sys.system_id}`} (#{sys.system_id})
                </option>
              ))}
            </select>
          </div>
          <Button
            onClick={handleMerge}
            disabled={!sourceId || !targetId || sourceId === targetId || merging}
            variant="destructive"
          >
            {merging ? 'Merging...' : 'Merge Systems'}
          </Button>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {result && (
          <div className="rounded-md border bg-muted/50 p-3 text-sm space-y-1">
            <p className="font-medium text-success">Merge complete</p>
            <p>Calls moved: {result.calls_moved}</p>
            <p>Talkgroups moved: {result.talkgroups_moved} / merged: {result.talkgroups_merged}</p>
            <p>Units moved: {result.units_moved} / merged: {result.units_merged}</p>
            <p>Events moved: {result.events_moved}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// =============================================================================
// Talkgroup Metadata Editing
// =============================================================================

function TalkgroupEditSection() {
  const [search, setSearch] = useState('')
  const [talkgroups, setTalkgroups] = useState<Talkgroup[]>([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [saveStatus, setSaveStatus] = useState<Record<string, 'saving' | 'saved' | 'error' | 'forbidden'>>({})

  const handleSearch = () => {
    if (!search.trim()) return
    setLoading(true)
    getTalkgroups({ search, limit: 20 })
      .then((res) => setTalkgroups(res.talkgroups || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  const startEdit = (tg: Talkgroup) => {
    const key = `${tg.system_id}:${tg.tgid}`
    setEditingId(key)
    setEditValues({
      alpha_tag: tg.alpha_tag || '',
      description: tg.description || '',
      group: tg.group || '',
      tag: tg.tag || '',
      priority: String(tg.priority ?? 0),
    })
  }

  const saveEdit = async (tg: Talkgroup) => {
    const key = `${tg.system_id}:${tg.tgid}`
    setSaveStatus((prev) => ({ ...prev, [key]: 'saving' }))
    try {
      await updateTalkgroup(key, {
        alpha_tag: editValues.alpha_tag || undefined,
        description: editValues.description || undefined,
        group: editValues.group || undefined,
        tag: editValues.tag || undefined,
        priority: editValues.priority ? parseInt(editValues.priority, 10) : undefined,
      })
      setSaveStatus((prev) => ({ ...prev, [key]: 'saved' }))
      setEditingId(null)
      // Refresh
      handleSearch()
    } catch (err) {
      if (err instanceof Error && 'status' in err && (err as { status: number }).status === 403) {
        setSaveStatus((prev) => ({ ...prev, [key]: 'forbidden' }))
      } else {
        setSaveStatus((prev) => ({ ...prev, [key]: 'error' }))
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Talkgroup Metadata</CardTitle>
        <CardDescription>Edit talkgroup names, descriptions, and groupings</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Search talkgroups..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="max-w-sm"
          />
          <Button variant="outline" onClick={handleSearch} disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </Button>
        </div>

        {talkgroups.length > 0 && (
          <div className="space-y-2 max-h-96 overflow-auto">
            {talkgroups.map((tg) => {
              const key = `${tg.system_id}:${tg.tgid}`
              const isEditing = editingId === key
              const status = saveStatus[key]

              return (
                <div key={key} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono">{tg.tgid}</Badge>
                      <span className="font-medium">{tg.alpha_tag || 'Unnamed'}</span>
                      {tg.system_name && (
                        <span className="text-xs text-muted-foreground">{tg.system_name}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {status === 'saved' && <span className="text-xs text-success">Saved</span>}
                      {status === 'forbidden' && <span className="text-xs text-destructive">Your key can't do this (needs edit).</span>}
                      {status === 'error' && <span className="text-xs text-destructive">Error</span>}
                      {isEditing ? (
                        <div className="flex gap-1">
                          <Button size="sm" variant="default" onClick={() => saveEdit(tg)}>
                            {status === 'saving' ? 'Saving...' : 'Save'}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => startEdit(tg)}>
                          Edit
                        </Button>
                      )}
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      <div>
                        <label className="text-xs text-muted-foreground">Alpha Tag</label>
                        <Input
                          value={editValues.alpha_tag}
                          onChange={(e) => setEditValues((v) => ({ ...v, alpha_tag: e.target.value }))}
                          className="h-8"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Description</label>
                        <Input
                          value={editValues.description}
                          onChange={(e) => setEditValues((v) => ({ ...v, description: e.target.value }))}
                          className="h-8"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Group</label>
                        <Input
                          value={editValues.group}
                          onChange={(e) => setEditValues((v) => ({ ...v, group: e.target.value }))}
                          className="h-8"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Tag</label>
                        <Input
                          value={editValues.tag}
                          onChange={(e) => setEditValues((v) => ({ ...v, tag: e.target.value }))}
                          className="h-8"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Priority</label>
                        <Input
                          type="number"
                          value={editValues.priority}
                          onChange={(e) => setEditValues((v) => ({ ...v, priority: e.target.value }))}
                          className="h-8"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      {[tg.description, tg.group, tg.tag].filter(Boolean).join(' • ') || 'No metadata'}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// =============================================================================
// Unit Metadata Editing
// =============================================================================

function UnitEditSection() {
  const [search, setSearch] = useState('')
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editAlphaTag, setEditAlphaTag] = useState('')
  const [saveStatus, setSaveStatus] = useState<Record<string, 'saving' | 'saved' | 'error' | 'forbidden'>>({})

  const handleSearch = () => {
    if (!search.trim()) return
    setLoading(true)
    getUnits({ search, limit: 20 })
      .then((res) => setUnits(isUnavailable(res) ? [] : res.units || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  const saveEdit = async (unit: Unit) => {
    const key = `${unit.system_id}:${unit.unit_id}`
    setSaveStatus((prev) => ({ ...prev, [key]: 'saving' }))
    try {
      // Mark a rename manual, as Unit detail does, so older engines don't let
      // the recorder's next reported tag overwrite it.
      await updateUnit(
        key,
        editAlphaTag.trim()
          ? { alpha_tag: editAlphaTag, alpha_tag_source: 'manual' }
          : { alpha_tag: editAlphaTag || undefined },
      )
      setSaveStatus((prev) => ({ ...prev, [key]: 'saved' }))
      setEditingId(null)
      handleSearch()
    } catch (err) {
      if (err instanceof Error && 'status' in err && (err as { status: number }).status === 403) {
        setSaveStatus((prev) => ({ ...prev, [key]: 'forbidden' }))
      } else {
        setSaveStatus((prev) => ({ ...prev, [key]: 'error' }))
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Unit Metadata</CardTitle>
        <CardDescription>Edit unit names and identifiers</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Search units..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="max-w-sm"
          />
          <Button variant="outline" onClick={handleSearch} disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </Button>
        </div>

        {units.length > 0 && (
          <div className="space-y-2 max-h-96 overflow-auto">
            {units.map((unit) => {
              const key = `${unit.system_id}:${unit.unit_id}`
              const isEditing = editingId === key
              const status = saveStatus[key]

              return (
                <div key={key} className="flex items-center justify-between rounded-md border p-3 text-sm">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="font-mono">{unit.unit_id}</Badge>
                    {isEditing ? (
                      <Input
                        value={editAlphaTag}
                        onChange={(e) => setEditAlphaTag(e.target.value)}
                        className="h-8 w-48"
                        placeholder="Alpha tag"
                      />
                    ) : (
                      <span>{unit.alpha_tag || 'Unnamed'}</span>
                    )}
                    {unit.system_name && (
                      <span className="text-xs text-muted-foreground">{unit.system_name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {status === 'saved' && <span className="text-xs text-success">Saved</span>}
                    {status === 'forbidden' && <span className="text-xs text-destructive">Your key can't do this (needs edit).</span>}
                    {status === 'error' && <span className="text-xs text-destructive">Error</span>}
                    {isEditing ? (
                      <div className="flex gap-1">
                        <Button size="sm" variant="default" onClick={() => saveEdit(unit)}>
                          {status === 'saving' ? 'Saving...' : 'Save'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setEditingId(key); setEditAlphaTag(unit.alpha_tag || '') }}
                      >
                        Edit
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// =============================================================================
// CSV Import
// =============================================================================

interface CsvImportResult {
  summary: string
  notes: string[]
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function importErrorMessage(err: unknown): string {
  // Auth errors explain themselves ("Your key can't do this (needs admin)");
  // otherwise prefer the server's message (e.g. "system_id 5 not found")
  return describeError(err, err instanceof Error ? err.message : 'Import failed')
}

function TalkgroupDirectoryImportSection({ systems }: { systems: System[] }) {
  return (
    <CsvImportCard
      title="Talkgroup Directory Import"
      description="Import talkgroup directory from a CSV file"
      systems={systems}
      onImport={async (systemId, file) => {
        const res = await importTalkgroupDirectory(systemId, file)
        return { summary: `Imported ${res.imported} of ${plural(res.total, 'row')}`, notes: [] }
      }}
    />
  )
}

function UnitTagsImportSection({ systems }: { systems: System[] }) {
  return (
    <CsvImportCard
      title="Unit Tags Import"
      description="Import unit names from a trunk-recorder unit tags CSV (unit_id,alpha_tag)"
      hint="Imported tags replace tags discovered over MQTT. Units edited by hand keep their tag."
      systems={systems}
      // POST /unit-tags/import is new; older engines (or a proxy that doesn't
      // forward the route) answer with a bare 404/405 instead of a JSON error.
      missingEndpointMessage="This tr-engine has no unit tags import route (POST /unit-tags/import). Upgrade tr-engine, or if it is already current, check that your reverse proxy forwards API requests to it."
      onImport={async (systemId, file) => {
        const res = await importUnitTags(systemId, file)
        // The import is all-or-nothing: a failure is an error response, so
        // imported always equals total here.
        const notes: string[] = []
        if (res.skipped > 0) {
          notes.push(`Skipped ${plural(res.skipped, 'row')} (malformed, invalid unit ID, or empty tag)`)
        }
        if (res.duplicates) {
          notes.push(`${plural(res.duplicates, 'duplicate unit ID')} (last row wins)`)
        }
        return { summary: `Imported ${res.imported} of ${plural(res.total, 'row')}`, notes }
      }}
    />
  )
}

function CsvImportCard({
  title,
  description,
  hint,
  systems,
  onImport,
  missingEndpointMessage,
}: {
  title: string
  description: string
  hint?: string
  systems: System[]
  onImport: (systemId: number, file: File) => Promise<CsvImportResult>
  /** Shown instead of the generic error when the engine has no such route (isMissingEndpoint). */
  missingEndpointMessage?: string
}) {
  const [systemId, setSystemId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  // Bumped after a successful import to remount (clear) the file input
  const [fileInputKey, setFileInputKey] = useState(0)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<CsvImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleImport = async () => {
    if (!systemId || !file) return
    setImporting(true)
    setError(null)
    setResult(null)

    try {
      setResult(await onImport(parseInt(systemId, 10), file))
      setFile(null)
      setFileInputKey((k) => k + 1)
    } catch (err) {
      setError(missingEndpointMessage && isMissingEndpoint(err) ? missingEndpointMessage : importErrorMessage(err))
    } finally {
      setImporting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hint && (
          <p className="text-xs text-muted-foreground">{hint}</p>
        )}

        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">System</label>
            <select
              value={systemId}
              onChange={(e) => setSystemId(e.target.value)}
              className="w-48 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Select system...</option>
              {systems.map((sys) => (
                <option key={sys.system_id} value={sys.system_id}>
                  {sys.name || `System ${sys.system_id}`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">CSV File</label>
            <input
              key={fileInputKey}
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="text-sm"
            />
          </div>
          <Button
            onClick={handleImport}
            disabled={!systemId || !file || importing}
          >
            {importing ? 'Importing...' : 'Import'}
          </Button>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {result && (
          <div className="text-sm space-y-0.5">
            <p className="text-success">{result.summary}</p>
            {result.notes.map((note) => (
              <p key={note} className="text-warning">{note}</p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
