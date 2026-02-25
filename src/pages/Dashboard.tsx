import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card'
import { useRealtimeStore } from '@/stores/useRealtimeStore'
import { useAudioStore, selectIsPlaying } from '@/stores/useAudioStore'
import { useTranscriptionCache } from '@/stores/useTranscriptionCache'
import { useMonitorStore } from '@/stores/useMonitorStore'
import { useFilterStore } from '@/stores/useFilterStore'
import { TranscriptionPreview } from '@/components/calls/TranscriptionPreview'
import { getStats, getCalls, getRecorders } from '@/api/client'
import { useTalkgroupColors } from '@/stores/useTalkgroupColors'
import type { StatsResponse, Call, Recorder } from '@/api/types'
import {
  formatDecodeRate,
  normalizeDecodeRate,
  formatDuration,
  formatFrequency,
  formatRelativeTime,
  formatTime,
  getTalkgroupDisplayName,
  getUnitColorByRid,
  cn,
} from '@/lib/utils'
import { REFRESH_INTERVALS } from '@/lib/constants'
import { SkeletonCard } from '@/components/ui/skeleton'

// Recorder state config - keyed by string rec_state
const RECORDER_STATES: Record<string, { label: string; badgeClass: string; cardClass: string; dotColor: string }> = {
  available: { label: 'AVAILABLE', badgeClass: 'bg-indigo-800 text-indigo-300', cardClass: 'border-indigo-800/30 bg-indigo-950/20 card-recessed', dotColor: 'bg-indigo-500' },
  recording: { label: 'RECORDING', badgeClass: 'bg-live text-white', cardClass: 'border-live/50 bg-red-950/40 card-recording-glow', dotColor: 'bg-live animate-pulse' },
  idle: { label: 'IDLE', badgeClass: 'bg-amber-700 text-amber-200', cardClass: 'border-amber-700/40 bg-amber-950/20 card-recessed', dotColor: 'bg-amber-500' },
  stopped: { label: 'STOPPED', badgeClass: 'bg-red-900 text-red-300', cardClass: 'border-red-900/40 bg-red-950/20 card-recessed', dotColor: 'bg-red-400' },
}
const DEFAULT_STATE = { label: 'UNKNOWN', badgeClass: 'bg-zinc-700 text-zinc-400', cardClass: 'border-zinc-700/30 bg-zinc-900/20 card-recessed', dotColor: 'bg-zinc-500' }

// Elapsed time display component
function RecorderElapsed({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - startTime) / 1000))

  useEffect(() => {
    setElapsed(Math.floor((Date.now() - startTime) / 1000))
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [startTime])

  return <span className="font-mono tabular-nums">{formatDuration(elapsed)}</span>
}

// Track recording start times for elapsed display
const recordingStartMap = new Map<string, number>()
const lastCallDurationMap = new Map<string, number>()

export default function Dashboard() {
  const realtimeRecorders = useRealtimeStore((s) => s.recorders)
  const decodeRates = useRealtimeStore((s) => s.decodeRates)
  const connectionStatus = useRealtimeStore((s) => s.connectionStatus)

  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [recentCalls, setRecentCalls] = useState<Call[]>([])
  const [apiRecorders, setApiRecorders] = useState<Recorder[]>([])
  const [loading, setLoading] = useState(true)

  // Filter state for recent calls
  const [filterFavorites, setFilterFavorites] = useState(false)
  const [filterMonitored, setFilterMonitored] = useState(false)
  const [filterTranscribed, setFilterTranscribed] = useState(false)
  const [filterEmergency, setFilterEmergency] = useState(false)
  const [filterLong, setFilterLong] = useState(false)

  // Recorder grid collapse state (default collapsed, persisted to sessionStorage)
  const [recordersExpanded, setRecordersExpanded] = useState(() => {
    return sessionStorage.getItem('dashboard-recorders-expanded') === 'true'
  })

  useEffect(() => {
    sessionStorage.setItem('dashboard-recorders-expanded', String(recordersExpanded))
  }, [recordersExpanded])

  // Pause refresh when hovering over recent calls
  const isHoveringRef = useRef(false)

  const TARGET_CALLS = 24
  const FILTERED_POOL = 500

  const fetchTranscription = useTranscriptionCache((s) => s.fetchTranscription)
  const getEntry = useTranscriptionCache((s) => s.getEntry)
  const loadCall = useAudioStore((s) => s.loadCall)
  const currentCall = useAudioStore((s) => s.currentCall)
  const isPlaying = useAudioStore(selectIsPlaying)
  const getCachedColor = useTalkgroupColors((s) => s.getCachedColor)
  const isFavorite = useFilterStore((s) => s.isFavorite)
  const isMonitored = useMonitorStore((s) => s.isMonitored)

  const fetchTranscriptionsForCalls = useCallback((calls: Call[]) => {
    for (const call of calls) {
      if (call.call_id && call.has_transcription) {
        fetchTranscription(call.call_id)
      }
    }
  }, [fetchTranscription])

  const hasActiveFilter = filterFavorites || filterMonitored || filterTranscribed || filterEmergency || filterLong

  // Dedup calls by call_id
  const dedupCalls = useCallback((calls: Call[]) => {
    const seen = new Set<number>()
    return calls.filter(c => {
      if (seen.has(c.call_id)) return false
      seen.add(c.call_id)
      return true
    })
  }, [])

  // Fetch initial data
  useEffect(() => {
    Promise.all([
      getStats(),
      getCalls({ sort: '-stop_time', deduplicate: true, limit: TARGET_CALLS }),
      getRecorders(),
    ])
      .then(([statsRes, callsRes, recordersRes]) => {
        setStats(statsRes)
        setRecentCalls(dedupCalls(callsRes.calls || []))
        setApiRecorders(recordersRes.recorders || [])
        fetchTranscriptionsForCalls(callsRes.calls || [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fetch larger pool when filters become active
  useEffect(() => {
    if (loading || !hasActiveFilter) return

    getCalls({ sort: '-stop_time', deduplicate: true, limit: FILTERED_POOL })
      .then((res) => {
        setRecentCalls(dedupCalls(res.calls || []))
        fetchTranscriptionsForCalls(res.calls || [])
      })
      .catch(console.error)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActiveFilter, loading])

  // Refresh stats periodically
  useEffect(() => {
    const interval = setInterval(() => {
      getStats().then(setStats).catch(console.error)
    }, REFRESH_INTERVALS.STATS)
    return () => clearInterval(interval)
  }, [])

  // Refresh recent calls periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (isHoveringRef.current) return
      getCalls({ sort: '-stop_time', deduplicate: true, limit: TARGET_CALLS })
        .then((res) => {
          const newCalls = res.calls || []
          setRecentCalls((prev) => {
            const deduped = dedupCalls(newCalls)
            const newIds = new Set(deduped.map(c => c.call_id))
            const kept = prev.filter(c => !newIds.has(c.call_id))
            return [...deduped, ...kept].slice(0, FILTERED_POOL)
          })
          fetchTranscriptionsForCalls(newCalls)
        })
        .catch(console.error)
    }, REFRESH_INTERVALS.RECENT_CALLS)
    return () => clearInterval(interval)
  }, [fetchTranscriptionsForCalls, dedupCalls])

  // Refresh recorders periodically
  useEffect(() => {
    const interval = setInterval(() => {
      getRecorders().then((res) => {
        setApiRecorders(res.recorders || [])
      }).catch(console.error)
    }, REFRESH_INTERVALS.STATS)
    return () => clearInterval(interval)
  }, [])

  // Merge API recorders with realtime updates
  const mergedRecorders = useMemo(() => {
    // Build map from realtime recorders by id
    const realtimeMap = new Map<string, Recorder>()
    for (const r of realtimeRecorders) {
      realtimeMap.set(r.id, r)
    }

    // Start with API recorders, overlay realtime data
    const activeRecorders = apiRecorders.filter(r => (r.count ?? 0) > 0)

    return activeRecorders
      .map((apiRec) => {
        const realtime = realtimeMap.get(apiRec.id)
        const merged: Recorder = { ...apiRec, ...realtime, id: apiRec.id }

        // Track recording start/end for elapsed time
        const isRecording = merged.rec_state === 'recording'
        if (isRecording && !recordingStartMap.has(merged.id)) {
          recordingStartMap.set(merged.id, Date.now())
        } else if (!isRecording && recordingStartMap.has(merged.id)) {
          const startTime = recordingStartMap.get(merged.id)!
          lastCallDurationMap.set(merged.id, Math.floor((Date.now() - startTime) / 1000))
          recordingStartMap.delete(merged.id)
        }

        return merged
      })
      .sort((a, b) => (a.rec_num ?? 0) - (b.rec_num ?? 0))
  }, [apiRecorders, realtimeRecorders])

  const systemsArray = Array.from(decodeRates.values())
  const avgDecodeRate = systemsArray.length > 0
    ? systemsArray.reduce((acc, s) => acc + normalizeDecodeRate(s.decode_rate), 0) / systemsArray.length
    : 0

  const recordingCount = mergedRecorders.filter(r => (r.rec_state ?? '').toLowerCase() === 'recording').length
  const usedCount = mergedRecorders.length
  const totalCount = apiRecorders.length

  // Filter recent calls based on active filters
  const filteredCalls = useMemo(() => {
    if (!hasActiveFilter) return recentCalls.slice(0, TARGET_CALLS)

    return recentCalls.filter((call) => {
      if (filterFavorites && !isFavorite(call.system_id, call.tgid)) return false
      if (filterMonitored && !isMonitored(call.system_id, call.tgid)) return false
      if (filterTranscribed) {
        if (!call.has_transcription && !call.transcription_text) return false
      }
      if (filterEmergency && !call.emergency) return false
      if (filterLong && (call.duration ?? 0) < 30) return false

      return true
    }).slice(0, TARGET_CALLS)
  }, [recentCalls, hasActiveFilter, filterFavorites, filterMonitored, filterTranscribed, filterEmergency, filterLong, isFavorite, isMonitored])

  const handlePlayCall = (call: Call) => {
    if (!call.audio_url) return
    loadCall(call)
  }

  return (
    <div className="space-y-4">
      {/* Compact stats bar */}
      <div className="flex flex-wrap items-center gap-4 lg:gap-6 rounded-lg border stat-bar-glass px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Recorders</span>
          <span className="text-xl font-bold tabular-nums">{recordingCount}</span>
          <span className="text-sm text-muted-foreground">/ {usedCount} / {totalCount}</span>
          {recordingCount > 0 && (
            <span className="h-2 w-2 rounded-full bg-live animate-pulse" />
          )}
        </div>
        <div className="h-6 w-px bg-border hidden sm:block" />
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">24h</span>
          <span className="text-xl font-bold tabular-nums">
            {stats?.calls_24h?.toLocaleString() ?? '—'}
          </span>
          <span className="text-xs text-muted-foreground">
            ({stats?.calls_1h?.toLocaleString() ?? '—'}/1h)
          </span>
        </div>
        <div className="h-6 w-px bg-border hidden sm:block" />
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Systems</span>
          <span className="text-xl font-bold tabular-nums">{systemsArray.length}</span>
          <Badge
            variant={connectionStatus === 'connected' ? 'success' : 'secondary'}
            className="text-xs"
          >
            {connectionStatus}
          </Badge>
        </div>
        <div className="h-6 w-px bg-border hidden sm:block" />
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Decode</span>
          <span className={cn(
            "text-xl font-bold tabular-nums",
            avgDecodeRate >= 0.9 ? 'text-success' : avgDecodeRate >= 0.7 ? 'text-warning' : avgDecodeRate > 0 ? 'text-destructive' : ''
          )}>
            {avgDecodeRate > 0 ? formatDecodeRate(avgDecodeRate) : '—'}
          </span>
        </div>
        {stats?.total_duration_hours != null && (
          <>
            <div className="hidden lg:flex ml-auto items-center gap-2">
              <span className="text-sm text-muted-foreground">Audio</span>
              <span className="font-medium">{stats.total_duration_hours.toFixed(0)}h</span>
            </div>
          </>
        )}
      </div>

      {/* Recorders grid — collapsible */}
      {mergedRecorders.length > 0 && (
        <div>
          {/* Summary bar — always visible, clickable to toggle */}
          <button
            onClick={() => setRecordersExpanded((v) => !v)}
            className="w-full flex items-center gap-3 rounded-lg border stat-bar-glass px-3 py-2 group cursor-pointer"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={cn(
                "text-muted-foreground transition-transform duration-200 shrink-0",
                recordersExpanded && "rotate-90"
              )}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span className="section-header">RECORDERS</span>
            <span className="text-xs text-muted-foreground">
              {recordingCount} recording / {usedCount} used / {totalCount} available
            </span>
            <div className="flex items-center gap-1 ml-2">
              {mergedRecorders.map((rec) => {
                const stateInfo = RECORDER_STATES[(rec.rec_state ?? 'available').toLowerCase()] || DEFAULT_STATE
                return (
                  <span
                    key={rec.id}
                    className={cn("h-2 w-2 rounded-full shrink-0", stateInfo.dotColor)}
                    title={`REC ${rec.rec_num ?? 0}: ${stateInfo.label}`}
                  />
                )
              })}
            </div>
            <span className="ml-auto text-xs text-muted-foreground/0 group-hover:text-muted-foreground/60 transition-colors">
              {recordersExpanded ? 'collapse' : 'expand'}
            </span>
          </button>

          {/* Animated expandable grid */}
          <div
            className={cn(
              "grid transition-all duration-300 ease-in-out",
              recordersExpanded ? "grid-rows-[1fr] opacity-100 mt-2" : "grid-rows-[0fr] opacity-0"
            )}
          >
            <div className="overflow-hidden">
              <div
                className="grid gap-1.5"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
              >
                {mergedRecorders.map((rec) => {
                  const stateInfo = RECORDER_STATES[(rec.rec_state ?? 'available').toLowerCase()] || DEFAULT_STATE
                  const recStartTime = recordingStartMap.get(rec.id)
                  const lastDuration = lastCallDurationMap.get(rec.id)

                  // Get color for talkgroup
                  const tgColor = rec.tgid
                    ? getCachedColor(0, rec.tgid, {
                        alpha_tag: rec.tg_alpha_tag ?? undefined,
                        tgid: rec.tgid,
                      })
                    : null

                  return (
                    <div
                      key={rec.id}
                      className={cn(
                        "rounded-lg border p-2.5 transition-all min-h-[100px] flex flex-col",
                        stateInfo.cardClass
                      )}
                    >
                      {/* Header: recorder info + state badge */}
                      <div className="flex items-start justify-between gap-1">
                        <span className="text-[10px] font-mono text-muted-foreground">
                          SRC {rec.src_num ?? 0} / REC {rec.rec_num ?? 0}
                        </span>
                        <Badge className={cn("text-[10px] px-1.5 py-0 h-5 font-bold shrink-0", stateInfo.badgeClass)}>
                          {stateInfo.label}
                        </Badge>
                      </div>

                      {/* Frequency + recording time */}
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-muted-foreground">
                          {rec.freq ? formatFrequency(rec.freq) : '—'}
                        </span>
                        {recStartTime && (
                          <span className="text-live font-medium">
                            <RecorderElapsed startTime={recStartTime} />
                          </span>
                        )}
                      </div>

                      {/* TG/Unit context */}
                      <div className="border-t border-border/30 pt-1 mt-0.5 space-y-0.5 flex-1">
                        <div className="flex items-center gap-1.5">
                          {rec.tgid ? (
                            <span
                              className={cn("truncate text-sm", !tgColor && "text-sky-400")}
                              style={tgColor ? { color: tgColor } : undefined}
                              title={rec.tg_alpha_tag || `TG ${rec.tgid}`}
                            >
                              {rec.tg_alpha_tag || `TG ${rec.tgid}`}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground/50">—</span>
                          )}
                          {!recStartTime && lastDuration !== undefined && (
                            <span className="text-[11px] font-mono text-muted-foreground shrink-0">
                              {formatDuration(lastDuration)}
                            </span>
                          )}
                        </div>
                        <div className="truncate text-sm text-amber-400" title={rec.unit_alpha_tag || (rec.unit_id ? `Unit ${rec.unit_id}` : '')}>
                          {rec.unit_alpha_tag || (rec.unit_id ? `Unit ${rec.unit_id}` : <span className="text-muted-foreground/50">—</span>)}
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between mt-1 pt-1 border-t border-border/20">
                        <span className="text-[10px] font-mono text-muted-foreground/70">
                          {rec.count ?? 0} calls
                          {(rec.duration ?? 0) > 0 && ` • ${((rec.duration ?? 0) / 60).toFixed(1)}m`}
                        </span>
                        <span className="text-[10px] text-muted-foreground/50 uppercase">
                          {rec.type ?? 'P25'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* System status - compact inline */}
      {systemsArray.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {systemsArray.map((rate) => (
            <div
              key={rate.sys_name || rate.system_id}
              className="flex items-center gap-3 rounded-lg border bg-card card-glass px-3 py-2"
            >
              <div>
                <div className="font-medium capitalize text-sm">
                  {rate.sys_name || rate.system_name || `System ${rate.system_id}`}
                </div>
              </div>
              {(() => {
                const norm = normalizeDecodeRate(rate.decode_rate)
                return (
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className={cn(
                          "h-full transition-all",
                          norm >= 0.9 ? 'bg-success' : norm >= 0.7 ? 'bg-warning' : 'bg-destructive'
                        )}
                        style={{ width: `${norm * 100}%` }}
                      />
                    </div>
                    <span className={cn(
                      "text-sm font-bold tabular-nums w-12",
                      norm >= 0.9 ? 'text-success' : norm >= 0.7 ? 'text-warning' : 'text-destructive'
                    )}>
                      {formatDecodeRate(rate.decode_rate)}
                    </span>
                  </div>
                )
              })()}
            </div>
          ))}
        </div>
      )}

      {/* Recent calls */}
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="section-header">RECENT CALLS</h2>
          <div className="flex flex-wrap items-center gap-1">
            <button
              onClick={() => setFilterFavorites(!filterFavorites)}
              className={cn(
                "px-2 py-0.5 text-xs rounded-full border transition-colors",
                filterFavorites
                  ? "bg-amber-500 text-white border-amber-500"
                  : "bg-transparent text-muted-foreground border-border hover:border-amber-500/50"
              )}
            >
              Favorites
            </button>
            <button
              onClick={() => setFilterMonitored(!filterMonitored)}
              className={cn(
                "px-2 py-0.5 text-xs rounded-full border transition-colors",
                filterMonitored
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border hover:border-primary/50"
              )}
            >
              Monitored
            </button>
            <button
              onClick={() => setFilterTranscribed(!filterTranscribed)}
              className={cn(
                "px-2 py-0.5 text-xs rounded-full border transition-colors",
                filterTranscribed
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border hover:border-primary/50"
              )}
            >
              Transcribed
            </button>
            <button
              onClick={() => setFilterEmergency(!filterEmergency)}
              className={cn(
                "px-2 py-0.5 text-xs rounded-full border transition-colors",
                filterEmergency
                  ? "bg-destructive text-destructive-foreground border-destructive"
                  : "bg-transparent text-muted-foreground border-border hover:border-destructive/50"
              )}
            >
              Emergency
            </button>
            <button
              onClick={() => setFilterLong(!filterLong)}
              className={cn(
                "px-2 py-0.5 text-xs rounded-full border transition-colors",
                filterLong
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border hover:border-primary/50"
              )}
            >
              Long (&gt;30s)
            </button>
          </div>
          <span className="text-xs text-muted-foreground ml-auto">
            {hasActiveFilter
              ? `${filteredCalls.length} of ${recentCalls.length}`
              : `${recentCalls.length} calls`
            }
          </span>
          <Link to="/calls" className="text-xs text-primary hover:underline">
            View all →
          </Link>
        </div>

        {loading ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : filteredCalls.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-muted-foreground">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-40">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
            <span>No calls match filters</span>
            <span className="text-xs">Try adjusting your filter selection</span>
          </div>
        ) : (
          <div
            className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            onMouseEnter={() => { isHoveringRef.current = true }}
            onMouseLeave={() => { isHoveringRef.current = false }}
          >
            {filteredCalls.map((call, i) => {
              const isCurrentlyPlaying = currentCall?.callId === call.call_id
              const hasAudio = !!call.audio_url

              const tgColor = call.tgid
                ? getCachedColor(call.system_id, call.tgid, {
                    alpha_tag: call.tg_alpha_tag,
                    description: call.tg_description,
                    group: call.tg_group,
                    tag: call.tg_tag,
                    tgid: call.tgid,
                    system_id: call.system_id,
                  })
                : null

              return (
                <HoverCard key={call.call_id} openDelay={300} closeDelay={100}>
                  <HoverCardTrigger asChild>
                    <Card
                      className={cn(
                        "card-call-hover card-fade-in cursor-pointer",
                        isCurrentlyPlaying ? "border-primary bg-primary/5 card-playing-glow" : ""
                      )}
                      style={{ '--i': i } as React.CSSProperties}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={() => handlePlayCall(call)}
                            disabled={!hasAudio}
                          >
                            {isCurrentlyPlaying && isPlaying ? (
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                <rect x="6" y="4" width="4" height="16" />
                                <rect x="14" y="4" width="4" height="16" />
                              </svg>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                <polygon points="5 3 19 12 5 21 5 3" />
                              </svg>
                            )}
                          </Button>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <Link
                                to={`/talkgroups/${call.system_id}:${call.tgid}`}
                                className={cn("truncate font-medium text-sm hover:underline", !tgColor && "text-sky-400")}
                                style={tgColor ? { color: tgColor } : undefined}
                              >
                                {getTalkgroupDisplayName(call.tgid, call.tg_alpha_tag)}
                              </Link>
                              {call.emergency && (
                                <Badge variant="destructive" className="text-[10px] px-1 py-0">!</Badge>
                              )}
                              {call.encrypted && (
                                <Badge variant="secondary" className="text-[10px] px-1 py-0">ENC</Badge>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {formatDuration(call.duration ?? 0)} • {formatRelativeTime(call.start_time)}
                              </span>
                            </div>
                            {call.transcription_text ? (
                              <Link to={`/calls/${call.call_id}`} className="block hover:opacity-80">
                                <p className="text-sm text-muted-foreground italic" style={{
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical' as const,
                                  overflow: 'hidden',
                                }}>
                                  {call.transcription_text}
                                </p>
                              </Link>
                            ) : (
                              <Link to={`/calls/${call.call_id}`} className="block hover:opacity-80">
                                <TranscriptionPreview callId={call.call_id} maxLines={2} />
                              </Link>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </HoverCardTrigger>
                  <HoverCardContent side="top" className="w-96 bg-card card-glass border-border shadow-xl">
                    <DashboardHoverContent call={call} tgColor={tgColor} getEntry={getEntry} />
                  </HoverCardContent>
                </HoverCard>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// Hover card content extracted to keep main component cleaner
function DashboardHoverContent({
  call,
  tgColor,
  getEntry,
}: {
  call: Call
  tgColor: string | null
  getEntry: (callId: number) => { status: string; transcription?: { text: string; words?: { words?: { word: string; start: number; end: number; src: number; src_tag?: string }[] } } } | undefined
}) {
  const entry = getEntry(call.call_id)

  return (
    <div className="space-y-3">
      {/* Talkgroup header */}
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={cn("font-medium", !tgColor && "text-sky-400")}
              style={tgColor ? { color: tgColor } : undefined}
            >
              {getTalkgroupDisplayName(call.tgid, call.tg_alpha_tag)}
            </span>
            {call.tg_tag && (
              <span className="text-xs text-muted-foreground">{call.tg_tag}</span>
            )}
          </div>
          <div className="flex gap-1">
            {call.emergency && <Badge variant="destructive">EMERGENCY</Badge>}
            {call.encrypted && <Badge variant="secondary">ENCRYPTED</Badge>}
          </div>
        </div>
        {(call.tg_description || call.tg_group) && (
          <div className="mt-1 text-xs text-muted-foreground">
            {call.tg_description && <p>{call.tg_description}</p>}
            {call.tg_group && <p>{call.tg_group}</p>}
          </div>
        )}
      </div>

      {/* Call details grid */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <p className="text-muted-foreground text-xs">Time</p>
          <p className="font-mono">{formatTime(call.start_time)}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Duration</p>
          <p className="font-mono">{formatDuration(call.duration ?? 0)}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Frequency</p>
          <p className="font-mono">{call.freq ? formatFrequency(call.freq) : '—'}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">System</p>
          <p>{call.system_name || `System ${call.system_id}`}</p>
        </div>
      </div>

      {/* Units */}
      {call.units && call.units.length > 0 && (
        <div>
          <p className="text-muted-foreground text-xs mb-1">Units ({call.units.length})</p>
          <div className="flex flex-wrap gap-1">
            {call.units.slice(0, 8).map((unit, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {unit.alpha_tag || `Unit ${unit.unit_id}`}
              </Badge>
            ))}
            {call.units.length > 8 && (
              <Badge variant="outline" className="text-xs">
                +{call.units.length - 8} more
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Transcription */}
      {(() => {
        // Show inline text first, fallback to cache
        const text = call.transcription_text || (entry?.status === 'loaded' ? entry.transcription?.text : null)
        if (!text) return null

        // If we have attributed words, show speaker-segmented format
        const words = entry?.transcription?.words?.words
        if (words && words.length > 0) {
          // Get unique unit src IDs
          const uniqueUnits: number[] = []
          const seen = new Set<number>()
          for (const w of words) {
            if (w.src && !seen.has(w.src)) {
              seen.add(w.src)
              uniqueUnits.push(w.src)
            }
          }

          // Group consecutive words by speaker
          const segments: { src: number | null; srcTag?: string; words: string[] }[] = []
          let current: { src: number | null; srcTag?: string; words: string[] } | null = null
          for (const w of words) {
            if (!current || current.src !== (w.src ?? null)) {
              current = { src: w.src ?? null, srcTag: w.src_tag, words: [] }
              segments.push(current)
            }
            current.words.push(w.word)
          }

          if (uniqueUnits.length > 1) {
            return (
              <div>
                <p className="text-muted-foreground text-xs mb-1">Transcription</p>
                <div className="text-sm max-h-40 overflow-y-auto space-y-1">
                  {segments.map((seg, i) => {
                    const unitColor = seg.src !== null ? getUnitColorByRid(seg.src, uniqueUnits) : null
                    const unitName = seg.srcTag || (seg.src !== null ? `Unit ${seg.src}` : 'Unknown')
                    return (
                      <p key={i}>
                        <span className={cn("font-medium", unitColor?.text)}>
                          {unitName}:
                        </span>{' '}
                        <span className="italic text-muted-foreground">
                          {seg.words.join(' ')}
                        </span>
                      </p>
                    )
                  })}
                </div>
              </div>
            )
          }
        }

        return (
          <div>
            <p className="text-muted-foreground text-xs mb-1">Transcription</p>
            <p className="text-sm italic max-h-32 overflow-y-auto">{text}</p>
          </div>
        )
      })()}

      {/* Links */}
      <div className="pt-2 border-t flex gap-2">
        <Link
          to={`/calls/${call.call_id}`}
          className="text-xs text-primary hover:underline"
        >
          View call details →
        </Link>
        <Link
          to={`/talkgroups/${call.system_id}:${call.tgid}`}
          className="text-xs text-primary hover:underline"
        >
          View talkgroup →
        </Link>
      </div>
    </div>
  )
}
