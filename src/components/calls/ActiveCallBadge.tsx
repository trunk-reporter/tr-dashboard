import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { ActiveCall } from '@/stores/useRealtimeStore'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  formatDuration,
  formatFrequency,
  getTalkgroupDisplayName,
  getUnitDisplayName,
} from '@/lib/utils'

interface ActiveCallBadgeProps {
  call: ActiveCall
  onClick?: () => void
  compact?: boolean
}

// Calculate current elapsed time based on server value + local time delta
function calculateElapsed(call: ActiveCall): number {
  if (!call.isActive) {
    // Ended calls use final elapsed value
    return call.elapsed
  }
  // Active calls: server elapsed + time since we received it
  const localDelta = Math.floor((Date.now() - call.elapsedReceivedAt) / 1000)
  return Math.max(0, call.elapsed + localDelta)
}

export function ActiveCallBadge({ call, onClick, compact = false }: ActiveCallBadgeProps) {
  const isActive = call.isActive !== false
  const [elapsed, setElapsed] = useState(() => calculateElapsed(call))

  // Update elapsed time every second for active calls
  useEffect(() => {
    // Immediately sync with latest call data
    setElapsed(calculateElapsed(call))

    if (!isActive) return

    const interval = setInterval(() => {
      setElapsed(calculateElapsed(call))
    }, 1000)

    return () => clearInterval(interval)
  }, [call, isActive])

  if (compact) {
    return (
      <Card
        className={cn(
          'shrink-0 cursor-pointer transition-colors',
          isActive
            ? 'border-live/50 bg-live/5 hover:bg-live/10 hover:border-live'
            : 'border-border bg-card hover:bg-accent/50'
        )}
        onClick={onClick}
      >
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            {/* Status indicator */}
            <div className="flex flex-col items-center gap-1">
              {isActive ? (
                <Badge variant="live" className="animate-pulse text-xs">
                  <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-live" />
                  LIVE
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  ENDED
                </Badge>
              )}
              <div className={cn(
                "font-mono text-lg tabular-nums",
                !isActive && "text-muted-foreground"
              )}>
                {formatDuration(elapsed)}
              </div>
            </div>

            {/* Call info */}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <Link
                  to={`/talkgroups/${call.sysid}:${call.talkgroup}`}
                  className="truncate font-semibold hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {getTalkgroupDisplayName(call.talkgroup, call.tgAlphaTag)}
                </Link>
                {call.emergency && (
                  <Badge variant="destructive" className="text-xs px-1">!</Badge>
                )}
                {call.encrypted && (
                  <Badge variant="secondary" className="text-xs px-1">ENC</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{call.system}</span>
                <span className="font-mono">{formatFrequency(call.freq)}</span>
              </div>
              {call.unit && (
                <div className="text-xs">
                  <span className="text-muted-foreground">{isActive ? 'TX: ' : 'Last: '}</span>
                  <Link
                    to={`/units/${call.sysid}:${call.unit}`}
                    className="font-medium hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {call.unitAlphaTag || getUnitDisplayName(call.unit)}
                  </Link>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Full size version (original layout)
  return (
    <Card
      className={cn(
        'cursor-pointer transition-colors',
        isActive
          ? 'border-live/50 bg-live/5 hover:bg-live/10 hover:border-live'
          : 'border-border bg-card hover:bg-accent/50'
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {isActive ? (
                <Badge variant="live" className="animate-pulse">
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-live" />
                  LIVE
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  ENDED
                </Badge>
              )}
              <Link
                to={`/talkgroups/${call.sysid}:${call.talkgroup}`}
                className="truncate font-semibold hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {getTalkgroupDisplayName(call.talkgroup, call.tgAlphaTag)}
              </Link>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="text-muted-foreground">{call.system}</span>
              <span className="font-mono text-muted-foreground">
                {formatFrequency(call.freq)}
              </span>
            </div>

            {call.unit && (
              <div className="mt-2">
                <span className="text-sm text-muted-foreground">
                  {isActive ? 'Transmitting: ' : 'Last unit: '}
                </span>
                <Link
                  to={`/units/${call.sysid}:${call.unit}`}
                  className="text-sm font-medium hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {call.unitAlphaTag || getUnitDisplayName(call.unit)}
                </Link>
              </div>
            )}

            {call.emergency && (
              <Badge variant="destructive" className="mt-2">
                EMERGENCY
              </Badge>
            )}

            {call.encrypted && (
              <Badge variant="secondary" className="mt-2 ml-1">
                ENCRYPTED
              </Badge>
            )}
          </div>

          <div className="text-right">
            <div className={cn(
              "font-mono text-xl tabular-nums",
              !isActive && "text-muted-foreground"
            )}>
              {formatDuration(elapsed)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
