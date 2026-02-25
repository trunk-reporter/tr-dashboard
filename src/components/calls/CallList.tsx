import { useMemo } from 'react'
import { CallCard } from './CallCard'
import type { Call } from '@/api/types'

interface CallListProps {
  calls: Call[]
  showSystem?: boolean
  compact?: boolean
  emptyMessage?: string
  deduplicate?: boolean
}

// Deduplicate calls by call_group_id or call_id, keeping the first occurrence
function deduplicateCalls(calls: Call[]): Call[] {
  const seen = new Set<number>()
  return calls.filter((call) => {
    const groupId = call.call_group_id ?? call.call_id
    if (groupId == null) return true
    if (seen.has(groupId)) {
      return false
    }
    seen.add(groupId)
    return true
  })
}

export function CallList({
  calls,
  showSystem = true,
  compact = false,
  emptyMessage = 'No calls found',
  deduplicate = true,
}: CallListProps) {
  const displayCalls = useMemo(
    () => (deduplicate ? deduplicateCalls(calls) : calls),
    [calls, deduplicate]
  )

  if (displayCalls.length === 0) {
    return (
      <div className="flex h-32 flex-col items-center justify-center gap-2 text-muted-foreground">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-40">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" x2="12" y1="19" y2="22" />
        </svg>
        <span>{emptyMessage}</span>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {displayCalls.map((call, i) => (
        <div key={call.call_id} className="card-fade-in" style={{ '--i': i } as React.CSSProperties}>
          <CallCard
            call={call}
            showSystem={showSystem}
            compact={compact}
          />
        </div>
      ))}
    </div>
  )
}
