import { useEffect, useState, useMemo, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getTalkgroup, getTalkgroupCalls } from '@/api/client'
import type { Talkgroup, Call } from '@/api/types'
import { useTranscriptionCache } from '@/stores/useTranscriptionCache'
import { useFilterStore } from '@/stores/useFilterStore'
import { useMonitorStore } from '@/stores/useMonitorStore'
import { useRealtimeStore } from '@/stores/useRealtimeStore'
import { useAudioStore, selectIsPlaying } from '@/stores/useAudioStore'
import { formatDateTime, formatRelativeTime, formatDuration, formatTime, formatFrequency, getUnitColorByRid } from '@/lib/utils'
import { TranscriptionPreview } from '@/components/calls/TranscriptionPreview'
import { CopyableId } from '@/components/ui/copyable-id'
import { Sparkline } from '@/components/ui/sparkline'

export default function TalkgroupDetail() {
  const { id } = useParams<{ id: string }>()
  const [talkgroup, setTalkgroup] = useState<Talkgroup | null>(null)
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unitSort, setUnitSort] = useState<'alpha_tag' | 'unit_id' | 'count'>('count')
  const [unitSortDir, setUnitSortDir] = useState<'asc' | 'desc'>('desc')

  // Subscribe to state to trigger re-renders
  const favoriteTalkgroups = useFilterStore((s) => s.favoriteTalkgroups)
  const isFavorite = useFilterStore((s) => s.isFavorite)
  const toggleFavoriteTalkgroup = useFilterStore((s) => s.toggleFavoriteTalkgroup)
  const monitoredTalkgroups = useMonitorStore((s) => s.monitoredTalkgroups)
  const isMonitored = useMonitorStore((s) => s.isMonitored)
  const toggleTalkgroupMonitor = useMonitorStore((s) => s.toggleTalkgroupMonitor)
  void favoriteTalkgroups
  void monitoredTalkgroups

  // Transcription cache
  const fetchTranscription = useTranscriptionCache((s) => s.fetchTranscription)

  // Real-time updates
  const activeCalls = useRealtimeStore((s) => s.activeCalls)

  // Audio store for playback
  const loadCall = useAudioStore((s) => s.loadCall)
  const addToQueue = useAudioStore((s) => s.addToQueue)
  const clearQueue = useAudioStore((s) => s.clearQueue)
  const currentCall = useAudioStore((s) => s.currentCall)
  const isPlaying = useAudioStore(selectIsPlaying)

  useEffect(() => {
    if (!id) return

    setLoading(true)
    setError(null)

    Promise.all([getTalkgroup(id), getTalkgroupCalls(id, { limit: 100 })])
      .then(([tgRes, callsRes]) => {
        setTalkgroup(tgRes)
        const fetched = callsRes.calls || []
        setCalls(fetched)
        for (const call of fetched) {
          if (call.has_transcription) {
            fetchTranscription(call.call_id)
          }
        }
      })
      .catch((err) => {
        console.error(err)
        if (err.status === 409) {
          setError('This talkgroup ID exists in multiple systems. Please use the format system_id:tgid.')
        } else {
          setError('Failed to load talkgroup details')
        }
      })
      .finally(() => setLoading(false))
  }, [id])

  // Check for active call on this talkgroup
  const activeCall = useMemo(() => {
    if (!talkgroup) return null
    return Array.from(activeCalls.values()).find(
      (call) => call.system_id === talkgroup.system_id && call.tgid === talkgroup.tgid
    ) ?? null
  }, [activeCalls, talkgroup])

  // Extract unique units from all calls using CallUnit data
  const unitStats = useMemo(() => {
    const unitMap = new Map<number, { unit_id: number; alpha_tag: string; count: number }>()

    for (const call of calls) {
      if (call.units) {
        for (const unit of call.units) {
          if (unit.unit_id <= 0) continue

          const existing = unitMap.get(unit.unit_id)
          if (existing) {
            existing.count++
            if (!existing.alpha_tag && unit.alpha_tag) {
              existing.alpha_tag = unit.alpha_tag
            }
          } else {
            unitMap.set(unit.unit_id, {
              unit_id: unit.unit_id,
              alpha_tag: unit.alpha_tag || '',
              count: 1,
            })
          }
        }
      }
    }

    const units = Array.from(unitMap.values())

    // Sort
    units.sort((a, b) => {
      let cmp = 0
      switch (unitSort) {
        case 'alpha_tag':
          cmp = (a.alpha_tag || '').localeCompare(b.alpha_tag || '')
          break
        case 'unit_id':
          cmp = a.unit_id - b.unit_id
          break
        case 'count':
          cmp = a.count - b.count
          break
      }
      return unitSortDir === 'desc' ? -cmp : cmp
    })

    return units
  }, [calls, unitSort, unitSortDir])

  // Play from this call and queue all subsequent calls
  const playFromCall = useCallback(
    (startCall: Call) => {
      // Sort calls chronologically (oldest first)
      const sorted = [...calls].sort(
        (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      )

      const startIndex = sorted.findIndex((c) => c.call_id === startCall.call_id)
      if (startIndex === -1) return

      clearQueue()
      loadCall(sorted[startIndex])

      // Queue remaining calls (after the clicked one)
      for (let i = startIndex + 1; i < sorted.length; i++) {
        addToQueue(sorted[i])
      }
    },
    [calls, clearQueue, loadCall, addToQueue]
  )

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Loading...
      </div>
    )
  }

  if (error || !talkgroup) {
    return (
      <div className="space-y-4">
        <div className="flex h-64 items-center justify-center text-destructive">
          {error || 'Talkgroup not found'}
        </div>
        <div className="text-center">
          <Link to="/talkgroups" className="text-primary hover:underline">
            ← Back to talkgroups
          </Link>
        </div>
      </div>
    )
  }

  const favorite = isFavorite(talkgroup.system_id, talkgroup.tgid)
  const monitored = isMonitored(talkgroup.system_id, talkgroup.tgid)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <div className="mb-2">
          <Link to="/talkgroups" className="text-sm text-muted-foreground hover:underline">
            ← Back to talkgroups
          </Link>
        </div>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">
                {talkgroup.alpha_tag || `TG ${talkgroup.tgid}`}
              </h1>
              {activeCall && (
                <span className="px-2 py-1 text-xs font-bold bg-live text-white rounded animate-pulse">
                  LIVE
                </span>
              )}
            </div>
            <p className="text-muted-foreground">
              {talkgroup.description || talkgroup.group || 'No description'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link to={`/talkgroups/${id}/analytics`}>
              <Button variant="outline">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                  <path d="M3 3v18h18" />
                  <path d="M7 16l4-8 4 4 4-10" />
                </svg>
                Analytics
              </Button>
            </Link>
            <Button
              variant={monitored ? 'default' : 'outline'}
              onClick={() => toggleTalkgroupMonitor(talkgroup.system_id, talkgroup.tgid)}
              className={monitored ? 'bg-live hover:bg-live/90' : ''}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill={monitored ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="2"
                className="mr-2"
              >
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
              {monitored ? 'Monitoring' : 'Monitor'}
            </Button>
            <Button
              variant={favorite ? 'default' : 'outline'}
              onClick={() => toggleFavoriteTalkgroup(talkgroup.system_id, talkgroup.tgid)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill={favorite ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="2"
                className="mr-2"
              >
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              {favorite ? 'Favorited' : 'Favorite'}
            </Button>
          </div>
        </div>
      </div>

      {/* Info badges */}
      <div className="flex flex-wrap gap-2">
        <CopyableId value={String(talkgroup.tgid)} label="TGID" className="text-base" />
        {talkgroup.group && <Badge variant="secondary">{talkgroup.group}</Badge>}
        {talkgroup.tag && <Badge variant="secondary">{talkgroup.tag}</Badge>}
        {talkgroup.mode === 'D' && <Badge variant="outline">Digital</Badge>}
        {talkgroup.mode === 'A' && <Badge variant="outline">Analog</Badge>}
        {talkgroup.mode === 'E' && <Badge variant="destructive">Encrypted</Badge>}
        {talkgroup.priority != null && talkgroup.priority > 0 && <Badge variant="warning">Priority {talkgroup.priority}</Badge>}
      </div>

      {/* Stats + Details — compact inline */}
      <div className="rounded-lg border px-4 py-3 space-y-2">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <div>
            <span className="text-muted-foreground">Total </span>
            <span className="font-bold tabular-nums">{talkgroup.call_count?.toLocaleString() ?? '—'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">24h </span>
            <span className="font-bold tabular-nums">{talkgroup.calls_24h?.toLocaleString() ?? '—'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">1h </span>
            <span className="font-bold tabular-nums">{talkgroup.calls_1h ?? '—'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Units </span>
            <span className="font-bold tabular-nums">{talkgroup.unit_count?.toLocaleString() ?? '—'}</span>
          </div>
          <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
            {talkgroup.system_name && (
              <span>
                <span className="font-medium text-foreground">{talkgroup.system_name}</span>
                {' '}
                <span className="font-mono">({talkgroup.system_id})</span>
              </span>
            )}
            <span>First {formatDateTime(talkgroup.first_seen || '')}</span>
            <span>Last {formatRelativeTime(talkgroup.last_seen || '')}</span>
          </div>
        </div>
      </div>

      {/* Units list */}
      {unitStats.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Units ({unitStats.length})</CardTitle>
              <div className="flex items-center gap-2">
                <select
                  value={`${unitSort}:${unitSortDir}`}
                  onChange={(e) => {
                    const [sort, dir] = e.target.value.split(':')
                    setUnitSort(sort as typeof unitSort)
                    setUnitSortDir(dir as typeof unitSortDir)
                  }}
                  className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                >
                  <option value="count:desc">Most Active</option>
                  <option value="count:asc">Least Active</option>
                  <option value="alpha_tag:asc">Name (A-Z)</option>
                  <option value="alpha_tag:desc">Name (Z-A)</option>
                  <option value="unit_id:asc">ID (Low-High)</option>
                  <option value="unit_id:desc">ID (High-Low)</option>
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {unitStats.slice(0, 50).map((unit) => (
                <Link key={unit.unit_id} to={`/units/${talkgroup.system_id}:${unit.unit_id}`}>
                  <Badge variant="outline" className="text-xs hover:bg-accent cursor-pointer">
                    {unit.alpha_tag || unit.unit_id}
                    <span className="ml-1 text-muted-foreground">({unit.count})</span>
                  </Badge>
                </Link>
              ))}
              {unitStats.length > 50 && (
                <Badge variant="outline" className="text-xs">
                  +{unitStats.length - 50} more
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent calls - compact list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold">Recent Calls ({calls.length})</h2>
            {calls.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Duration</span>
                <div className="w-32">
                  <Sparkline
                    data={[...calls].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()).map((c) => c.duration ?? 0)}
                  />
                </div>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Click to play from that point →</p>
        </div>

        {calls.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            No calls recorded for this talkgroup
          </div>
        ) : (
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
            {calls.map((call) => {
              const isCurrentlyPlaying = currentCall?.callId === call.call_id
              const units = call.units?.filter((u) => u.unit_id > 0) || []
              const uniqueUnitIds = [...new Set(units.map((u) => u.unit_id))]

              return (
                <div
                  key={call.call_id}
                  onClick={() => playFromCall(call)}
                  className={`rounded-md border px-3 py-2 cursor-pointer transition-colors hover:bg-accent/50 ${
                    isCurrentlyPlaying ? 'border-primary bg-primary/5' : 'bg-card'
                  }`}
                >
                  {/* Row 1: Play, Time, Duration, Badges */}
                  <div className="flex items-center gap-2 mb-1">
                    <div className="shrink-0">
                      {isCurrentlyPlaying && isPlaying ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-primary">
                          <rect x="6" y="4" width="4" height="16" />
                          <rect x="14" y="4" width="4" height="16" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-muted-foreground">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{formatTime(call.start_time)}</span>
                    {call.freq != null && call.freq > 0 && (
                      <span className="font-mono text-xs text-muted-foreground">{formatFrequency(call.freq)}</span>
                    )}
                    <span className="ml-auto font-mono text-xs">{formatDuration(call.duration ?? 0)}</span>
                    {call.emergency && (
                      <span className="px-1 py-0.5 text-[10px] font-bold bg-destructive text-white rounded">EMERG</span>
                    )}
                    {call.encrypted && (
                      <span className="px-1 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground rounded">ENC</span>
                    )}
                  </div>

                  {/* Row 2: Transcription (wraps) */}
                  <div className="text-sm mb-1">
                    <TranscriptionPreview callId={call.call_id} />
                  </div>

                  {/* Row 3: Units */}
                  {units.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {units.map((u, i) => {
                        const color = getUnitColorByRid(u.unit_id, uniqueUnitIds)
                        return (
                          <span
                            key={i}
                            className={`px-1.5 py-0.5 text-[10px] rounded border ${color?.bg || 'bg-muted'} ${color?.text || ''} ${color?.border || ''}`}
                          >
                            {u.alpha_tag || u.unit_id}
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
