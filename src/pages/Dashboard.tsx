import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CallList } from '@/components/calls/CallList'
import { ActiveCallBadge } from '@/components/calls/ActiveCallBadge'
import { useRealtimeStore } from '@/stores/useRealtimeStore'
import { getStats, getRecentCalls } from '@/api/client'
import type { StatsResponse, RecentCallInfo } from '@/api/types'
import { formatBytes, formatDecodeRate } from '@/lib/utils'
import { REFRESH_INTERVALS } from '@/lib/constants'

export default function Dashboard() {
  const activeCalls = useRealtimeStore((s) => s.activeCalls)
  const decodeRates = useRealtimeStore((s) => s.decodeRates)
  const connectionStatus = useRealtimeStore((s) => s.connectionStatus)

  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [recentCalls, setRecentCalls] = useState<RecentCallInfo[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch initial data
  useEffect(() => {
    Promise.all([getStats(), getRecentCalls(20)])
      .then(([statsRes, recentRes]) => {
        setStats(statsRes)
        setRecentCalls(recentRes.calls)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

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
      getRecentCalls(20).then((res) => setRecentCalls(res.calls)).catch(console.error)
    }, REFRESH_INTERVALS.RECENT_CALLS)
    return () => clearInterval(interval)
  }, [])

  const activeCallsArray = Array.from(activeCalls.values())
  const liveCallsCount = activeCallsArray.filter(c => c.isActive !== false).length
  const systemsArray = Array.from(decodeRates.values())

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Real-time radio monitoring</p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Calls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">{liveCallsCount}</span>
              {liveCallsCount > 0 && (
                <Badge variant="live" className="animate-pulse">
                  LIVE
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Calls (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums">
              {stats?.calls_last_24h?.toLocaleString() ?? '—'}
            </div>
            {stats?.calls_last_hour !== undefined && (
              <p className="text-sm text-muted-foreground">
                {stats.calls_last_hour.toLocaleString()} in last hour
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Systems
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">{systemsArray.length}</span>
              <Badge
                variant={connectionStatus === 'connected' ? 'success' : 'secondary'}
              >
                {connectionStatus}
              </Badge>
            </div>
            {systemsArray.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Avg decode: {formatDecodeRate(
                  systemsArray.reduce((acc, s) => acc + s.decodeRate, 0) / systemsArray.length
                )}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Audio Storage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {stats?.audio_bytes ? formatBytes(stats.audio_bytes) : '—'}
            </div>
            {stats?.audio_files !== undefined && (
              <p className="text-sm text-muted-foreground">
                {stats.audio_files.toLocaleString()} files
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Active calls section - wrapping grid */}
      {activeCallsArray.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold">Live Activity</h2>
          <div className="flex flex-wrap gap-3">
            {activeCallsArray
              .sort((a, b) => {
                // Active calls first, then by most recently updated
                if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
                return b.elapsedReceivedAt - a.elapsedReceivedAt
              })
              .map((call) => (
                <ActiveCallBadge
                  key={`${call.system}:${call.talkgroup}`}
                  call={call}
                  compact
                />
              ))}
          </div>
        </div>
      )}

      {/* Recent calls section */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent Calls</h2>
          <a
            href="/calls"
            className="text-sm text-primary hover:underline"
          >
            View all →
          </a>
        </div>

        {loading ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            Loading...
          </div>
        ) : (
          <CallList calls={recentCalls} compact />
        )}
      </div>

      {/* System status */}
      {systemsArray.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold">System Status</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {systemsArray.map((system) => (
              <Card key={system.system}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold capitalize">{system.system}</h3>
                      <p className="text-sm text-muted-foreground">
                        Control: {(system.controlChannel / 1000000).toFixed(4)} MHz
                      </p>
                    </div>
                    <div className="text-right">
                      <div
                        className={`text-2xl font-bold tabular-nums ${
                          system.decodeRate >= 90
                            ? 'text-success'
                            : system.decodeRate >= 70
                              ? 'text-warning'
                              : 'text-destructive'
                        }`}
                      >
                        {formatDecodeRate(system.decodeRate)}
                      </div>
                      <p className="text-xs text-muted-foreground">decode rate</p>
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className={`h-full transition-all ${
                        system.decodeRate >= 90
                          ? 'bg-success'
                          : system.decodeRate >= 70
                            ? 'bg-warning'
                            : 'bg-destructive'
                      }`}
                      style={{ width: `${system.decodeRate}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
