import { useMemo, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import type { Call } from '@/api/types'
import { useTalkgroupColors } from '@/stores/useTalkgroupColors'
import { cn } from '@/lib/utils'

interface TalkgroupGroup {
  tgKey: string
  tgName: string
  systemId: number
  tgid: number
  calls: Call[]
}

interface TimelineProps {
  groups: TalkgroupGroup[]
  windowStart: string
  windowEnd: string
  selectedCallId: number | null
  expandedCallId: number | null
  onCallClick: (call: Call) => void
  onCallExpand: (call: Call) => void
  renderDetailPanel?: (call: Call) => React.ReactNode
  onPan?: (deltaMs: number) => void
  onZoom?: (direction: 'in' | 'out') => void
}

function getTickInterval(windowMinutes: number): number {
  if (windowMinutes <= 10) return 1
  if (windowMinutes <= 30) return 5
  return 10
}

export function Timeline({
  groups, windowStart, windowEnd,
  selectedCallId, expandedCallId,
  onCallClick, onCallExpand, renderDetailPanel,
  onPan, onZoom,
}: TimelineProps) {
  const getCachedColor = useTalkgroupColors((s) => s.getCachedColor)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startMs: number } | null>(null)
  const startMs = new Date(windowStart).getTime()
  const endMs = new Date(windowEnd).getTime()
  const durationMs = endMs - startMs
  const windowMinutes = durationMs / 60000

  // Wheel to zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!onZoom) return
    e.preventDefault()
    onZoom(e.deltaY < 0 ? 'in' : 'out')
  }, [onZoom])

  // Drag to pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!onPan || !containerRef.current) return
    // Only initiate drag on the timeline area background, not on call blocks
    if ((e.target as HTMLElement).closest('[data-call-block]')) return
    dragRef.current = { startX: e.clientX, startMs }
    e.preventDefault()
  }, [onPan, startMs])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current || !onPan || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    // Subtract the 180px label column
    const timelineWidth = rect.width - 180
    if (timelineWidth <= 0) return
    const deltaX = e.clientX - dragRef.current.startX
    const deltaPct = deltaX / timelineWidth
    const deltaMs = -deltaPct * durationMs
    dragRef.current.startX = e.clientX
    onPan(deltaMs)
  }, [onPan, durationMs])

  const handleMouseUp = useCallback(() => {
    dragRef.current = null
  }, [])

  // Time axis ticks
  const ticks = useMemo(() => {
    const interval = getTickInterval(windowMinutes)
    const result: { pct: number; label: string }[] = []
    const firstTick = new Date(windowStart)
    firstTick.setSeconds(0, 0)
    firstTick.setMinutes(Math.ceil(firstTick.getMinutes() / interval) * interval)

    let t = firstTick.getTime()
    while (t <= endMs) {
      const pct = ((t - startMs) / durationMs) * 100
      if (pct >= 0 && pct <= 100) {
        result.push({
          pct,
          label: new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        })
      }
      t += interval * 60 * 1000
    }
    return result
  }, [windowStart, endMs, startMs, durationMs, windowMinutes])

  // Now marker
  const nowMs = Date.now()
  const nowPct = nowMs >= startMs && nowMs <= endMs
    ? ((nowMs - startMs) / durationMs) * 100
    : null

  if (groups.length === 0) return null

  return (
    <div
      ref={containerRef}
      className={cn("border border-border/40 rounded-lg overflow-hidden", onPan && "cursor-grab active:cursor-grabbing")}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Time axis */}
      <div className="relative h-8 bg-zinc-900/40 border-b border-border/30" style={{ marginLeft: '180px' }}>
        {ticks.map((tick, i) => (
          <div
            key={i}
            className="absolute top-0 h-full flex flex-col items-center"
            style={{ left: `${tick.pct}%`, transform: 'translateX(-50%)' }}
          >
            <div className="w-px h-2 bg-border/60" />
            <span className="text-[10px] font-mono text-muted-foreground/70 mt-0.5">{tick.label}</span>
          </div>
        ))}
        {nowPct !== null && (
          <div
            className="absolute top-0 h-full w-px bg-primary/60 z-10"
            style={{ left: `${nowPct}%` }}
            title="Now"
          >
            <div className="absolute -top-0 left-1 text-[9px] text-primary font-mono">NOW</div>
          </div>
        )}
      </div>

      {/* Talkgroup rows */}
      {groups.map((group) => {
        const tgColor = getCachedColor(group.systemId, group.tgid, {
          alpha_tag: group.tgName,
          system_id: group.systemId,
          tgid: group.tgid,
        })
        const expandedCall = group.calls.find(c => c.call_id === expandedCallId)

        return (
          <div key={group.tgKey}>
            <div className="flex border-b border-border/20 hover:bg-muted/10">
              {/* TG label */}
              <div className="w-[180px] shrink-0 px-3 py-1.5 flex items-center">
                <Link
                  to={`/talkgroups/${group.tgKey}`}
                  className={cn("text-sm truncate hover:underline", !tgColor && "text-sky-400")}
                  style={tgColor ? { color: tgColor } : undefined}
                  title={group.tgName}
                >
                  {group.tgName}
                </Link>
                <span className="text-[10px] text-muted-foreground/50 ml-1.5 shrink-0">
                  {group.calls.length}
                </span>
              </div>

              {/* Call blocks area */}
              <div className="flex-1 relative h-10">
                {group.calls.map((call) => {
                  const callStart = new Date(call.start_time).getTime()
                  const callEnd = call.stop_time
                    ? new Date(call.stop_time).getTime()
                    : callStart + (call.duration ?? 0) * 1000
                  const leftPct = Math.max(0, ((callStart - startMs) / durationMs) * 100)
                  const widthPct = Math.max(0.3, ((callEnd - callStart) / durationMs) * 100)
                  const isSelected = call.call_id === selectedCallId
                  const isExpanded = call.call_id === expandedCallId

                  return (
                    <div
                      key={call.call_id}
                      data-call-block
                      className={cn(
                        "absolute top-1 bottom-1 rounded-sm cursor-pointer transition-all",
                        "hover:brightness-125 hover:z-10",
                        call.emergency ? "ring-1 ring-red-500" : "",
                        call.encrypted ? "opacity-50" : "",
                        isSelected ? "ring-2 ring-primary animate-pulse" : "",
                        isExpanded ? "ring-2 ring-amber-500" : "",
                      )}
                      style={{
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                        minWidth: '4px',
                        backgroundColor: tgColor || '#38bdf8',
                      }}
                      onClick={() => onCallClick(call)}
                      onDoubleClick={() => onCallExpand(call)}
                      title={`${new Date(call.start_time).toLocaleTimeString()} · ${call.duration ? Math.round(call.duration) + 's' : '?'} · ${call.src_list?.length ?? 0} units`}
                    />
                  )
                })}

                {/* Now marker line continues through rows */}
                {nowPct !== null && (
                  <div
                    className="absolute top-0 h-full w-px bg-primary/30 pointer-events-none"
                    style={{ left: `${nowPct}%` }}
                  />
                )}
              </div>
            </div>

            {/* Detail panel (rendered below the row) */}
            {expandedCall && renderDetailPanel?.(expandedCall)}
          </div>
        )
      })}
    </div>
  )
}
