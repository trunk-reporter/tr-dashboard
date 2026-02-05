import { useEffect, useState, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useRealtimeStore } from '@/stores/useRealtimeStore'
import { useAudioStore, selectIsPlaying } from '@/stores/useAudioStore'
import { useTranscriptionCache } from '@/stores/useTranscriptionCache'
import { TranscriptionPreview } from '@/components/calls/TranscriptionPreview'
import { getStats, getRecentCalls, getRecorders } from '@/api/client'
import { useTalkgroupColors } from '@/stores/useTalkgroupColors'
import { useTalkgroupCache, talkgroupKey } from '@/stores/useTalkgroupCache'
import type { StatsResponse, RecentCallInfo, RecorderInfo } from '@/api/types'
import {
  formatBytes,
  formatDecodeRate,
  formatDuration,
  formatFrequency,
  formatRelativeTime,
  getTalkgroupDisplayName,
  cn,
} from '@/lib/utils'
import { REFRESH_INTERVALS } from '@/lib/constants'

// Recorder state config
const RECORDER_STATES: Record<number, { label: string; badgeClass: string; cardClass: string }> = {
  0: { label: 'MONITOR', badgeClass: 'bg-green-600 text-white', cardClass: 'border-green-600/50 bg-green-950/30' },
  1: { label: 'RECORDING', badgeClass: 'bg-live text-white', cardClass: 'border-live/50 bg-red-950/40 shadow-sm shadow-live/30' },
  2: { label: 'INACTIVE', badgeClass: 'bg-zinc-700 text-zinc-400', cardClass: 'border-zinc-700/30 bg-zinc-900/20' },
  3: { label: 'ACTIVE', badgeClass: 'bg-amber-500 text-white', cardClass: 'border-amber-500/50 bg-amber-950/30' },
  4: { label: 'IDLE', badgeClass: 'bg-amber-700 text-amber-200', cardClass: 'border-amber-700/40 bg-amber-950/20' },
  6: { label: 'STOPPED', badgeClass: 'bg-red-900 text-red-300', cardClass: 'border-red-900/40 bg-red-950/20' },
  7: { label: 'AVAILABLE', badgeClass: 'bg-indigo-800 text-indigo-300', cardClass: 'border-indigo-800/30 bg-indigo-950/20' },
  8: { label: 'IGNORE', badgeClass: 'bg-zinc-800 text-zinc-500', cardClass: 'border-zinc-800/20 bg-zinc-900/10' },
}

// Merged recorder type (API data + realtime updates)
interface MergedRecorder {
  recNum: number
  srcNum: number
  recType: string
  state: number
  stateName: string
  freq: number
  tgid?: number
  tgAlphaTag?: string
  tgColor?: string  // hex color from color rules
  unitId?: number
  unitAlphaTag?: string
  count: number
  duration: number
  recordingStartTime?: number  // timestamp when recording started
  lastCallDuration?: number    // duration of last call in seconds
}

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

// Store for preserving last known TG/unit context when recorder goes idle
const lastContextMap = new Map<number, { tgid?: number; tgAlphaTag?: string; unitId?: number; unitAlphaTag?: string }>()

// Store for tracking when recorders started recording (for elapsed time)
const recordingStartMap = new Map<number, number>()
// Store for last call duration when recording ends
const lastCallDurationMap = new Map<number, number>()

export default function Dashboard() {
  const realtimeRecorders = useRealtimeStore((s) => s.recorders)
  const decodeRates = useRealtimeStore((s) => s.decodeRates)
  const connectionStatus = useRealtimeStore((s) => s.connectionStatus)

  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [recentCalls, setRecentCalls] = useState<RecentCallInfo[]>([])
  const [apiRecorders, setApiRecorders] = useState<RecorderInfo[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTranscription = useTranscriptionCache((s) => s.fetchTranscription)
  const loadCall = useAudioStore((s) => s.loadCall)
  const currentCall = useAudioStore((s) => s.currentCall)
  const isPlaying = useAudioStore(selectIsPlaying)
  const getCachedColor = useTalkgroupColors((s) => s.getCachedColor)
  const talkgroupCache = useTalkgroupCache((s) => s.cache)

  const fetchTranscriptionsForCalls = useCallback((calls: RecentCallInfo[]) => {
    for (const call of calls) {
      const callId = call.call_id ?? (call.id != null ? String(call.id) : '')
      if (callId) {
        fetchTranscription(callId)
      }
    }
  }, [fetchTranscription])

  // Fetch initial data
  useEffect(() => {
    Promise.all([getStats(), getRecentCalls(24), getRecorders()])
      .then(([statsRes, recentRes, recordersRes]) => {
        setStats(statsRes)
        setRecentCalls(recentRes.calls)
        setApiRecorders(recordersRes.recorders || [])
        fetchTranscriptionsForCalls(recentRes.calls)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [fetchTranscriptionsForCalls])

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
      getRecentCalls(24).then((res) => {
        setRecentCalls(res.calls)
        fetchTranscriptionsForCalls(res.calls)
      }).catch(console.error)
    }, REFRESH_INTERVALS.RECENT_CALLS)
    return () => clearInterval(interval)
  }, [fetchTranscriptionsForCalls])

  // Refresh recorders periodically (to get updated counts)
  useEffect(() => {
    const interval = setInterval(() => {
      getRecorders().then((res) => {
        setApiRecorders(res.recorders || [])
      }).catch(console.error)
    }, REFRESH_INTERVALS.STATS)
    return () => clearInterval(interval)
  }, [])

  // Merge API recorders with realtime updates
  const mergedRecorders = useMemo((): MergedRecorder[] => {
    // Filter to recorders with activity (count > 0)
    const activeRecorders = apiRecorders.filter((r) => (r.count ?? 0) > 0)

    return activeRecorders
      .map((apiRec): MergedRecorder => {
        const recNum = apiRec.rec_num ?? 0

        // Check for realtime update (keyed by system:recNum, but we may not know system)
        const realtimeKey = Array.from(realtimeRecorders.keys()).find(
          (k) => k.endsWith(`:${recNum}`)
        )
        const realtime = realtimeKey ? realtimeRecorders.get(realtimeKey) : undefined

        // Get current TG/unit from realtime or API
        const currentTgid = realtime?.talkgroup ?? apiRec.tgid
        const currentTgAlphaTag = realtime?.tgAlphaTag ?? apiRec.tg_alpha_tag
        const currentUnitId = apiRec.unit_id
        const currentUnitAlphaTag = apiRec.unit_alpha_tag

        // Preserve context: if we have TG/unit data, save it; otherwise use last known
        if (currentTgid || currentTgAlphaTag || currentUnitId || currentUnitAlphaTag) {
          lastContextMap.set(recNum, {
            tgid: currentTgid,
            tgAlphaTag: currentTgAlphaTag,
            unitId: currentUnitId,
            unitAlphaTag: currentUnitAlphaTag,
          })
        }
        const lastContext = lastContextMap.get(recNum)

        const currentState = realtime?.state ?? apiRec.state ?? 7
        const isRecording = currentState === 1

        // Track recording start time and save duration when recording ends
        if (isRecording && !recordingStartMap.has(recNum)) {
          recordingStartMap.set(recNum, Date.now())
        } else if (!isRecording && recordingStartMap.has(recNum)) {
          // Recording just ended - save the duration
          const startTime = recordingStartMap.get(recNum)!
          const callDuration = Math.floor((Date.now() - startTime) / 1000)
          lastCallDurationMap.set(recNum, callDuration)
          recordingStartMap.delete(recNum)
        }

        const finalTgAlphaTag = currentTgAlphaTag ?? lastContext?.tgAlphaTag
        const finalTgid = currentTgid ?? lastContext?.tgid

        // Look up full talkgroup info from cache for color matching
        const cachedTg = finalTgid ? talkgroupCache.get(talkgroupKey('348', finalTgid)) : undefined

        // Get cached hex color for talkgroup (computed once and cached in store)
        const tgColor = finalTgid
          ? getCachedColor('348', finalTgid, {
              alpha_tag: cachedTg?.alphaTag ?? finalTgAlphaTag,
              description: cachedTg?.description,
              group: cachedTg?.group,
              tag: cachedTg?.tag,
              tgid: finalTgid,
              sysid: '348',
            })
          : null

        return {
          recNum,
          srcNum: apiRec.src_num ?? 0,
          recType: apiRec.rec_type ?? 'P25',
          state: currentState,
          stateName: realtime?.stateName ?? apiRec.rec_state_type ?? 'AVAILABLE',
          freq: realtime?.freq ?? apiRec.freq ?? 0,
          tgid: finalTgid,
          tgAlphaTag: finalTgAlphaTag,
          tgColor: tgColor ?? undefined,
          unitId: currentUnitId ?? lastContext?.unitId,
          unitAlphaTag: currentUnitAlphaTag ?? lastContext?.unitAlphaTag,
          count: apiRec.count ?? 0,
          duration: apiRec.duration ?? 0,
          recordingStartTime: recordingStartMap.get(recNum),
          lastCallDuration: lastCallDurationMap.get(recNum),
        }
      })
      .sort((a, b) => a.recNum - b.recNum)
  }, [apiRecorders, realtimeRecorders, getCachedColor, talkgroupCache])

  const systemsArray = Array.from(decodeRates.values())
  const avgDecodeRate = systemsArray.length > 0
    ? systemsArray.reduce((acc, s) => acc + s.decodeRate, 0) / systemsArray.length
    : 0

  const recordingCount = mergedRecorders.filter((r) => r.state === 1).length
  const usedCount = mergedRecorders.length  // recorders with count > 0
  const totalCount = apiRecorders.length    // all recorders

  const handlePlayCall = (call: RecentCallInfo) => {
    const callIdStr = call.call_id ?? (call.id != null ? String(call.id) : '')
    const hasAudio = call.has_audio || !!call.audio_path
    if (!hasAudio) return

    loadCall({
      id: call.id ?? undefined,
      call_id: callIdStr,
      system: call.system,
      sysid: call.sysid,
      tgid: call.tgid,
      tg_alpha_tag: call.tg_alpha_tag,
      duration: call.duration,
      start_time: call.start_time,
      stop_time: call.stop_time || '',
      call_num: call.call_num,
      freq: call.freq,
      encrypted: call.encrypted,
      emergency: call.emergency,
      has_audio: hasAudio,
      audio_path: call.audio_path,
      units: call.units || [],
    })
  }

  return (
    <div className="space-y-4">
      {/* Compact stats bar */}
      <div className="flex flex-wrap items-center gap-4 lg:gap-6 rounded-lg border bg-card px-4 py-3">
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
            {stats?.calls_last_24h?.toLocaleString() ?? '—'}
          </span>
          <span className="text-xs text-muted-foreground">
            ({stats?.calls_last_hour?.toLocaleString() ?? '—'}/1h)
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
            avgDecodeRate >= 90 ? 'text-success' : avgDecodeRate >= 70 ? 'text-warning' : avgDecodeRate > 0 ? 'text-destructive' : ''
          )}>
            {avgDecodeRate > 0 ? formatDecodeRate(avgDecodeRate) : '—'}
          </span>
        </div>
        <div className="hidden lg:flex ml-auto items-center gap-2">
          <span className="text-sm text-muted-foreground">Storage</span>
          <span className="font-medium">{stats?.audio_bytes ? formatBytes(stats.audio_bytes) : '—'}</span>
          <span className="text-xs text-muted-foreground">
            ({stats?.audio_files?.toLocaleString() ?? '—'} files)
          </span>
        </div>
      </div>

      {/* Recorders grid - stable positions */}
      {mergedRecorders.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">RECORDERS</h2>
            <span className="text-xs text-muted-foreground">
              {recordingCount} recording / {usedCount} used / {totalCount} available
            </span>
          </div>
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
          >
            {mergedRecorders.map((rec) => {
              const stateInfo = RECORDER_STATES[rec.state] || RECORDER_STATES[7]

              return (
                <div
                  key={rec.recNum}
                  className={cn(
                    "rounded-lg border p-2.5 transition-all min-h-[100px] flex flex-col",
                    stateInfo.cardClass
                  )}
                >
                  {/* Header: recorder info + state badge */}
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-[10px] font-mono text-muted-foreground">
                      SRC {rec.srcNum} / REC {rec.recNum}
                    </span>
                    <Badge className={cn("text-[10px] px-1.5 py-0 h-5 font-bold shrink-0", stateInfo.badgeClass)}>
                      {stateInfo.label}
                    </Badge>
                  </div>

                  {/* Frequency + recording time */}
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-muted-foreground">
                      {formatFrequency(rec.freq)}
                    </span>
                    {rec.recordingStartTime && (
                      <span className="text-live font-medium">
                        <RecorderElapsed startTime={rec.recordingStartTime} />
                      </span>
                    )}
                  </div>

                  {/* TG/Unit context - always show */}
                  <div className="border-t border-border/30 pt-1 mt-0.5 space-y-0.5 flex-1">
                    <div className="flex items-center gap-1.5">
                      {(rec.tgid || rec.tgAlphaTag) ? (
                        <Link
                          to={`/talkgroups/348:${rec.tgid}`}
                          className={cn("truncate text-sm hover:underline", !rec.tgColor && "text-sky-400")}
                          style={rec.tgColor ? { color: rec.tgColor } : undefined}
                          title={rec.tgAlphaTag || `TG ${rec.tgid}`}
                        >
                          {rec.tgAlphaTag || `TG ${rec.tgid}`}
                        </Link>
                      ) : (
                        <span className="text-sm text-muted-foreground/50">—</span>
                      )}
                      {!rec.recordingStartTime && rec.lastCallDuration !== undefined && (
                        <span className="text-[11px] font-mono text-muted-foreground shrink-0">
                          {formatDuration(rec.lastCallDuration)}
                        </span>
                      )}
                    </div>
                    <div className="truncate text-sm text-amber-400" title={rec.unitAlphaTag || (rec.unitId ? `Unit ${rec.unitId}` : '')}>
                      {rec.unitAlphaTag || (rec.unitId ? `Unit ${rec.unitId}` : <span className="text-muted-foreground/50">—</span>)}
                    </div>
                  </div>

                  {/* Footer: Stats + type */}
                  <div className="flex items-center justify-between mt-1 pt-1 border-t border-border/20">
                    <span className="text-[10px] font-mono text-muted-foreground/70">
                      {rec.count} calls
                      {rec.duration > 0 && ` • ${(rec.duration / 60).toFixed(1)}m`}
                    </span>
                    <span className="text-[10px] text-muted-foreground/50 uppercase">
                      {rec.recType}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* System status - compact inline */}
      {systemsArray.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {systemsArray.map((system) => (
            <div
              key={system.system}
              className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2"
            >
              <div>
                <div className="font-medium capitalize text-sm">{system.system}</div>
                <div className="text-xs text-muted-foreground font-mono">
                  {(system.controlChannel / 1000000).toFixed(4)} MHz
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-16 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all",
                      system.decodeRate >= 90 ? 'bg-success' : system.decodeRate >= 70 ? 'bg-warning' : 'bg-destructive'
                    )}
                    style={{ width: `${system.decodeRate}%` }}
                  />
                </div>
                <span className={cn(
                  "text-sm font-bold tabular-nums w-12",
                  system.decodeRate >= 90 ? 'text-success' : system.decodeRate >= 70 ? 'text-warning' : 'text-destructive'
                )}>
                  {formatDecodeRate(system.decodeRate)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recent calls - dense grid */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">RECENT CALLS</h2>
          <Link to="/calls" className="text-xs text-primary hover:underline">
            View all →
          </Link>
        </div>

        {loading ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            Loading...
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {recentCalls.map((call) => {
              const callId = call.call_id ?? (call.id != null ? String(call.id) : '')
              const isCurrentlyPlaying = currentCall?.callId === callId
              const hasAudio = call.has_audio || !!call.audio_path

              return (
                <Card
                  key={callId}
                  className={cn(
                    "transition-colors hover:bg-accent/50",
                    isCurrentlyPlaying && "border-primary bg-primary/5"
                  )}
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
                        <div className="flex items-center gap-1">
                          <Link
                            to={`/calls/${callId}`}
                            className="truncate font-medium text-sm hover:underline"
                          >
                            {getTalkgroupDisplayName(call.tgid, call.tg_alpha_tag)}
                          </Link>
                          {call.emergency && (
                            <Badge variant="destructive" className="text-[10px] px-1 py-0">!</Badge>
                          )}
                          {call.encrypted && (
                            <Badge variant="secondary" className="text-[10px] px-1 py-0">ENC</Badge>
                          )}
                        </div>
                        <TranscriptionPreview callId={callId} compact />
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                          <span className="font-mono tabular-nums">{formatDuration(call.duration)}</span>
                          <span>•</span>
                          <span>{formatRelativeTime(call.start_time)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span>{call.system}</span>
                          {call.units && call.units.length > 0 && (
                            <>
                              <span>•</span>
                              <span>{call.units.length}u</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
