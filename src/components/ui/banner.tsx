import * as React from 'react'
import { cn } from '@/lib/utils'

type BannerVariant = 'info' | 'success' | 'warning' | 'error'

interface BannerProps {
  variant?: BannerVariant
  icon?: React.ReactNode
  children: React.ReactNode
  action?: React.ReactNode
  onDismiss?: () => void
  className?: string
}

const variantStyles: Record<BannerVariant, string> = {
  info: 'border-info/30 bg-info/5 text-info',
  success: 'border-success/30 bg-success/5 text-success',
  warning: 'border-warning/30 bg-warning/5 text-warning',
  error: 'border-destructive/30 bg-destructive/5 text-destructive',
}

export function Banner({ variant = 'info', icon, children, action, onDismiss, className }: BannerProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border px-4 py-2.5',
        variantStyles[variant],
        className
      )}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="flex-1 text-sm text-muted-foreground">{children}</span>
      {action && <span className="shrink-0">{action}</span>}
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="shrink-0 ml-1 opacity-60 hover:opacity-100 transition-opacity"
          aria-label="Dismiss"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" x2="6" y1="6" y2="18" />
            <line x1="6" x2="18" y1="6" y2="18" />
          </svg>
        </button>
      )}
    </div>
  )
}
