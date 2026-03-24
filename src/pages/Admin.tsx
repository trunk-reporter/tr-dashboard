import { useEffect, useState } from 'react'
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
} from '@/api/client'
import type { System, Talkgroup, Unit, SystemMergeResponse } from '@/api/types'

export default function Admin() {
  const [systems, setSystems] = useState<System[]>([])

  useEffect(() => {
    getSystems().then((res) => setSystems(res.systems)).catch(console.error)
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="text-muted-foreground">System administration and data management</p>
      </div>

      <SystemMergeSection systems={systems} />
      <Separator />
      <TalkgroupEditSection />
      <Separator />
      <UnitEditSection />
      <Separator />
      <CsvImportSection systems={systems} />
    </div>
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
      setError(err instanceof Error ? err.message : 'Merge failed')
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
                      {status === 'forbidden' && <span className="text-xs text-destructive">Write token required. Add it in Settings → Write Access.</span>}
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
      .then((res) => setUnits(res.units || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  const saveEdit = async (unit: Unit) => {
    const key = `${unit.system_id}:${unit.unit_id}`
    setSaveStatus((prev) => ({ ...prev, [key]: 'saving' }))
    try {
      await updateUnit(key, { alpha_tag: editAlphaTag || undefined })
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
                    {status === 'forbidden' && <span className="text-xs text-destructive">Write token required. Add it in Settings → Write Access.</span>}
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

function CsvImportSection({ systems }: { systems: System[] }) {
  const [systemId, setSystemId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ imported: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleImport = async () => {
    if (!systemId || !file) return
    setImporting(true)
    setError(null)
    setResult(null)

    try {
      const res = await importTalkgroupDirectory(parseInt(systemId, 10), file)
      setResult({ imported: res.imported, total: res.total })
      setFile(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>CSV Import</CardTitle>
        <CardDescription>Import talkgroup directory from a CSV file</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
          <p className="text-sm text-success">
            Imported {result.imported} of {result.total} rows
          </p>
        )}
      </CardContent>
    </Card>
  )
}
