import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getCalls, searchTranscriptions } from '@/api/client'
import type { Call } from '@/api/types'

const WINDOW_PRESETS = [5, 15, 30, 60] as const

export default function Investigate() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [matchingCallIds, setMatchingCallIds] = useState<Set<number> | null>(null)

  // URL-driven state
  const targetTime = searchParams.get('t') || new Date().toISOString()
  const windowMin = parseInt(searchParams.get('window') || '15', 10)
  const keyword = searchParams.get('q') || ''

  const { windowStart, windowEnd } = useMemo(() => {
    const center = new Date(targetTime).getTime()
    return {
      windowStart: new Date(center - windowMin * 60 * 1000).toISOString(),
      windowEnd: new Date(center + windowMin * 60 * 1000).toISOString(),
    }
  }, [targetTime, windowMin])

  const updateParams = useCallback((updates: Record<string, string>) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(updates)) {
        if (v) next.set(k, v)
        else next.delete(k)
      }
      return next
    }, { replace: true })
  }, [setSearchParams])

  const setTargetTime = useCallback((t: string) => updateParams({ t }), [updateParams])
  const setWindow = useCallback((w: number) => updateParams({ window: String(w) }), [updateParams])
  const setKeyword = useCallback((q: string) => updateParams({ q }), [updateParams])
  const jumpToNow = useCallback(() => updateParams({ t: new Date().toISOString() }), [updateParams])

  // Fetch calls for current window
  useEffect(() => {
    setLoading(true)
    const timeout = setTimeout(() => {
      const fetchData = async () => {
        try {
          const callRes = await getCalls({
            start_time: windowStart,
            end_time: windowEnd,
            limit: 500,
            sort: '-start_time',
          })
          setCalls(callRes.calls)
          setTotalCount(callRes.total)

          // Keyword filter via transcription search
          if (keyword.trim()) {
            const txRes = await searchTranscriptions(keyword.trim(), {
              start_time: windowStart,
              end_time: windowEnd,
              limit: 500,
            })
            setMatchingCallIds(new Set(txRes.results.map(r => r.call_id)))
          } else {
            setMatchingCallIds(null)
          }
        } catch (err) {
          console.error('Investigate fetch error:', err)
        } finally {
          setLoading(false)
        }
      }
      fetchData()
    }, 300)

    return () => clearTimeout(timeout)
  }, [windowStart, windowEnd, keyword])

  // Filter calls by keyword match
  const filteredCalls = useMemo(() => {
    if (!matchingCallIds) return calls
    return calls.filter(c => matchingCallIds.has(c.call_id))
  }, [calls, matchingCallIds])

  // Group by talkgroup, sorted by count desc
  const talkgroupGroups = useMemo(() => {
    const groups = new Map<string, { tgKey: string; tgName: string; systemId: number; tgid: number; calls: Call[] }>()
    for (const call of filteredCalls) {
      const key = `${call.system_id}:${call.tgid}`
      if (!groups.has(key)) {
        groups.set(key, {
          tgKey: key,
          tgName: call.tg_alpha_tag || `TG ${call.tgid}`,
          systemId: call.system_id,
          tgid: call.tgid,
          calls: [],
        })
      }
      groups.get(key)!.calls.push(call)
    }
    return [...groups.values()].sort((a, b) => b.calls.length - a.calls.length)
  }, [filteredCalls])

  const isTruncated = totalCount > calls.length

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="datetime-local"
          value={targetTime.slice(0, 16)}
          onChange={(e) => setTargetTime(new Date(e.target.value).toISOString())}
          className="bg-background border border-border rounded px-2 py-1 text-sm font-mono"
        />
        <Button variant="outline" size="sm" onClick={jumpToNow}>Now</Button>

        <div className="flex gap-1">
          {WINDOW_PRESETS.map(w => (
            <Button
              key={w}
              variant={windowMin === w ? 'default' : 'outline'}
              size="sm"
              onClick={() => setWindow(w)}
            >
              ±{w}m
            </Button>
          ))}
        </div>

        <Input
          placeholder="Filter by keyword..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className="w-48"
        />
      </div>

      {/* Summary + truncation warning */}
      <div className="text-sm text-muted-foreground">
        Showing {new Date(windowStart).toLocaleTimeString()} – {new Date(windowEnd).toLocaleTimeString()}
        {' · '}{filteredCalls.length} calls across {talkgroupGroups.length} talkgroups
        {loading && ' · Loading...'}
      </div>
      {isTruncated && (
        <div className="text-sm text-amber-400 bg-amber-950/20 border border-amber-700/30 rounded px-3 py-2">
          Showing {calls.length} of {totalCount} calls — narrow your window for complete results
        </div>
      )}

      {/* Timeline placeholder */}
      <div className="text-muted-foreground text-sm">
        {talkgroupGroups.length === 0 && !loading
          ? (keyword ? `No calls matching "${keyword}" in this window` : 'No calls in this window')
          : `${talkgroupGroups.length} talkgroup rows ready for timeline`
        }
      </div>
    </div>
  )
}
