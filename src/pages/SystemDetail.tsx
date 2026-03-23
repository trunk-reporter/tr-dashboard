import { useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getSystem, getTalkgroups, getCalls, getRecorders, getStats, getDecodeRates } from '@/api/client'
import type { System, Talkgroup, Call, Recorder, SystemActivity, DecodeRate } from '@/api/types'
import { useRealtimeStore } from '@/stores/useRealtimeStore'
import { useAudioStore } from '@/stores/useAudioStore'
import { useTalkgroupColors } from '@/stores/useTalkgroupColors'
import { formatDateTime, formatDuration, formatFrequency, normalizeDecodeRate, getSystemTypeLabel, cn } from '@/lib/utils'
import { REFRESH_INTERVALS } from '@/lib/constants'
import { Sparkline } from '@/components/ui/sparkline'
import { CopyableId } from '@/components/ui/copyable-id'

function decodeRateColor(rate: number): string {
  if (rate === 0) return '#71717a'
  if (rate >= 0.9) return '#22c55e'
  if (rate >= 0.7) return '#eab308'
  return '#ef4444'
}

export default function SystemDetail() {
  const { id } = useParams<{ id: string }>()
  const systemId = Number(id)

  const [system, setSystem] = useState<System | null>(null)
  const [talkgroups, setTalkgroups] = useState<Talkgroup[]>([])
  const [calls, setCalls] = useState<Call[]>([])
  const [recorders, setRecorders] = useState<Recorder[]>([])
  const [activity, setActivity] = useState<SystemActivity | null>(null)
  const [decodeRateHistory, setDecodeRateHistory] = useState<DecodeRate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const liveRecorders = useRealtimeStore((s) => s.recorders)
  const liveDecodeRates = useRealtimeStore((s) => s.decodeRates)
  const loadCall = useAudioStore((s) => s.loadCall)
  const getCachedColor = useTalkgroupColors((s) => s.getCachedColor)

  // Fetch all data
  useEffect(() => {
    if (isNaN(systemId)) return

    setLoading(true)
    setError(null)

    Promise.all([
      getSystem(systemId),
      getTalkgroups({ system_id: String(systemId), limit: 1000 }),
      getCalls({ system_id: String(systemId), limit: 25, sort: '-start_time' }),
      getRecorders(),
      getStats(),
      getDecodeRates(),
    ]).then(([sys, tgRes, callRes, recRes, statsRes, drRes]) => {
      setSystem(sys)
      setTalkgroups(tgRes.talkgroups)
      setCalls(callRes.calls)
      setRecorders(recRes.recorders.filter(r => r.system_id === systemId))
      setActivity(statsRes.system_activity?.find(a => a.system_id === systemId) ?? null)
      setDecodeRateHistory((drRes.rates ?? []).filter(r => r.system_id === systemId))
      setLoading(false)
    }).catch(err => {
      setError(err.message || 'Failed to load system')
      setLoading(false)
    })
  }, [systemId])

  // Refresh calls periodically
  useEffect(() => {
    if (isNaN(systemId)) return
    const interval = setInterval(() => {
      getCalls({ system_id: String(systemId), limit: 25, sort: '-start_time' })
        .then(res => setCalls(res.calls))
        .catch(() => {})
    }, REFRESH_INTERVALS.RECENT_CALLS)
    return () => clearInterval(interval)
  }, [systemId])

  // Merge live recorder updates
  const mergedRecorders = useMemo(() => {
    const liveMap = new Map(liveRecorders.filter(r => r.system_id === systemId).map(r => [r.id, r]))
    const merged = recorders.map(r => liveMap.get(r.id) ?? r)
    // Add any live-only recorders
    for (const lr of liveMap.values()) {
      if (!recorders.find(r => r.id === lr.id)) merged.push(lr)
    }
    return merged
  }, [recorders, liveRecorders, systemId])

  // Live decode rate for this system's sites
  const liveRate = useMemo(() => {
    if (!system?.sites?.length) return null
    const siteNames = system.sites.map(s => s.short_name)
    const rates = Array.from(liveDecodeRates.values()).filter(r => siteNames.includes(r.sys_name ?? ''))
    if (rates.length === 0) return null
    const avg = rates.reduce((sum, r) => sum + normalizeDecodeRate(r.decode_rate), 0) / rates.length
    return avg
  }, [system, liveDecodeRates])

  // Top talkgroups by 24h calls
  const topTalkgroups = useMemo(() => {
    return [...talkgroups]
      .sort((a, b) => (b.calls_24h ?? 0) - (a.calls_24h ?? 0))
      .slice(0, 10)
  }, [talkgroups])

  // Recorder stats
  const recorderStats = useMemo(() => {
    const recording = mergedRecorders.filter(r => r.rec_state === 'recording').length
    const total = mergedRecorders.length
    return { recording, total }
  }, [mergedRecorders])

  // Decode rate sparkline data
  const sparklineData = useMemo(() => {
    return decodeRateHistory
      .map(d => normalizeDecodeRate(d.decode_rate))
      .reverse()
  }, [decodeRateHistory])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading system...</div>
      </div>
    )
  }

  if (error || !system) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-destructive">{error || 'System not found'}</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{system.name || `System ${system.system_id}`}</h1>
            <Badge variant="outline" className="text-xs">
              {getSystemTypeLabel(system.system_type)}
            </Badge>
          </div>
          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
            <CopyableId label="ID" value={String(system.system_id)} />
            {system.sysid && system.sysid !== '0' && <CopyableId label="SYSID" value={system.sysid} />}
            {system.wacn && system.wacn !== '0' && <CopyableId label="WACN" value={system.wacn} />}
          </div>
        </div>
        <Link to="/systems" className="text-sm text-muted-foreground hover:text-foreground">
          ← All Systems
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold">{talkgroups.length}</div>
            <div className="text-xs text-muted-foreground">Talkgroups</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold">{activity?.active_units ?? '—'}</div>
            <div className="text-xs text-muted-foreground">Active Units</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold">{activity?.calls_1h ?? '—'}</div>
            <div className="text-xs text-muted-foreground">Calls (1h)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold">{activity?.calls_24h ?? '—'}</div>
            <div className="text-xs text-muted-foreground">Calls (24h)</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Sites + Recorders */}
        <div className="space-y-6">
          {/* Decode Rate */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Decode Rate</CardTitle>
            </CardHeader>
            <CardContent>
              {liveRate !== null ? (
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold font-mono" style={{ color: decodeRateColor(liveRate) }}>
                    {(liveRate * 100).toFixed(0)}%
                  </span>
                  {sparklineData.length > 1 && (
                    <Sparkline data={sparklineData} width={120} height={32} color={decodeRateColor(liveRate)} />
                  )}
                </div>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </CardContent>
          </Card>

          {/* Sites */}
          {system.sites && system.sites.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Sites ({system.sites.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {system.sites.map(site => (
                  <div key={site.site_id} className="flex items-center justify-between text-sm border border-border/30 rounded px-3 py-2">
                    <div>
                      <div className="font-medium">{site.short_name}</div>
                      <div className="text-xs text-muted-foreground space-x-2">
                        {site.nac && <span>NAC {site.nac}</span>}
                        {site.rfss !== undefined && <span>RFSS {site.rfss}</span>}
                        {site.p25_site_id !== undefined && <span>Site {site.p25_site_id}</span>}
                      </div>
                    </div>
                    {(() => {
                      const siteRate = Array.from(liveDecodeRates.values()).find(r => r.sys_name === site.short_name)
                      const rate = siteRate ? normalizeDecodeRate(siteRate.decode_rate) : null
                      return rate !== null ? (
                        <span className="font-mono text-sm" style={{ color: decodeRateColor(rate) }}>
                          {(rate * 100).toFixed(0)}%
                        </span>
                      ) : null
                    })()}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Recorders */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                Recorders ({recorderStats.recording}/{recorderStats.total} active)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {mergedRecorders.length === 0 ? (
                <div className="text-sm text-muted-foreground">No recorders</div>
              ) : (
                mergedRecorders.map(rec => {
                  const isRecording = rec.rec_state === 'recording'
                  return (
                    <div key={rec.id} className={cn(
                      "flex items-center justify-between text-sm border rounded px-3 py-1.5",
                      isRecording ? "border-live/30 bg-red-950/20" : "border-border/30"
                    )}>
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={cn("w-2 h-2 rounded-full shrink-0", isRecording ? "bg-live animate-pulse" : "bg-zinc-600")} />
                        <span className="font-mono text-xs text-muted-foreground">#{rec.rec_num ?? rec.id}</span>
                        {rec.freq && rec.freq > 0 && (
                          <span className="font-mono text-xs">{formatFrequency(rec.freq)}</span>
                        )}
                      </div>
                      <div className="truncate text-right">
                        {rec.tgid ? (
                          <Link
                            to={`/talkgroups/${rec.system_id ?? 0}:${rec.tgid}`}
                            className="text-xs text-sky-400 hover:underline"
                          >
                            {rec.tg_alpha_tag || `TG ${rec.tgid}`}
                          </Link>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            {(rec.rec_state ?? 'unknown').toUpperCase()}
                          </Badge>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        </div>

        {/* Middle Column: Top Talkgroups */}
        <div>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Top Talkgroups (24h)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {topTalkgroups.length === 0 ? (
                <div className="text-sm text-muted-foreground">No talkgroup activity</div>
              ) : (
                topTalkgroups.map(tg => {
                  const tgColor = getCachedColor(tg.system_id, tg.tgid, {
                    alpha_tag: tg.alpha_tag, tag: tg.tag, group: tg.group,
                    system_id: tg.system_id, tgid: tg.tgid,
                  })
                  const maxCalls = topTalkgroups[0]?.calls_24h ?? 1
                  const pct = ((tg.calls_24h ?? 0) / maxCalls) * 100
                  return (
                    <Link
                      key={`${tg.system_id}:${tg.tgid}`}
                      to={`/talkgroups/${tg.system_id}:${tg.tgid}`}
                      className="flex items-center gap-2 text-sm hover:bg-muted/30 rounded px-2 py-1.5 group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn("truncate font-medium", !tgColor && "text-sky-400")}
                            style={tgColor ? { color: tgColor } : undefined}
                          >
                            {tg.alpha_tag || `TG ${tg.tgid}`}
                          </span>
                          {tg.tag && (
                            <Badge variant="outline" className="text-[10px] shrink-0">{tg.tag}</Badge>
                          )}
                        </div>
                        <div className="w-full bg-muted/30 rounded-full h-1 mt-1">
                          <div
                            className="h-1 rounded-full bg-primary/60"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-xs font-mono text-muted-foreground shrink-0">
                        {tg.calls_24h ?? 0}
                      </span>
                    </Link>
                  )
                })
              )}
              {talkgroups.length > 10 && (
                <Link to={`/talkgroups?system_id=${systemId}`} className="block text-xs text-primary hover:underline mt-2 px-2">
                  View all {talkgroups.length} talkgroups →
                </Link>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Recent Calls */}
        <div>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Recent Calls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {calls.length === 0 ? (
                <div className="text-sm text-muted-foreground">No recent calls</div>
              ) : (
                calls.map(call => {
                  const tgColor = getCachedColor(call.system_id, call.tgid, {
                    alpha_tag: call.tg_alpha_tag, tag: call.tg_tag, group: call.tg_group,
                    system_id: call.system_id, tgid: call.tgid,
                  })
                  return (
                    <div
                      key={call.call_id}
                      className="flex items-center gap-2 text-sm border-b border-border/20 pb-1.5 last:border-0"
                    >
                      <button
                        onClick={() => loadCall(call)}
                        className="text-muted-foreground hover:text-primary shrink-0"
                        title="Play"
                      >
                        ▶
                      </button>
                      <Link
                        to={`/talkgroups/${call.system_id}:${call.tgid}`}
                        className={cn("truncate hover:underline", !tgColor && "text-sky-400")}
                        style={tgColor ? { color: tgColor } : undefined}
                      >
                        {call.tg_alpha_tag || `TG ${call.tgid}`}
                      </Link>
                      <span className="text-xs font-mono text-muted-foreground shrink-0 ml-auto">
                        {call.duration ? formatDuration(call.duration) : '—'}
                      </span>
                      <Link
                        to={`/calls/${call.call_id}`}
                        className="text-xs text-muted-foreground hover:text-primary shrink-0"
                        title={call.start_time ? formatDateTime(call.start_time) : ''}
                      >
                        {call.start_time ? new Date(call.start_time).toLocaleTimeString() : '—'}
                      </Link>
                      {call.emergency && <Badge variant="destructive" className="text-[9px] px-1">E</Badge>}
                      {call.encrypted && <Badge variant="outline" className="text-[9px] px-1">ENC</Badge>}
                    </div>
                  )
                })
              )}
              {calls.length >= 25 && (
                <Link to={`/calls?system_id=${systemId}`} className="block text-xs text-primary hover:underline mt-2">
                  View all calls →
                </Link>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
