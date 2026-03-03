import { useEffect, useRef, useState } from 'react'
import { getTalkgroups, getUnits } from '@/api/client'
import { getTalkgroupDisplayName, getUnitDisplayName } from '@/lib/utils'
import type { Talkgroup, Unit } from '@/api/types'

interface GoToMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNavigate: (path: string) => void
}

const NAVIGATION_OPTIONS = [
  { key: 'D', label: 'Dashboard', path: '/' },
  { key: 'C', label: 'Calls', path: '/calls' },
  { key: 'T', label: 'Talkgroups', path: '/talkgroups' },
  { key: 'U', label: 'Units', path: '/units' },
  { key: 'A', label: 'Affiliations', path: '/affiliations' },
  { key: 'E', label: 'Systems', path: '/systems' },
  { key: 'R', label: 'Directory', path: '/directory' },
  { key: 'S', label: 'Settings', path: '/settings' },
  { key: 'X', label: 'Admin', path: '/admin' },
]

export function GoToMenu({ open, onOpenChange, onNavigate }: GoToMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const [talkgroups, setTalkgroups] = useState<Talkgroup[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(false)

  // Reset state when menu closes
  useEffect(() => {
    if (!open) {
      setSearch('')
      setTalkgroups([])
      setUnits([])
    }
  }, [open])

  // Search talkgroups and units when search changes (debounced)
  useEffect(() => {
    if (!open || search.length < 2) {
      setTalkgroups([])
      setUnits([])
      setLoading(false)
      return
    }

    setLoading(true)
    const controller = new AbortController()

    // Debounce: wait 300ms after user stops typing
    const timeoutId = setTimeout(() => {
      Promise.all([
        getTalkgroups({ search, limit: 5 }),
        getUnits({ search, limit: 5 }),
      ])
        .then(([tgRes, unitRes]) => {
          if (!controller.signal.aborted) {
            setTalkgroups(tgRes.talkgroups || [])
            setUnits(unitRes.units || [])
          }
        })
        .catch((err) => {
          if (!controller.signal.aborted) {
            console.error('Search error:', err)
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setLoading(false)
          }
        })
    }, 300)

    return () => {
      clearTimeout(timeoutId)
      controller.abort()
    }
  }, [open, search])

  // Close on click outside
  useEffect(() => {
    if (!open) return

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onOpenChange(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, onOpenChange])

  // Handle key presses while menu is open
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const isSearchFocused = document.activeElement === inputRef.current

      // Escape always closes
      if (e.key === 'Escape') {
        e.preventDefault()
        onOpenChange(false)
        return
      }

      // When search is focused, only handle escape (above)
      if (isSearchFocused) {
        return
      }

      // '/' focuses the search box
      if (e.key === '/') {
        e.preventDefault()
        inputRef.current?.focus()
        return
      }

      // Navigation shortcuts
      const key = e.key.toLowerCase()
      const option = NAVIGATION_OPTIONS.find(opt => opt.key.toLowerCase() === key)

      if (option) {
        e.preventDefault()
        onNavigate(option.path)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onNavigate, onOpenChange])

  if (!open) return null

  const hasResults = talkgroups.length > 0 || units.length > 0
  const showNavigation = search.length < 2

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-background/50 backdrop-blur-sm">
      <div
        ref={menuRef}
        className="overflow-hidden rounded-xl border bg-card shadow-2xl"
        style={{ width: '550px' }}
      >
        {/* Search input */}
        <div className="border-b px-3 py-2 flex items-center gap-2">
          <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">/</kbd>
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search talkgroups and units..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="max-h-[300px] overflow-y-auto">
          {/* Navigation options - show when not searching */}
          {showNavigation && (
            <div className="p-1">
              <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Navigation</div>
              {NAVIGATION_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  onClick={() => onNavigate(option.path)}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors"
                >
                  <kbd className="flex h-6 w-6 items-center justify-center rounded border bg-muted font-mono text-xs">
                    {option.key}
                  </kbd>
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Loading state */}
          {loading && search.length >= 2 && (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              Searching...
            </div>
          )}

          {/* No results */}
          {!loading && search.length >= 2 && !hasResults && (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              No results found
            </div>
          )}

          {/* Talkgroup results */}
          {talkgroups.length > 0 && (
            <div className="p-1">
              <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Talkgroups</div>
              {talkgroups.map((tg) => (
                <button
                  key={`${tg.system_id}:${tg.tgid}`}
                  onClick={() => onNavigate(`/talkgroups/${tg.system_id}:${tg.tgid}`)}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-accent transition-colors"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/20 text-primary text-xs font-semibold shrink-0">
                    TG
                  </div>
                  <div className="flex flex-col items-start min-w-0 flex-1">
                    <div className="flex items-center gap-2 w-full">
                      <span className="font-medium truncate">{getTalkgroupDisplayName(tg.tgid, tg.alpha_tag)}</span>
                      <span className="font-mono text-xs text-muted-foreground shrink-0">{tg.tgid}</span>
                    </div>
                    {tg.description && (
                      <span className="text-xs text-muted-foreground truncate w-full">{tg.description}</span>
                    )}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {tg.group && <span className="truncate max-w-[200px]">{tg.group}</span>}
                      {tg.tag && <span className="px-1 py-0.5 rounded bg-muted text-[10px]">{tg.tag}</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Unit results */}
          {units.length > 0 && (
            <div className="p-1">
              <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Units</div>
              {units.map((unit) => (
                <button
                  key={`${unit.system_id}:${unit.unit_id}`}
                  onClick={() => onNavigate(`/units/${unit.system_id}:${unit.unit_id}`)}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-accent transition-colors"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded bg-info/20 text-info text-xs font-semibold shrink-0">
                    U
                  </div>
                  <div className="flex flex-col items-start min-w-0 flex-1">
                    <div className="flex items-center gap-2 w-full">
                      <span className="font-medium truncate">{getUnitDisplayName(unit.unit_id, unit.alpha_tag)}</span>
                      <span className="font-mono text-xs text-muted-foreground shrink-0">{unit.unit_id}</span>
                    </div>
                    {(unit.last_event_tg_tag || unit.last_event_tgid) && (
                      <span className="text-xs text-muted-foreground truncate w-full">
                        Last on: {unit.last_event_tg_tag || `TG ${unit.last_event_tgid}`}
                        {unit.last_event_type && ` (${unit.last_event_type})`}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="border-t px-3 py-2 text-xs text-muted-foreground flex items-center gap-3">
          <span><kbd className="rounded border bg-muted px-1">/</kbd> to search</span>
          <span><kbd className="rounded border bg-muted px-1">Esc</kbd> to close</span>
        </div>
      </div>
    </div>
  )
}
