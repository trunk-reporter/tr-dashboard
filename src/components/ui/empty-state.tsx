import * as React from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground', className)}>
      {icon && <div className="opacity-40">{icon}</div>}
      <div className="text-center space-y-1">
        <p className="font-medium text-foreground">{title}</p>
        {description && <p className="text-sm">{description}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}
