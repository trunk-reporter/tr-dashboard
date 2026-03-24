import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useHotkeys } from 'react-hotkeys-hook'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getCalls, searchTranscriptions } from '@/api/client'
import type { Call } from '@/api/types'
import { useAudioStore } from '@/stores/useAudioStore'
import { useRealtimeStore } from '@/stores/useRealtimeStore'
import { Timeline } from '@/components/investigate/Timeline'
import { DetailPanel } from '@/components/investigate/DetailPanel'

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

  const activeCalls = useRealtimeStore((s) => s.activeCalls)

  // Merge live calls into the timeline when window includes "now"
  const allCalls = useMemo(() => {
    const nowMs = Date.now()
    const startMs = new Date(windowStart).getTime()
    const endMs = new Date(windowEnd).getTime()

    if (nowMs < startMs || nowMs > endMs) return filteredCalls

    const fetchedIds = new Set(filteredCalls.map(c => c.call_id))
    const liveCalls = Array.from(activeCalls.values()).filter(
      c => !fetchedIds.has(c.call_id) && new Date(c.start_time).getTime() >= startMs
    )
    return [...filteredCalls, ...liveCalls]
  }, [filteredCalls, activeCalls, windowStart, windowEnd])

  // Group by talkgroup, sorted by count desc
  const talkgroupGroups = useMemo(() => {
    const groups = new Map<string, { tgKey: string; tgName: string; systemId: number; tgid: number; calls: Call[] }>()
    for (const call of allCalls) {
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
  }, [allCalls])

  const isTruncated = totalCount > calls.length

  const [selectedCallId, setSelectedCallId] = useState<number | null>(null)
  const [expandedCallId, setExpandedCallId] = useState<number | null>(null)

  const loadCall = useAudioStore((s) => s.loadCall)
  const currentCall = useAudioStore((s) => s.currentCall)

  const handleCallClick = useCallback((call: Call) => {
    setSelectedCallId(call.call_id)
    if (call.audio_url) loadCall(call)
  }, [loadCall])

  const handleCallExpand = useCallback((call: Call) => {
    setExpandedCallId(prev => prev === call.call_id ? null : call.call_id)
  }, [])

  // Keyboard handlers
  const handlePanLeft = useCallback(() => {
    const shift = windowMin * 60 * 1000 * 0.5
    setTargetTime(new Date(new Date(targetTime).getTime() - shift).toISOString())
  }, [targetTime, windowMin, setTargetTime])

  const handlePanRight = useCallback(() => {
    const shift = windowMin * 60 * 1000 * 0.5
    setTargetTime(new Date(new Date(targetTime).getTime() + shift).toISOString())
  }, [targetTime, windowMin, setTargetTime])

  const handleZoomIn = useCallback(() => {
    const idx = WINDOW_PRESETS.indexOf(windowMin as typeof WINDOW_PRESETS[number])
    if (idx > 0) setWindow(WINDOW_PRESETS[idx - 1])
  }, [windowMin, setWindow])

  const handleZoomOut = useCallback(() => {
    const idx = WINDOW_PRESETS.indexOf(windowMin as typeof WINDOW_PRESETS[number])
    if (idx < WINDOW_PRESETS.length - 1) setWindow(WINDOW_PRESETS[idx + 1])
  }, [windowMin, setWindow])

  const handlePlaySelected = useCallback(() => {
    if (selectedCallId !== null) {
      const call = allCalls.find(c => c.call_id === selectedCallId)
      if (call) loadCall(call)
    }
  }, [selectedCallId, allCalls, loadCall])

  useHotkeys('left', handlePanLeft, { preventDefault: true })
  useHotkeys('right', handlePanRight, { preventDefault: true })
  useHotkeys('equal', handleZoomIn)
  useHotkeys('minus', handleZoomOut)
  useHotkeys('enter', handlePlaySelected)
  useHotkeys('n', jumpToNow)
  useHotkeys('escape', () => setExpandedCallId(null))

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

      {loading && talkgroupGroups.length === 0 && (
        <div className="flex items-center justify-center h-32 text-muted-foreground">
          Loading calls...
        </div>
      )}
      {!loading && talkgroupGroups.length === 0 && (
        <div className="flex items-center justify-center h-32 text-muted-foreground">
          {keyword ? `No calls matching "${keyword}" in this window` : 'No calls in this window'}
        </div>
      )}
      <Timeline
        groups={talkgroupGroups}
        windowStart={windowStart}
        windowEnd={windowEnd}
        selectedCallId={currentCall?.callId ?? selectedCallId}
        expandedCallId={expandedCallId}
        onCallClick={handleCallClick}
        onCallExpand={handleCallExpand}
        renderDetailPanel={(call) => <DetailPanel call={call} />}
      />
    </div>
  )
}
