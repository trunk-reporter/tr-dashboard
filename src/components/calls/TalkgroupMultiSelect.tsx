import { useState, useEffect, useRef, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn, getTalkgroupDisplayName } from '@/lib/utils'
import { getTalkgroups } from '@/api/client'
import type { Talkgroup } from '@/api/types'

interface TalkgroupMultiSelectProps {
  selected: string[] // composite keys "system_id:tgid"
  onSelectionChange: (keys: string[]) => void
  systemFilter?: string
  talkgroups: Talkgroup[] // for resolving display names of already-selected items
}

export function TalkgroupMultiSelect({
  selected,
  onSelectionChange,
  systemFilter,
  talkgroups: knownTalkgroups,
}: TalkgroupMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Talkgroup[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Search talkgroups with debounce
  useEffect(() => {
    if (!open || search.length < 1) {
      setResults([])
      return
    }

    clearTimeout(debounceRef.current)
    const controller = new AbortController()
    setLoading(true)

    debounceRef.current = setTimeout(() => {
      getTalkgroups({
        search,
        system_id: systemFilter || undefined,
        limit: 20,
      })
        .then((res) => {
          if (!controller.signal.aborted) {
            setResults(res.talkgroups || [])
          }
        })
        .catch((err) => {
          if (!controller.signal.aborted) {
            console.error('Talkgroup search error:', err)
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setLoading(false)
          }
        })
    }, 200)

    return () => {
      controller.abort()
      clearTimeout(debounceRef.current)
    }
  }, [open, search, systemFilter])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const toggleTalkgroup = useCallback(
    (key: string) => {
      if (selected.includes(key)) {
        onSelectionChange(selected.filter((k) => k !== key))
      } else {
        onSelectionChange([...selected, key])
      }
    },
    [selected, onSelectionChange]
  )

  const removeTalkgroup = useCallback(
    (key: string) => {
      onSelectionChange(selected.filter((k) => k !== key))
    },
    [selected, onSelectionChange]
  )

  // Resolve display name for a composite key
  const getDisplayName = useCallback(
    (compositeKey: string) => {
      const tg = knownTalkgroups.find(
        (t) => `${t.system_id}:${t.tgid}` === compositeKey
      )
      if (tg) return getTalkgroupDisplayName(tg.tgid, tg.alpha_tag)
      // Parse tgid from key
      const parts = compositeKey.split(':')
      const tgid = parts.length === 2 ? parts[1] : compositeKey
      return `TG ${tgid}`
    },
    [knownTalkgroups]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        inputRef.current?.blur()
      }
      // Backspace with empty search removes last chip
      if (e.key === 'Backspace' && search === '' && selected.length > 0) {
        onSelectionChange(selected.slice(0, -1))
      }
    },
    [search, selected, onSelectionChange]
  )

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-1 block text-sm text-muted-foreground">Talkgroups</label>

      {/* Input area with chips */}
      <div
        className={cn(
          'flex min-h-[38px] flex-wrap items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-sm',
          'cursor-text focus-within:ring-1 focus-within:ring-ring'
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {selected.map((key) => (
          <Badge
            key={key}
            variant="secondary"
            className="gap-1 py-0.5 pl-2 pr-1"
          >
            <span className="max-w-[140px] truncate">{getDisplayName(key)}</span>
            <button
              type="button"
              className="ml-0.5 rounded hover:bg-foreground/10 p-0.5"
              onClick={(e) => {
                e.stopPropagation()
                removeTalkgroup(key)
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
              </svg>
            </button>
          </Badge>
        ))}
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={selected.length === 0 ? 'Search talkgroups...' : ''}
          className="min-w-[80px] flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        />
      </div>

      {/* Dropdown results */}
      {open && (search.length >= 1 || results.length > 0) && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
          <div className="max-h-[240px] overflow-auto p-1">
            {loading && results.length === 0 && (
              <div className="px-3 py-2 text-sm text-muted-foreground">Searching...</div>
            )}
            {!loading && search.length >= 1 && results.length === 0 && (
              <div className="px-3 py-2 text-sm text-muted-foreground">No talkgroups found</div>
            )}
            {results.map((tg) => {
              const key = `${tg.system_id}:${tg.tgid}`
              const isSelected = selected.includes(key)
              return (
                <button
                  key={key}
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm',
                    'hover:bg-accent hover:text-accent-foreground',
                    isSelected && 'bg-accent/50'
                  )}
                  onClick={() => toggleTalkgroup(key)}
                >
                  {/* Checkbox indicator */}
                  <div className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                    isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-input'
                  )}>
                    {isSelected && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </div>

                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="truncate">
                      {getTalkgroupDisplayName(tg.tgid, tg.alpha_tag)}
                    </span>
                    {(tg.group || tg.description) && (
                      <span className="text-xs text-muted-foreground truncate">
                        {[tg.group, tg.description].filter(Boolean).join(' — ')}
                      </span>
                    )}
                  </div>

                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {tg.tgid}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
