import { cn } from '@/lib/utils'

interface SkeletonProps {
  className?: string
}

/** Single shimmer bar */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div className={cn('rounded-lg bg-muted/50 skeleton-shimmer', className)} />
  )
}

/** Card-shaped skeleton matching call card dimensions */
export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div className={cn('rounded-xl border border-border bg-card/50 p-3 space-y-2', className)}>
      <div className="flex items-start gap-2">
        <Skeleton className="h-8 w-8 rounded-md shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    </div>
  )
}

/** Row-shaped skeleton matching CallCard list item dimensions */
export function SkeletonRow({ className }: SkeletonProps) {
  return (
    <div className={cn('flex items-center gap-3 rounded-lg border border-border bg-card/50 px-3 py-2', className)}>
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <Skeleton className="h-7 w-16 rounded-md shrink-0" />
    </div>
  )
}
