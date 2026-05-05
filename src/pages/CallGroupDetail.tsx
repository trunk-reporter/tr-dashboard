import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getCallGroup } from '@/api/client'
import type { CallGroup, Call } from '@/api/types'
import { formatRelativeTime, formatFrequency } from '@/lib/utils'
import { useAudioStore } from '@/stores/useAudioStore'

export default function CallGroupDetail() {
  const { id } = useParams<{ id: string }>()
  const [group, setGroup] = useState<CallGroup | null>(null)
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const loadCall = useAudioStore((s) => s.loadCall)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    getCallGroup(Number(id))
      .then((res) => {
        setGroup(res.call_group)
        setCalls(res.calls || [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  const handlePlay = useCallback((call: Call) => {
    loadCall(call)
  }, [loadCall])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        Loading call group...
      </div>
    )
  }

  if (!group) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        Call group not found
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <Link to="/call-groups" className="hover:text-primary hover:underline">Call Groups</Link>
          <span>/</span>
        </div>
        <h1 className="text-2xl font-bold">
          {group.tg_alpha_tag || `TG ${group.tgid}`}
        </h1>
        <p className="text-muted-foreground">
          {group.system_name && <span>{group.system_name} · </span>}
          {group.call_count != null && <span>{group.call_count} call{group.call_count !== 1 ? 's' : ''} · </span>}
          {group.start_time && <span>Started {formatRelativeTime(group.start_time)}</span>}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Group Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            {group.tgid != null && (
              <div>
                <dt className="text-muted-foreground">Talkgroup ID</dt>
                <dd className="font-mono">{group.tgid}</dd>
              </div>
            )}
            {group.tg_alpha_tag && (
              <div>
                <dt className="text-muted-foreground">Alpha Tag</dt>
                <dd>{group.tg_alpha_tag}</dd>
              </div>
            )}
            {group.tg_description && (
              <div>
                <dt className="text-muted-foreground">Description</dt>
                <dd>{group.tg_description}</dd>
              </div>
            )}
            {group.tg_group && (
              <div>
                <dt className="text-muted-foreground">Group</dt>
                <dd>{group.tg_group}</dd>
              </div>
            )}
            {group.tg_tag && (
              <div>
                <dt className="text-muted-foreground">Tag</dt>
                <dd>{group.tg_tag}</dd>
              </div>
            )}
            {group.duration != null && (
              <div>
                <dt className="text-muted-foreground">Duration</dt>
                <dd>{Math.round(group.duration)}s</dd>
              </div>
            )}
            {group.site_short_name && (
              <div>
                <dt className="text-muted-foreground">Site</dt>
                <dd>{group.site_short_name}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recordings ({calls.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {calls.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recordings available</p>
          ) : (
            <div className="space-y-2">
              {calls.map((call) => (
                <div
                  key={call.call_id}
                  className="flex items-center justify-between rounded-lg border border-border/40 px-4 py-2.5"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="text-sm font-medium">
                      #{call.call_id}
                      {call.emergency && (
                        <span className="ml-2 text-[10px] text-red-400 font-bold">EMERGENCY</span>
                      )}
                      {call.encrypted && (
                        <span className="ml-2 text-[10px] text-muted-foreground" title="Encrypted">
                          🔒
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {call.start_time && <span>{formatRelativeTime(call.start_time)}</span>}
                      {call.duration != null && <span> · {Math.round(call.duration)}s</span>}
                      {call.freq != null && <span> · {formatFrequency(call.freq)}</span>}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePlay(call)}
                    disabled={!call.audio_url}
                  >
                    Play
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
