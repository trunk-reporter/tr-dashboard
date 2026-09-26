import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CallList } from '@/components/calls/CallList'
import { getUnit, getUnitEvents, getUnitCalls, updateUnit, isUnavailable, describeError } from '@/api/client'
import { useCanEdit } from '@/stores/useAuthStore'
import { RestrictedNotice } from '@/components/ui/restricted-notice'
import type { Unit, UnitEvent, Call } from '@/api/types'
import {
  formatDateTime,
  formatRelativeTime,
  formatUnitId,
  getEventTypeLabel,
  getEventTypeColor,
  getTalkgroupDisplayName,
  getSignalingTypeLabel,
  getSignalTypeLabel,
  getUnitTagObservations,
} from '@/lib/utils'
import { useFilterStore } from '@/stores/useFilterStore'
import { CopyableId } from '@/components/ui/copyable-id'

export default function UnitDetail() {
  const { id } = useParams<{ id: string }>()
  const unitIdHex = useFilterStore((s) => s.unitIdHex)
  const [unit, setUnit] = useState<Unit | null>(null)
  const [events, setEvents] = useState<UnitEvent[]>([])
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Unit endpoints deny restricted credentials
  const [unavailable, setUnavailable] = useState(false)
  // Tag edits need a key with the edit scope
  const canEdit = useCanEdit()

  // Inline edit state
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editAlphaTag, setEditAlphaTag] = useState('')
  const [editError, setEditError] = useState<string | null>(null)

  const startEdit = useCallback(() => {
    if (!unit) return
    setEditAlphaTag(unit.alpha_tag || '')
    setEditError(null)
    setEditing(true)
  }, [unit])

  const cancelEdit = useCallback(() => {
    setEditing(false)
    setEditError(null)
  }, [])

  const saveEdit = useCallback(async () => {
    if (!id) return
    setSaving(true)
    setEditError(null)
    try {
      // A blank tag is omitted (as in Admin): the engine ignores it anyway.
      // A rename is also marked manual so the recorder's next reported tag
      // doesn't overwrite it (only manual/csv tags outrank live MQTT tags).
      // Engines with the CSV tag priority change (tr-engine #34) mark every
      // rename manual themselves; older engines only do so when asked.
      const updated = await updateUnit(
        id,
        editAlphaTag.trim() ? { alpha_tag: editAlphaTag, alpha_tag_source: 'manual' } : { alpha_tag: undefined },
      )
      setUnit(updated)
      setEditing(false)
    } catch (err) {
      setEditError(describeError(err, 'Failed to save changes.'))
      console.error('Failed to update unit:', err)
    } finally {
      setSaving(false)
    }
  }, [id, editAlphaTag])

  useEffect(() => {
    if (!id) return

    setLoading(true)
    setError(null)
    setUnavailable(false)

    // id is in format "system_id:unit_id" or plain "unit_id"
    Promise.all([
      getUnit(id),
      getUnitEvents(id, { limit: 50 }),
      getUnitCalls(id, { limit: 20 }),
    ])
      .then(([unitRes, eventsRes, callsRes]) => {
        if (isUnavailable(unitRes) || isUnavailable(eventsRes) || isUnavailable(callsRes)) {
          setUnavailable(true)
          return
        }
        setUnit(unitRes)
        setEvents(eventsRes.events)
        setCalls(callsRes.calls)
      })
      .catch((err) => {
        console.error(err)
        if (err.status === 409) {
          setError('This unit ID exists in multiple systems. Please use the format system_id:unit_id.')
        } else {
          setError('Failed to load unit details')
        }
      })
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Loading...
      </div>
    )
  }

  if (unavailable) {
    return <RestrictedNotice what="Units" />
  }

  if (error || !unit) {
    return (
      <div className="space-y-4">
        <div className="flex h-64 items-center justify-center text-destructive">
          {error || 'Unit not found'}
        </div>
        <div className="text-center">
          <Link to="/units" className="text-primary hover:underline">
            ← Back to units
          </Link>
        </div>
      </div>
    )
  }

  const tagObservations = getUnitTagObservations(unit)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <div className="mb-2">
          <Link to="/units" className="text-sm text-muted-foreground hover:underline">
            ← Back to units
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">
            {unit.alpha_tag || `Unit ${formatUnitId(unit.unit_id, unitIdHex)}`}
          </h1>
          <CopyableId value={formatUnitId(unit.unit_id, unitIdHex)} />
          {unit.alpha_tag_source && (
            <Badge variant="secondary" className="text-xs">Source: {unit.alpha_tag_source}</Badge>
          )}
          {!editing && canEdit && (
            <Button variant="outline" size="sm" onClick={startEdit}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                <path d="m15 5 4 4" />
              </svg>
              Edit
            </Button>
          )}
        </div>
        {editing ? (
          <div className="flex items-center gap-2 mt-1">
            <input
              type="text"
              value={editAlphaTag}
              onChange={(e) => setEditAlphaTag(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm w-64"
              placeholder="Unit name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEdit()
                if (e.key === 'Escape') cancelEdit()
              }}
            />
            <Button size="sm" onClick={saveEdit} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
            <Button variant="outline" size="sm" onClick={cancelEdit} disabled={saving}>
              Cancel
            </Button>
            {editError && (
              <span className="text-xs text-destructive">{editError}</span>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            {unit.system_name && `${unit.system_name} `}
            <span className="font-mono text-muted-foreground/70">({unit.system_id})</span>
          </p>
        )}
        {/* Names observed from the radio / trunk-recorder that differ from alpha_tag */}
        {tagObservations.length > 0 && (
          <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {tagObservations.map((obs) => (
              <div key={obs.kind} className="flex flex-wrap items-center gap-x-2">
                <span>{obs.label}:</span>
                <span className="font-medium text-foreground">{obs.value}</span>
                {obs.lastSeen && (
                  <span
                    className="text-muted-foreground/70"
                    title={obs.firstSeen
                      ? `First seen ${formatDateTime(obs.firstSeen)}, last seen ${formatDateTime(obs.lastSeen)}`
                      : `Last reported ${formatDateTime(obs.lastSeen)}`}
                  >
                    last seen {formatRelativeTime(obs.lastSeen)}
                  </span>
                )}
                {editing && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5"
                    onClick={() => setEditAlphaTag(obs.value)}
                    disabled={saving || editAlphaTag === obs.value}
                    title="Copy into the name field. Not saved until you click Save."
                  >
                    Use
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Details — compact inline */}
      <div className="rounded-lg border px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          {unit.last_event_type && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className={`text-xs ${getEventTypeColor(unit.last_event_type)}`}>
                {getEventTypeLabel(unit.last_event_type)}
              </Badge>
              {unit.last_event_tg_tag && unit.last_event_tgid && (
                <Link
                  to={`/talkgroups/${unit.system_id}:${unit.last_event_tgid}`}
                  className="text-muted-foreground hover:underline"
                >
                  {unit.last_event_tg_tag}
                </Link>
              )}
            </div>
          )}
          <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
            <span>First {formatDateTime(unit.first_seen || '')}</span>
            <span>Last {formatRelativeTime(unit.last_seen || '')}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent events */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Events ({events.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-muted-foreground">No events recorded</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-auto">
                {events.map((event) => (
                  <div
                    key={event.id}
                    className={`flex items-center justify-between rounded-lg border bg-card p-3${
                      event.event_type === 'signal' && (event.signaling_type || (event.metadata_json as Record<string, string>)?.signal_type) === 'emergency'
                        ? ' border-destructive/50' : ''
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={event.event_type === 'signal'
                            && ((event.signal_type || (event.metadata_json as Record<string, string>)?.signal_type) === 'emergency')
                            ? 'destructive' : 'secondary'}
                          className="text-xs"
                        >
                          {event.event_type === 'signal'
                            ? getSignalingTypeLabel(event.signaling_type || (event.metadata_json as Record<string, string>)?.signaling_type || 'Signal')
                            : getEventTypeLabel(event.event_type)}
                        </Badge>
                        {event.event_type === 'signal' && (
                          <span className="text-xs text-muted-foreground">
                            {getSignalTypeLabel(event.signal_type || (event.metadata_json as Record<string, string>)?.signal_type || 'normal')}
                          </span>
                        )}
                        {event.system_id && event.tgid ? (
                          <Link
                            to={`/talkgroups/${event.system_id}:${event.tgid}`}
                            className={`${getEventTypeColor(event.event_type)} hover:underline`}
                          >
                            {getTalkgroupDisplayName(event.tgid, event.tg_alpha_tag)}
                          </Link>
                        ) : event.tgid ? (
                          <span className={getEventTypeColor(event.event_type)}>
                            {getTalkgroupDisplayName(event.tgid, event.tg_alpha_tag)}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateTime(event.time)}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(event.time)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent calls */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Calls ({calls.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {calls.length === 0 ? (
              <p className="text-muted-foreground">No calls recorded</p>
            ) : (
              <div className="max-h-96 overflow-auto">
                <CallList calls={calls} compact emptyMessage="No calls found" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
