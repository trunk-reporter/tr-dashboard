import { useEffect, useState, useMemo, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getTalkgroup, getTalkgroupCalls, getSystems } from '@/api/client'
import type { Talkgroup, Call, System } from '@/api/types'
import { useFilterStore } from '@/stores/useFilterStore'
import { useMonitorStore } from '@/stores/useMonitorStore'
import { useRealtimeStore } from '@/stores/useRealtimeStore'
import { useTranscriptionCache } from '@/stores/useTranscriptionCache'
import { useAudioStore, selectIsPlaying } from '@/stores/useAudioStore'
import { formatDateTime, formatRelativeTime, formatDuration, formatTime, formatFrequency, getUnitColorByRid } from '@/lib/utils'
import { TranscriptionPreview } from '@/components/calls/TranscriptionPreview'

export default function TalkgroupDetail() {
  const { id } = useParams<{ id: string }>()
  const [talkgroup, setTalkgroup] = useState<Talkgroup | null>(null)
  const [calls, setCalls] = useState<Call[]>([])
  const [systems, setSystems] = useState<System[]>([])
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

  // Real-time updates
  const activeCalls = useRealtimeStore((s) => s.activeCalls)
  const recentCalls = useRealtimeStore((s) => s.recentCalls)

  const fetchTranscription = useTranscriptionCache((s) => s.fetchTranscription)

  // Audio store for playback
  const loadCall = useAudioStore((s) => s.loadCall)
  const addToQueue = useAudioStore((s) => s.addToQueue)
  const clearQueue = useAudioStore((s) => s.clearQueue)
  const currentCall = useAudioStore((s) => s.currentCall)
  const isPlaying = useAudioStore(selectIsPlaying)

  // Fetch systems for name lookup
  useEffect(() => {
    getSystems().then((res) => setSystems(res.sites)).catch(console.error)
  }, [])

  useEffect(() => {
    if (!id) return

    setLoading(true)
    setError(null)

    Promise.all([getTalkgroup(id), getTalkgroupCalls(id, { limit: 100 })])
      .then(([tgRes, callsRes]) => {
        setTalkgroup(tgRes)
        const loadedCalls = callsRes.calls || []
        setCalls(loadedCalls)

        // Fetch transcriptions for loaded calls
        for (const call of loadedCalls) {
          if (call.tg_sysid && call.tgid && call.start_time) {
            const timestamp = Math.floor(new Date(call.start_time).getTime() / 1000)
            const callId = `${call.tg_sysid}:${call.tgid}:${timestamp}`
            fetchTranscription(callId)
          }
        }
      })
      .catch((err) => {
        console.error(err)
        if (err.status === 409) {
          setError('This talkgroup ID exists in multiple systems. Please use the format sysid:tgid.')
        } else {
          setError('Failed to load talkgroup details')
        }
      })
      .finally(() => setLoading(false))
  }, [id, fetchTranscription])

  // Add new calls from WebSocket to the top of the list
  useEffect(() => {
    if (!talkgroup) return

    // Filter recent calls for this talkgroup (compare as strings to handle type differences)
    const newCalls = recentCalls.filter(
      (rc) => String(rc.sysid) === String(talkgroup.sysid) && rc.tgid === talkgroup.tgid
    )

    if (newCalls.length > 0) {
      setCalls((prev) => {
        // Use call_id for deduplication
        const existingIds = new Set(
          prev.map((c) => {
            if (c.tg_sysid && c.tgid && c.start_time) {
              const ts = Math.floor(new Date(c.start_time).getTime() / 1000)
              return `${c.tg_sysid}:${c.tgid}:${ts}`
            }
            return String(c.id)
          })
        )
        const toAdd = newCalls.filter((nc) => !existingIds.has(nc.call_id || ''))
        if (toAdd.length === 0) return prev

        // Convert RecentCallInfo to Call format
        const converted: Call[] = toAdd.map((rc) => ({
          id: rc.id ?? 0,
          call_group_id: rc.call_group_id,
          instance_id: 0,
          system_id: 0,
          tr_call_id: rc.tr_call_id,
          call_num: rc.call_num,
          start_time: rc.start_time,
          stop_time: rc.stop_time,
          duration: rc.duration,
          call_state: 0,
          mon_state: 0,
          encrypted: rc.encrypted,
          emergency: rc.emergency,
          phase2_tdma: false,
          tdma_slot: 0,
          conventional: false,
          analog: false,
          audio_type: 'wav',
          freq: rc.freq,
          audio_url: rc.audio_url,
          tg_sysid: rc.sysid,
          tgid: rc.tgid,
          tg_alpha_tag: rc.tg_alpha_tag,
          units: rc.units?.map((u) => ({ unit_rid: u.unit_id, alpha_tag: u.unit_tag })),
        }))

        // Fetch transcriptions for new calls
        for (const call of converted) {
          if (call.tg_sysid && call.tgid && call.start_time) {
            const timestamp = Math.floor(new Date(call.start_time).getTime() / 1000)
            const callId = `${call.tg_sysid}:${call.tgid}:${timestamp}`
            fetchTranscription(callId)
          }
        }

        return [...converted, ...prev]
      })
    }
  }, [recentCalls, talkgroup, fetchTranscription])

  // Get system name from sysid
  const systemName = useMemo(() => {
    if (!talkgroup) return null
    const sys = systems.find((s) => s.sysid === talkgroup.sysid)
    return sys?.short_name || null
  }, [systems, talkgroup])

  // Check for active call on this talkgroup
  const activeCall = useMemo(() => {
    if (!talkgroup) return null
    return Array.from(activeCalls.values()).find(
      (call) => call.sysid === talkgroup.sysid && call.talkgroup === talkgroup.tgid && call.isActive
    )
  }, [activeCalls, talkgroup])

  // Extract unique units from all calls
  const unitStats = useMemo(() => {
    const unitMap = new Map<number, { unit_id: number; alpha_tag: string; count: number }>()

    for (const call of calls) {
      if (call.units) {
        for (const unit of call.units) {
          const unitId = unit.unit_rid
          // Skip invalid unit IDs
          if (unitId <= 0) continue

          const existing = unitMap.get(unitId)
          if (existing) {
            existing.count++
            if (!existing.alpha_tag && unit.alpha_tag) {
              existing.alpha_tag = unit.alpha_tag
            }
          } else {
            unitMap.set(unitId, {
              unit_id: unitId,
              alpha_tag: unit.alpha_tag || '',
              count: 1,
            })
          }
        }
      }
    }

    let units = Array.from(unitMap.values())

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
      const callId =
        startCall.tg_sysid && startCall.tgid && startCall.start_time
          ? `${startCall.tg_sysid}:${startCall.tgid}:${Math.floor(new Date(startCall.start_time).getTime() / 1000)}`
          : String(startCall.id)

      // Sort calls chronologically (oldest first)
      const sorted = [...calls].sort(
        (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      )

      // Find index of clicked call
      const startIndex = sorted.findIndex((c) => c.start_time === startCall.start_time)
      if (startIndex === -1) return

      // Clear queue and load the clicked call
      clearQueue()

      const toCallInfo = (call: Call) => ({
        id: call.id,
        call_id:
          call.tg_sysid && call.tgid && call.start_time
            ? `${call.tg_sysid}:${call.tgid}:${Math.floor(new Date(call.start_time).getTime() / 1000)}`
            : String(call.id),
        system: systemName || '',
        sysid: call.tg_sysid,
        tgid: call.tgid ?? 0,
        tg_alpha_tag: call.tg_alpha_tag,
        duration: call.duration,
        start_time: call.start_time,
        stop_time: call.stop_time || '',
        call_num: call.call_num,
        freq: call.freq,
        encrypted: call.encrypted,
        emergency: call.emergency,
        has_audio: !!call.audio_url || !!call.audio_path,
        audio_url: call.audio_url,
        audio_path: call.audio_path,
        units: call.units?.map((u) => ({ unit_id: u.unit_rid, unit_tag: u.alpha_tag })) || [],
      })

      // Load the first call
      loadCall(toCallInfo(sorted[startIndex]))

      // Queue remaining calls (after the clicked one)
      for (let i = startIndex + 1; i < sorted.length; i++) {
        addToQueue(toCallInfo(sorted[i]))
      }
    },
    [calls, clearQueue, loadCall, addToQueue, systemName]
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

  const favorite = isFavorite(talkgroup.sysid, talkgroup.tgid)
  const monitored = isMonitored(talkgroup.sysid, talkgroup.tgid)

  return (
    <div className="space-y-6">
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
            <Button
              variant={monitored ? 'default' : 'outline'}
              onClick={() => toggleTalkgroupMonitor(talkgroup.sysid, talkgroup.tgid)}
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
              onClick={() => toggleFavoriteTalkgroup(talkgroup.sysid, talkgroup.tgid)}
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
        <Badge variant="outline" className="font-mono text-base">
          TGID: {talkgroup.tgid}
        </Badge>
        {talkgroup.group && <Badge variant="secondary">{talkgroup.group}</Badge>}
        {talkgroup.tag && <Badge variant="secondary">{talkgroup.tag}</Badge>}
        {talkgroup.mode === 'D' && <Badge variant="outline">Digital</Badge>}
        {talkgroup.mode === 'A' && <Badge variant="outline">Analog</Badge>}
        {talkgroup.mode === 'E' && <Badge variant="destructive">Encrypted</Badge>}
        {talkgroup.priority > 0 && <Badge variant="warning">Priority {talkgroup.priority}</Badge>}
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Calls</p>
            <p className="text-2xl font-bold">{talkgroup.call_count?.toLocaleString() ?? '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Calls (24h)</p>
            <p className="text-2xl font-bold">{talkgroup.calls_24h?.toLocaleString() ?? '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Calls (1h)</p>
            <p className="text-2xl font-bold">{talkgroup.calls_1h ?? '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Active Units</p>
            <p className="text-2xl font-bold">{talkgroup.unit_count?.toLocaleString() ?? '—'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Details card - refined */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div>
              <p className="text-muted-foreground">First Seen</p>
              <p>{formatDateTime(talkgroup.first_seen)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Last Seen</p>
              <p>{formatDateTime(talkgroup.last_seen)}</p>
              <p className="text-xs text-muted-foreground">
                {formatRelativeTime(talkgroup.last_seen)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">System</p>
              <p>
                {systemName && <span className="font-medium">{systemName}</span>}
                {systemName && ' '}
                <span className="font-mono text-muted-foreground">({talkgroup.sysid})</span>
              </p>
            </div>
            {talkgroup.mode && talkgroup.mode !== 'D' && talkgroup.mode !== 'A' && talkgroup.mode !== 'E' && (
              <div>
                <p className="text-muted-foreground">Mode</p>
                <p>{talkgroup.mode}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

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
                <Link key={unit.unit_id} to={`/units/${talkgroup.sysid}:${unit.unit_id}`}>
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
          <h2 className="text-lg font-semibold">Recent Calls ({calls.length})</h2>
          <p className="text-xs text-muted-foreground">Click to play from that point →</p>
        </div>

        {calls.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            No calls recorded for this talkgroup
          </div>
        ) : (
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
            {calls.map((call) => {
              const callId =
                call.tg_sysid && call.tgid && call.start_time
                  ? `${call.tg_sysid}:${call.tgid}:${Math.floor(new Date(call.start_time).getTime() / 1000)}`
                  : String(call.id)
              const isCurrentlyPlaying = currentCall?.callId === callId
              const units = call.units?.filter((u) => u.unit_rid > 0) || []
              const uniqueUnitRids = [...new Set(units.map((u) => u.unit_rid))]

              return (
                <div
                  key={callId}
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
                    {call.freq > 0 && (
                      <span className="font-mono text-xs text-muted-foreground">{formatFrequency(call.freq)}</span>
                    )}
                    <span className="ml-auto font-mono text-xs">{formatDuration(call.duration)}</span>
                    {call.emergency && (
                      <span className="px-1 py-0.5 text-[10px] font-bold bg-destructive text-white rounded">EMERG</span>
                    )}
                    {call.encrypted && (
                      <span className="px-1 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground rounded">ENC</span>
                    )}
                  </div>

                  {/* Row 2: Transcription (wraps) */}
                  <div className="text-sm mb-1">
                    <TranscriptionPreview callId={callId} />
                  </div>

                  {/* Row 3: Units */}
                  {units.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {units.map((u, i) => {
                        const color = getUnitColorByRid(u.unit_rid, uniqueUnitRids)
                        return (
                          <span
                            key={i}
                            className={`px-1.5 py-0.5 text-[10px] rounded border ${color?.bg || 'bg-muted'} ${color?.text || ''} ${color?.border || ''}`}
                          >
                            {u.alpha_tag || u.unit_rid}
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
