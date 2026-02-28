import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CallList } from '@/components/calls/CallList'
import { getUnit, getUnitEvents, getUnitCalls } from '@/api/client'
import type { Unit, UnitEvent, Call } from '@/api/types'
import {
  formatDateTime,
  formatRelativeTime,
  getEventTypeLabel,
  getEventTypeColor,
  getTalkgroupDisplayName,
} from '@/lib/utils'
import { CopyableId } from '@/components/ui/copyable-id'

export default function UnitDetail() {
  const { id } = useParams<{ id: string }>()
  const [unit, setUnit] = useState<Unit | null>(null)
  const [events, setEvents] = useState<UnitEvent[]>([])
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return

    setLoading(true)
    setError(null)

    // id is in format "system_id:unit_id" or plain "unit_id"
    Promise.all([
      getUnit(id),
      getUnitEvents(id, { limit: 50 }),
      getUnitCalls(id, { limit: 20 }),
    ])
      .then(([unitRes, eventsRes, callsRes]) => {
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
            {unit.alpha_tag || `Unit ${unit.unit_id}`}
          </h1>
          <CopyableId value={String(unit.unit_id)} />
          {unit.alpha_tag_source && (
            <Badge variant="secondary" className="text-xs">Source: {unit.alpha_tag_source}</Badge>
          )}
        </div>
        <p className="text-muted-foreground text-sm">
          {unit.system_name && `${unit.system_name} `}
          <span className="font-mono text-muted-foreground/70">({unit.system_id})</span>
        </p>
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
                    className="flex items-center justify-between rounded-lg border bg-card p-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {getEventTypeLabel(event.event_type)}
                        </Badge>
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
