import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useRealtimeStore } from '@/stores/useRealtimeStore'
import { useMonitorStore } from '@/stores/useMonitorStore'
import { useAudioStore } from '@/stores/useAudioStore'
import { getHealth } from '@/api/client'
import { formatDecodeRate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { APP_VERSION } from '@/version'

interface HeaderProps {
  onToggleSidebar: () => void
  onOpenCommand: () => void
}

export function Header({ onToggleSidebar, onOpenCommand }: HeaderProps) {
  const navigate = useNavigate()
  const connectionStatus = useRealtimeStore((s) => s.connectionStatus)
  const activeCalls = useRealtimeStore((s) => s.activeCalls)
  const decodeRates = useRealtimeStore((s) => s.decodeRates)

  const isMonitoring = useMonitorStore((s) => s.isMonitoring)
  const monitoredTalkgroups = useMonitorStore((s) => s.monitoredTalkgroups)
  const toggleMonitoring = useMonitorStore((s) => s.toggleMonitoring)

  const queue = useAudioStore((s) => s.queue)

  const [apiVersion, setApiVersion] = useState<string | null>(null)

  // Fetch API version on mount
  useEffect(() => {
    getHealth()
      .then((health) => setApiVersion(health.version ?? null))
      .catch(() => setApiVersion(null))
  }, [])

  const activeCallCount = activeCalls.size
  const monitoredCount = monitoredTalkgroups.size
  const avgDecodeRate =
    decodeRates.size > 0
      ? Array.from(decodeRates.values()).reduce((acc, r) => acc + r.decode_rate, 0) /
        decodeRates.size
      : null

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-4">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          className="shrink-0"
          aria-label="Toggle sidebar"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="3" x2="21" y1="6" y2="6" />
            <line x1="3" x2="21" y1="12" y2="12" />
            <line x1="3" x2="21" y1="18" y2="18" />
          </svg>
        </Button>

        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-lg font-semibold tracking-tight"
        >
          <span className="text-primary">◉</span>
          <span>tr-dashboard</span>
          <span className="text-xs font-normal text-muted-foreground">
            v{APP_VERSION}
            {apiVersion && ` / api ${apiVersion}`}
          </span>
        </button>
      </div>

      <div className="flex items-center gap-3">
        {/* Monitor toggle */}
        <Button
          variant={isMonitoring ? 'default' : 'outline'}
          size="sm"
          onClick={toggleMonitoring}
          disabled={monitoredCount === 0}
          className={cn(
            'gap-2',
            isMonitoring && 'bg-live hover:bg-live/90'
          )}
          title={monitoredCount === 0 ? 'No talkgroups selected for monitoring' : undefined}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
          <span className="hidden sm:inline">
            {isMonitoring ? 'Monitoring' : 'Monitor'}
          </span>
          {monitoredCount > 0 && (
            <span className="rounded-full bg-background/20 px-1.5 text-xs">
              {monitoredCount}
            </span>
          )}
        </Button>

        {/* Queue indicator */}
        {queue.length > 0 && (
          <Badge variant="secondary" className="tabular-nums">
            {queue.length} queued
          </Badge>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={onOpenCommand}
          className="hidden gap-2 text-muted-foreground sm:flex"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <span className="text-xs">Search</span>
          <kbd className="pointer-events-none ml-2 inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            <span className="text-xs">⌘</span>K
          </kbd>
        </Button>

        <div className="flex items-center gap-2">
          {decodeRates.size > 0 && avgDecodeRate !== null && (
            <span className="hidden text-sm text-muted-foreground lg:inline">
              {formatDecodeRate(avgDecodeRate)}
            </span>
          )}

          {activeCallCount > 0 && (
            <Badge variant="live" className="tabular-nums">
              {activeCallCount} Active
            </Badge>
          )}

          <Badge
            variant={
              connectionStatus === 'connected'
                ? 'success'
                : connectionStatus === 'connecting'
                  ? 'warning'
                  : 'destructive'
            }
          >
            <span
              className={`mr-1.5 inline-block h-2 w-2 rounded-full ${
                connectionStatus === 'connected'
                  ? 'bg-success'
                  : connectionStatus === 'connecting'
                    ? 'bg-warning animate-pulse'
                    : 'bg-destructive'
              }`}
            />
            {connectionStatus === 'connected'
              ? 'Connected'
              : connectionStatus === 'connecting'
                ? 'Connecting'
                : 'Disconnected'}
          </Badge>
        </div>
      </div>
    </header>
  )
}
