import { useEffect, useState, useMemo, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { useRealtimeStore } from '@/stores/useRealtimeStore'
import { useTalkgroupColors } from '@/stores/useTalkgroupColors'
import { getRecorders, getHealth, getSystems, getStats, getDecodeRates } from '@/api/client'
import type { Recorder, HealthResponse, System, StatsResponse, SystemActivity, DecodeRate } from '@/api/types'
import { formatDuration, formatFrequency, normalizeDecodeRate, cn } from '@/lib/utils'
import { REFRESH_INTERVALS } from '@/lib/constants'
import { Link } from 'react-router-dom'
import { Sparkline } from '@/components/ui/sparkline'

// Recorder state config
const RECORDER_STATES: Record<string, { label: string; badgeClass: string; cardClass: string; dotColor: string }> = {
  available: { label: 'AVAILABLE', badgeClass: 'bg-indigo-800 text-indigo-300', cardClass: 'border-indigo-800/30 bg-indigo-950/20 card-recessed', dotColor: 'bg-indigo-500' },
  recording: { label: 'RECORDING', badgeClass: 'bg-live text-white', cardClass: 'border-live/50 bg-red-950/40 card-recording-glow', dotColor: 'bg-live animate-pulse' },
  idle: { label: 'IDLE', badgeClass: 'bg-amber-700 text-amber-200', cardClass: 'border-amber-700/40 bg-amber-950/20 card-recessed', dotColor: 'bg-amber-500' },
  stopped: { label: 'STOPPED', badgeClass: 'bg-red-900 text-red-300', cardClass: 'border-red-900/40 bg-red-950/20 card-recessed', dotColor: 'bg-red-400' },
}
const ANALOG_IDLE = { label: 'IDLE', badgeClass: 'bg-indigo-800 text-indigo-300', cardClass: 'border-indigo-800/30 bg-indigo-950/20 card-recessed', dotColor: 'bg-indigo-500' }
const DEFAULT_STATE = { label: 'UNKNOWN', badgeClass: 'bg-zinc-700 text-zinc-400', cardClass: 'border-zinc-700/30 bg-zinc-900/20 card-recessed', dotColor: 'bg-zinc-500' }

function isAnalogType(type?: string): boolean {
  if (!type) return false
  const t = type.toLowerCase()
  return t.includes('conventional') || t.includes('analog')
}

function getRecorderStateInfo(rec: Recorder) {
  const state = (rec.rec_state ?? 'available').toLowerCase()
  if (state === 'idle' && isAnalogType(rec.type)) return ANALOG_IDLE
  return RECORDER_STATES[state] || DEFAULT_STATE
}

// Decode rate color thresholds
function decodeRateColor(rate: number): string {
  if (rate === 0) return '#71717a' // zinc-500
  if (rate >= 0.9) return '#22c55e' // green-500
  if (rate >= 0.7) return '#eab308' // yellow-500
  return '#ef4444' // red-500
}

function decodeRateBgClass(rate: number): string {
  if (rate === 0) return 'bg-zinc-700'
  if (rate >= 0.9) return 'bg-green-500'
  if (rate >= 0.7) return 'bg-yellow-500'
  return 'bg-red-500'
}

function decodeRateTextClass(rate: number): string {
  if (rate === 0) return 'text-zinc-500'
  if (rate >= 0.9) return 'text-green-400'
  if (rate >= 0.7) return 'text-yellow-400'
  return 'text-red-400'
}

// Bucket historical decode rates into hourly averages
function bucketDecodeRatesByHour(
  rates: DecodeRate[],
  systemId: number,
  hours = 24
): number[] {
  const now = Date.now()
  const buckets: number[][] = Array.from({ length: hours }, () => [])

  for (const rate of rates) {
    if (rate.system_id !== systemId || !rate.time) continue
    const t = new Date(rate.time).getTime()
    const hoursAgo = (now - t) / (1000 * 60 * 60)
    const bucketIdx = Math.floor(hoursAgo)
    if (bucketIdx >= 0 && bucketIdx < hours) {
      buckets[bucketIdx].push(normalizeDecodeRate(rate.decode_rate))
    }
  }

  // Reverse so oldest is first (left of sparkline)
  return buckets
    .map((b) => (b.length > 0 ? b.reduce((a, v) => a + v, 0) / b.length : 0))
    .reverse()
}

// Elapsed time display
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

// Track recording start/end times
const recordingStartMap = new Map<string, number>()
const lastCallDurationMap = new Map<string, number>()

/** Site info derived from system data */
interface SiteInfo {
  shortName: string
  systemId: number
  instanceId?: string
}

/** Instance info for header/health display */
interface InstanceInfo {
  instanceId: string
  status?: string
  lastSeen?: string
  totalRecorders: number
  recordingCount: number
}

export default function Recorders() {
  const realtimeRecorders = useRealtimeStore((s) => s.recorders)
  const liveDecodeRates = useRealtimeStore((s) => s.decodeRates)
  const [apiRecorders, setApiRecorders] = useState<Recorder[]>([])
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [systems, setSystems] = useState<System[]>([])
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [historicalRates, setHistoricalRates] = useState<DecodeRate[]>([])
  const [loading, setLoading] = useState(true)
  const getCachedColor = useTalkgroupColors((s) => s.getCachedColor)

  // Fetch all data on mount
  useEffect(() => {
    const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    Promise.all([
      getRecorders(),
      getHealth(),
      getSystems(),
      getStats(),
      getDecodeRates({ start_time: startTime }),
    ])
      .then(([recRes, healthRes, sysRes, statsRes, ratesRes]) => {
        setApiRecorders(recRes.recorders || [])
        setHealth(healthRes)
        setSystems(sysRes.systems || [])
        setStats(statsRes)
        setHistoricalRates(ratesRes.rates || [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // Refresh recorders + health + stats every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      Promise.all([getRecorders(), getHealth(), getStats()])
        .then(([recRes, healthRes, statsRes]) => {
          setApiRecorders(recRes.recorders || [])
          setHealth(healthRes)
          setStats(statsRes)
        })
        .catch(console.error)
    }, REFRESH_INTERVALS.STATS)
    return () => clearInterval(interval)
  }, [])

  // Refresh historical decode rates every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      getDecodeRates({ start_time: startTime })
        .then((res) => setHistoricalRates(res.rates || []))
        .catch(console.error)
    }, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  // Map system_id → SystemActivity
  const systemActivityMap = useMemo(() => {
    const map = new Map<number, SystemActivity>()
    if (stats?.system_activity) {
      for (const sa of stats.system_activity) {
        map.set(sa.system_id, sa)
      }
    }
    return map
  }, [stats])

  // Get live decode rate for a site (by short_name)
  const getLiveRate = useCallback(
    (shortName: string): number | null => {
      const rate = liveDecodeRates.get(shortName)
      if (!rate) return null
      return normalizeDecodeRate(rate.decode_rate)
    },
    [liveDecodeRates]
  )

  // Get historical sparkline data for a system
  const getSparklineData = useCallback(
    (systemId: number): number[] => {
      return bucketDecodeRatesByHour(historicalRates, systemId)
    },
    [historicalRates]
  )

  // Merge API + realtime
  const mergedRecorders = useMemo(() => {
    const recKey = (r: Recorder) => r.instance_id ? `${r.instance_id}:${r.id}` : r.id
    const realtimeMap = new Map<string, Recorder>()
    for (const r of realtimeRecorders) {
      realtimeMap.set(recKey(r), r)
    }

    // Deduplicate API recorders by instance-scoped key
    const seen = new Set<string>()
    const dedupedApi = apiRecorders.filter((r) => {
      const key = recKey(r)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    return dedupedApi
      .map((apiRec) => {
        const realtime = realtimeMap.get(recKey(apiRec))
        const merged: Recorder = { ...apiRec, ...realtime, id: apiRec.id }

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

  // Build instance connection status map from health
  const instanceStatus = useMemo(() => {
    const map = new Map<string, { status: string; lastSeen?: string }>()
    if (health?.trunk_recorders) {
      for (const tr of health.trunk_recorders) {
        map.set(tr.instance_id, { status: tr.status, lastSeen: tr.last_seen })
      }
    }
    return map
  }, [health])

  // Map system_id → display name + all sites for that system_id
  const systemIdInfo = useMemo(() => {
    const map = new Map<number, { name: string; sites: SiteInfo[] }>()
    for (const sys of systems) {
      if (!sys.sites) continue
      for (const site of sys.sites) {
        if (!map.has(site.system_id)) {
          map.set(site.system_id, { name: '', sites: [] })
        }
        map.get(site.system_id)!.sites.push({
          shortName: site.short_name,
          systemId: site.system_id,
          instanceId: site.instance_id,
        })
      }
      // Use parent system name when multiple sites share a system_id, otherwise use site short_name
      for (const site of sys.sites) {
        const info = map.get(site.system_id)!
        if (!info.name) {
          info.name = info.sites.length > 1
            ? (sys.name || site.short_name || `System ${site.system_id}`)
            : (site.short_name || sys.name || `System ${site.system_id}`)
        }
      }
    }
    return map
  }, [systems])

  // Group recorders by system_id (site)
  const systemGroups = useMemo(() => {
    const sysMap = new Map<number, Recorder[]>()
    for (const rec of mergedRecorders) {
      if (rec.system_id == null) continue // skip unassigned recorders
      if (!sysMap.has(rec.system_id)) sysMap.set(rec.system_id, [])
      sysMap.get(rec.system_id)!.push(rec)
    }
    return Array.from(sysMap.entries())
      .sort(([a], [b]) => {
        const nameA = systemIdInfo.get(a)?.name ?? ''
        const nameB = systemIdInfo.get(b)?.name ?? ''
        return nameA.localeCompare(nameB)
      })
      .map(([sysId, recorders]) => {
        const info = systemIdInfo.get(sysId)
        return {
          systemId: sysId,
          name: info?.name || `System ${sysId}`,
          sites: info?.sites || [],
          recorders,
          type: recorders[0]?.type ?? 'Unknown',
        }
      })
  }, [mergedRecorders, systemIdInfo])

  // Instance groups kept for header/health display
  const instanceGroups = useMemo<InstanceInfo[]>(() => {
    const instances = new Set<string>()
    for (const rec of mergedRecorders) {
      instances.add(rec.instance_id ?? 'unknown')
    }
    return Array.from(instances)
      .sort()
      .map((instanceId) => {
        const info = instanceStatus.get(instanceId)
        const recs = mergedRecorders.filter((r) => (r.instance_id ?? 'unknown') === instanceId)
        return {
          instanceId,
          status: info?.status,
          lastSeen: info?.lastSeen,
          totalRecorders: recs.length,
          recordingCount: recs.filter((r) => (r.rec_state ?? '').toLowerCase() === 'recording').length,
        }
      })
  }, [mergedRecorders, instanceStatus])

  // Global stats
  const recordingCount = mergedRecorders.filter((r) => (r.rec_state ?? '').toLowerCase() === 'recording').length
  const idleCount = mergedRecorders.filter((r) => (r.rec_state ?? '').toLowerCase() === 'idle').length
  const availableCount = mergedRecorders.filter((r) => (r.rec_state ?? '').toLowerCase() === 'available').length
  const usedCount = mergedRecorders.length
  const totalCount = apiRecorders.length

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Systems</h1>
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          Loading recorders...
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header + summary */}
      <div className="flex flex-wrap items-center gap-4 lg:gap-6 rounded-lg border stat-bar-glass px-4 py-3">
        <h1 className="text-xl font-bold">Systems</h1>
        <div className="h-6 w-px bg-border hidden sm:block" />
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Recording</span>
          <span className="text-xl font-bold tabular-nums text-live">{recordingCount}</span>
          {recordingCount > 0 && (
            <span className="h-2 w-2 rounded-full bg-live animate-pulse" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Idle</span>
          <span className="text-xl font-bold tabular-nums text-amber-400">{idleCount}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Available</span>
          <span className="text-xl font-bold tabular-nums text-indigo-400">{availableCount}</span>
        </div>
        <div className="h-6 w-px bg-border hidden sm:block" />
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Used</span>
          <span className="font-bold tabular-nums">{usedCount}</span>
          <span className="text-sm text-muted-foreground">/ {totalCount} total</span>
        </div>
        <div className="h-6 w-px bg-border hidden sm:block" />
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Systems</span>
          <span className="font-bold tabular-nums">{systemGroups.length}</span>
        </div>
      </div>

      {mergedRecorders.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-40">
            <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
            <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.4" />
            <circle cx="12" cy="12" r="2" />
            <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.4" />
            <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19" />
          </svg>
          <span>No active recorders</span>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Instance connection status bar */}
          <div className="flex flex-wrap items-center gap-4 px-3 py-1.5 rounded-lg border border-border/40 bg-zinc-900/30">
            {instanceGroups.map((group) => (
              <div key={group.instanceId} className="flex items-center gap-2 text-sm">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full shrink-0",
                    group.status === 'connected' ? 'bg-success' : 'bg-destructive'
                  )}
                />
                <span className="font-medium capitalize">{group.instanceId}</span>
                <span className="text-xs text-muted-foreground">
                  {group.recordingCount}/{group.totalRecorders}
                </span>
              </div>
            ))}
          </div>

          {/* System cards in masonry layout */}
          <div
            className="gap-3"
            style={{ columns: '340px', columnGap: '0.75rem' }}
          >
            {systemGroups.map(({ systemId, name, sites, recorders, type }) => {
              const recCount = recorders.filter((r) => (r.rec_state ?? '').toLowerCase() === 'recording').length

              return (
                <div
                  key={String(systemId)}
                  className="rounded-lg border border-border/40 bg-zinc-900/20 mb-3 overflow-hidden"
                  style={{ breakInside: 'avoid' }}
                >
                  {/* System header */}
                  <div className="flex flex-wrap items-center gap-2 px-2.5 py-1.5 bg-zinc-900/40 border-b border-border/30">
                    <h3 className="font-bold text-sm">{name}</h3>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-muted-foreground">
                      {type}
                    </Badge>
                    <div className="flex items-center gap-0.5">
                      {recorders.map((rec) => {
                        const stateInfo = getRecorderStateInfo(rec)
                        return (
                          <span
                            key={rec.instance_id ? `${rec.instance_id}:${rec.id}` : rec.id}
                            className={cn("h-1.5 w-1.5 rounded-full shrink-0", stateInfo.dotColor)}
                            title={`REC ${rec.rec_num ?? 0}: ${stateInfo.label}`}
                          />
                        )
                      })}
                    </div>
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {recCount > 0 && <span className="text-live font-medium">{recCount} rec</span>}
                      {recCount > 0 && ' / '}{recorders.length}
                    </span>
                  </div>

                  {/* Per-site decode rates (if any) */}
                  {sites.some((s) => getLiveRate(s.shortName) !== null) && (
                    <div className="px-2.5 py-1 border-b border-border/20 flex flex-wrap gap-x-3 gap-y-0.5">
                      {sites.map((site) => {
                        const rate = getLiveRate(site.shortName)
                        const sparkData = getSparklineData(site.systemId)
                        const activity = systemActivityMap.get(site.systemId)
                        if (rate === null && !activity) return null
                        return (
                          <div key={site.shortName} className="flex items-center gap-1.5 text-[10px]">
                            {sites.length > 1 && (
                              <span className="font-mono text-muted-foreground">{site.shortName}</span>
                            )}
                            {rate !== null && (
                              <>
                                <div className="h-1.5 w-12 rounded-full bg-zinc-800 overflow-hidden">
                                  <div
                                    className={cn("h-full rounded-full", decodeRateBgClass(rate))}
                                    style={{ width: `${Math.round(rate * 100)}%` }}
                                  />
                                </div>
                                <span className={cn("font-mono tabular-nums", decodeRateTextClass(rate))}>
                                  {Math.round(rate * 100)}%
                                </span>
                              </>
                            )}
                            {sparkData.length > 0 && (
                              <div className="w-12 shrink-0" title={`24h ${site.shortName}`}>
                                <Sparkline data={sparkData} height={12} colorFn={(value) => decodeRateColor(value)} />
                              </div>
                            )}
                            {activity && (
                              <span className="text-muted-foreground tabular-nums">
                                <span className="text-foreground font-medium">{activity.calls_1h ?? 0}</span>/1h
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Recorder grid */}
                  <div
                    className="grid gap-1 p-1.5"
                    style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))' }}
                  >
                    {recorders.map((rec) => (
                      <RecorderCard
                        key={rec.instance_id ? `${rec.instance_id}:${rec.id}` : rec.id}
                        rec={rec}
                        getCachedColor={getCachedColor}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/** Individual recorder card */
function RecorderCard({
  rec,
  getCachedColor,
}: {
  rec: Recorder
  getCachedColor: (systemId: number, tgid: number, fields: Record<string, unknown>) => string | null
}) {
  const stateInfo = getRecorderStateInfo(rec)
  const recStartTime = recordingStartMap.get(rec.id)
  const lastDuration = lastCallDurationMap.get(rec.id)
  const isRecording = (rec.rec_state ?? '').toLowerCase() === 'recording'

  const tgColor = rec.tgid
    ? getCachedColor(rec.system_id ?? 0, rec.tgid, {
        alpha_tag: rec.tg_alpha_tag ?? undefined,
        tgid: rec.tgid,
      })
    : null

  return (
    <div
      className={cn(
        "rounded-lg border p-2 transition-all flex flex-col",
        stateInfo.cardClass
      )}
    >
      {/* Header: recorder info + state badge */}
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
          SRC {rec.src_num ?? 0} / REC {rec.rec_num ?? 0}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {isAnalogType(rec.type) && rec.squelched && (
            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 text-amber-400 border-amber-600/40">
              SQ
            </Badge>
          )}
          <Badge className={cn("text-[10px] px-1 py-0 h-4 font-bold", stateInfo.badgeClass)}>
            {isRecording ? 'REC' : stateInfo.label}
          </Badge>
        </div>
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
      <div className="space-y-0.5 mt-0.5 flex-1">
        <div className="flex items-center gap-1.5">
          {rec.tgid ? (
            <Link
              to={`/talkgroups/${rec.system_id ?? 0}:${rec.tgid}`}
              className={cn("truncate text-sm hover:underline", !tgColor && "text-sky-400")}
              style={tgColor ? { color: tgColor } : undefined}
              title={rec.tg_alpha_tag || `TG ${rec.tgid}`}
            >
              {rec.tg_alpha_tag || `TG ${rec.tgid}`}
            </Link>
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
          {rec.unit_id ? (
            <Link to={`/units/${rec.system_id ?? 0}:${rec.unit_id}`} className="hover:underline">
              {rec.unit_alpha_tag || `Unit ${rec.unit_id}`}
            </Link>
          ) : (
            <span className="text-muted-foreground/50">—</span>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center mt-1 text-[10px] font-mono text-muted-foreground/70">
        {rec.count ?? 0} calls
        {(rec.duration ?? 0) > 0 && ` · ${((rec.duration ?? 0) / 60).toFixed(1)}m`}
      </div>
    </div>
  )
}
