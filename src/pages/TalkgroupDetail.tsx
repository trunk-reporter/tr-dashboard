import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CallList } from '@/components/calls/CallList'
import { getTalkgroup, getTalkgroupCalls } from '@/api/client'
import type { Talkgroup, Call } from '@/api/types'
import { useFilterStore } from '@/stores/useFilterStore'
import { useMonitorStore } from '@/stores/useMonitorStore'
import { useTranscriptionCache } from '@/stores/useTranscriptionCache'
import { formatDateTime, formatRelativeTime } from '@/lib/utils'

export default function TalkgroupDetail() {
  const { id } = useParams<{ id: string }>()
  const [talkgroup, setTalkgroup] = useState<Talkgroup | null>(null)
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Subscribe to state to trigger re-renders, then get actions separately
  const favoriteTalkgroups = useFilterStore((s) => s.favoriteTalkgroups)
  const isFavorite = useFilterStore((s) => s.isFavorite)
  const toggleFavoriteTalkgroup = useFilterStore((s) => s.toggleFavoriteTalkgroup)
  const monitoredTalkgroups = useMonitorStore((s) => s.monitoredTalkgroups)
  const isMonitored = useMonitorStore((s) => s.isMonitored)
  const toggleTalkgroupMonitor = useMonitorStore((s) => s.toggleTalkgroupMonitor)
  // Force re-render when these change (the state subscriptions above handle this)
  void favoriteTalkgroups
  void monitoredTalkgroups

  const fetchTranscription = useTranscriptionCache((s) => s.fetchTranscription)

  useEffect(() => {
    if (!id) return

    setLoading(true)
    setError(null)

    // id is in format "sysid:tgid" (e.g., "348:9284")
    Promise.all([getTalkgroup(id), getTalkgroupCalls(id, { limit: 50 })])
      .then(([tgRes, callsRes]) => {
        setTalkgroup(tgRes)
        const loadedCalls = callsRes.calls || []
        setCalls(loadedCalls)

        // Fetch transcriptions for loaded calls
        // Call type uses tg_sysid:tgid:timestamp format
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
            <h1 className="text-2xl font-bold">
              {talkgroup.alpha_tag || `TG ${talkgroup.tgid}`}
            </h1>
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
                strokeLinecap="round"
                strokeLinejoin="round"
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
        {talkgroup.priority > 0 && (
          <Badge variant="warning">Priority {talkgroup.priority}</Badge>
        )}
      </div>

      {/* Stats card */}
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

      {/* Details card */}
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-sm text-muted-foreground">First Seen</p>
              <p>{formatDateTime(talkgroup.first_seen)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Last Seen</p>
              <p>{formatDateTime(talkgroup.last_seen)}</p>
              <p className="text-xs text-muted-foreground">
                {formatRelativeTime(talkgroup.last_seen)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">System ID</p>
              <p className="font-mono">{talkgroup.sysid}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Mode</p>
              <p>{talkgroup.mode === 'D' ? 'Digital' : talkgroup.mode === 'A' ? 'Analog' : 'Unknown'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent calls */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">Recent Calls ({calls.length})</h2>
        <CallList
          calls={calls}
          showSystem={false}
          emptyMessage="No calls recorded for this talkgroup"
        />
      </div>
    </div>
  )
}
