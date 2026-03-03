import { Link } from 'react-router-dom'
import type { Call } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  formatDuration,
  formatFrequency,
  getTalkgroupDisplayName,
  getUnitDisplayName,
} from '@/lib/utils'
import { useFilterStore } from '@/stores/useFilterStore'

interface ActiveCallBadgeProps {
  call: Call
  onClick?: () => void
  compact?: boolean
}

export function ActiveCallBadge({ call, onClick, compact = false }: ActiveCallBadgeProps) {
  const unitIdHex = useFilterStore((s) => s.unitIdHex)
  const elapsed = call.duration ?? 0
  // Get first transmitting unit from units list
  const lastUnit = call.units?.[call.units.length - 1]

  if (compact) {
    return (
      <Card
        className="shrink-0 cursor-pointer transition-colors border-live/50 bg-live/5 hover:bg-live/10 hover:border-live"
        onClick={onClick}
      >
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            {/* Status indicator */}
            <div className="flex flex-col items-center gap-1">
              <Badge variant="live" className="animate-pulse text-xs">
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-live" />
                LIVE
              </Badge>
              <div className="font-mono text-lg tabular-nums">
                {formatDuration(elapsed)}
              </div>
            </div>

            {/* Call info */}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <Link
                  to={`/talkgroups/${call.system_id}:${call.tgid}`}
                  className="truncate font-semibold hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {getTalkgroupDisplayName(call.tgid, call.tg_alpha_tag)}
                </Link>
                {call.emergency && (
                  <Badge variant="destructive" className="text-xs px-1">!</Badge>
                )}
                {call.encrypted && (
                  <Badge variant="secondary" className="text-xs px-1">ENC</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{call.system_name || `System ${call.system_id}`}</span>
                {call.freq != null && call.freq > 0 && (
                  <span className="font-mono">{formatFrequency(call.freq)}</span>
                )}
              </div>
              {lastUnit && (
                <div className="text-xs">
                  <span className="text-muted-foreground">TX: </span>
                  <Link
                    to={`/units/${call.system_id}:${lastUnit.unit_id}`}
                    className="font-medium hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {lastUnit.alpha_tag || getUnitDisplayName(lastUnit.unit_id, undefined, unitIdHex)}
                  </Link>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Full size version
  return (
    <Card
      className="cursor-pointer transition-colors border-live/50 bg-live/5 hover:bg-live/10 hover:border-live"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge variant="live" className="animate-pulse">
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-live" />
                LIVE
              </Badge>
              <Link
                to={`/talkgroups/${call.system_id}:${call.tgid}`}
                className="truncate font-semibold hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {getTalkgroupDisplayName(call.tgid, call.tg_alpha_tag)}
              </Link>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="text-muted-foreground">{call.system_name || `System ${call.system_id}`}</span>
              {call.freq != null && call.freq > 0 && (
                <span className="font-mono text-muted-foreground">
                  {formatFrequency(call.freq)}
                </span>
              )}
            </div>

            {lastUnit && (
              <div className="mt-2">
                <span className="text-sm text-muted-foreground">Transmitting: </span>
                <Link
                  to={`/units/${call.system_id}:${lastUnit.unit_id}`}
                  className="text-sm font-medium hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {lastUnit.alpha_tag || getUnitDisplayName(lastUnit.unit_id, undefined, unitIdHex)}
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
            <div className={cn("font-mono text-xl tabular-nums")}>
              {formatDuration(elapsed)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
