import * as React from 'react'
import { cn } from '@/lib/utils'

type FilterChipVariant = 'default' | 'amber' | 'destructive'

interface FilterChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
  variant?: FilterChipVariant
}

const activeStyles: Record<FilterChipVariant, string> = {
  default: 'bg-primary text-primary-foreground border-primary',
  amber: 'bg-amber-500 text-white border-amber-500',
  destructive: 'bg-destructive text-destructive-foreground border-destructive',
}

const inactiveStyles: Record<FilterChipVariant, string> = {
  default: 'hover:border-primary/50',
  amber: 'hover:border-amber-500/50',
  destructive: 'hover:border-destructive/50',
}

export function FilterChip({
  active = false,
  variant = 'default',
  className,
  children,
  ...props
}: FilterChipProps) {
  return (
    <button
      className={cn(
        'px-2 py-0.5 text-xs rounded-full border transition-colors',
        active
          ? activeStyles[variant]
          : cn('bg-transparent text-muted-foreground border-border', inactiveStyles[variant]),
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}
