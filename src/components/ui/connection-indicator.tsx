import { cn } from '@/lib/utils'

type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error'

interface ConnectionIndicatorProps {
  status: ConnectionStatus
  label?: string
  className?: string
}

const dotStyles: Record<ConnectionStatus, string> = {
  connected: 'bg-success',
  connecting: 'bg-warning animate-pulse',
  disconnected: 'bg-muted-foreground',
  error: 'bg-destructive animate-pulse',
}

const defaultLabels: Record<ConnectionStatus, string> = {
  connected: 'connected',
  connecting: 'connecting',
  disconnected: 'disconnected',
  error: 'error',
}

export function ConnectionIndicator({ status, label, className }: ConnectionIndicatorProps) {
  const displayLabel = label ?? defaultLabels[status]
  return (
    <div className={cn('inline-flex items-center gap-1.5', className)}>
      <span className={cn('h-2 w-2 rounded-full shrink-0', dotStyles[status])} />
      <span className="text-xs text-muted-foreground">{displayLabel}</span>
    </div>
  )
}
