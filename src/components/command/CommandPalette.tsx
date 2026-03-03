import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Command } from 'cmdk'
import { cn } from '@/lib/utils'
import { getTalkgroups, getUnits, searchTranscriptions } from '@/api/client'
import type { Talkgroup, Unit, TranscriptionSearchHit } from '@/api/types'
import { getTalkgroupDisplayName, getUnitDisplayName, formatRelativeTime } from '@/lib/utils'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [talkgroups, setTalkgroups] = useState<Talkgroup[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [transcriptions, setTranscriptions] = useState<TranscriptionSearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [transcriptionLoading, setTranscriptionLoading] = useState(false)
  const transcriptionTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Search talkgroups and units when search changes
  useEffect(() => {
    if (!open || search.length < 2) {
      setTalkgroups([])
      setUnits([])
      return
    }

    const controller = new AbortController()
    setLoading(true)

    Promise.all([
      getTalkgroups({ search, limit: 20 }),
      getUnits({ search, limit: 10 }),
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

    return () => controller.abort()
  }, [open, search])

  // Debounced transcription search (longer delay to avoid flooding)
  useEffect(() => {
    if (!open || search.length < 3) {
      setTranscriptions([])
      setTranscriptionLoading(false)
      return
    }

    setTranscriptionLoading(true)
    clearTimeout(transcriptionTimerRef.current)

    const controller = new AbortController()

    transcriptionTimerRef.current = setTimeout(() => {
      searchTranscriptions(search, { limit: 5 })
        .then((res) => {
          if (!controller.signal.aborted) {
            setTranscriptions(res.results || [])
          }
        })
        .catch((err) => {
          if (!controller.signal.aborted) {
            console.error('Transcription search error:', err)
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setTranscriptionLoading(false)
          }
        })
    }, 500)

    return () => {
      controller.abort()
      clearTimeout(transcriptionTimerRef.current)
    }
  }, [open, search])

  const runCommand = useCallback(
    (command: () => void) => {
      onOpenChange(false)
      command()
    },
    [onOpenChange]
  )

  // Reset search when closing
  useEffect(() => {
    if (!open) {
      setSearch('')
      setTranscriptions([])
    }
  }, [open])

  const hasResults = talkgroups.length > 0 || units.length > 0 || transcriptions.length > 0

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command Menu"
      shouldFilter={!search || search.length < 2}
      className={cn(
        'fixed inset-0 z-50 flex items-start justify-center pt-[20vh]',
        'bg-background/80 backdrop-blur-sm'
      )}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-xl border bg-card shadow-2xl">
        <Command.Input
          value={search}
          onValueChange={setSearch}
          placeholder="Search talkgroups, units, or type a command..."
          className="w-full border-b bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
        />

        <Command.List className="max-h-[400px] overflow-auto p-2">
          <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
            {loading || transcriptionLoading ? 'Searching...' : 'No results found.'}
          </Command.Empty>

          {/* Navigation commands - hidden when showing search results */}
          {!hasResults && <Command.Group heading="Navigation" className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
            <Command.Item
              value="go-to-dashboard"
              onSelect={() => runCommand(() => navigate('/'))}
              className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm aria-selected:bg-accent"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="7" height="9" x="3" y="3" rx="1" />
                <rect width="7" height="5" x="14" y="3" rx="1" />
                <rect width="7" height="9" x="14" y="12" rx="1" />
                <rect width="7" height="5" x="3" y="16" rx="1" />
              </svg>
              <span>Go to Dashboard</span>
              <kbd className="ml-auto text-xs text-muted-foreground">g d</kbd>
            </Command.Item>

            <Command.Item
              value="go-to-calls"
              onSelect={() => runCommand(() => navigate('/calls'))}
              className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm aria-selected:bg-accent"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
              <span>Go to Calls</span>
              <kbd className="ml-auto text-xs text-muted-foreground">g c</kbd>
            </Command.Item>

            <Command.Item
              value="go-to-talkgroups"
              onSelect={() => runCommand(() => navigate('/talkgroups'))}
              className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm aria-selected:bg-accent"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span>Go to Talkgroups</span>
              <kbd className="ml-auto text-xs text-muted-foreground">g t</kbd>
            </Command.Item>

            <Command.Item
              value="go-to-units"
              onSelect={() => runCommand(() => navigate('/units'))}
              className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm aria-selected:bg-accent"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 20a6 6 0 0 0-12 0" />
                <circle cx="12" cy="10" r="4" />
                <circle cx="12" cy="12" r="10" />
              </svg>
              <span>Go to Units</span>
              <kbd className="ml-auto text-xs text-muted-foreground">g u</kbd>
            </Command.Item>

            <Command.Item
              value="go-to-affiliations"
              onSelect={() => runCommand(() => navigate('/affiliations'))}
              className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm aria-selected:bg-accent"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              <span>Go to Affiliations</span>
              <kbd className="ml-auto text-xs text-muted-foreground">g a</kbd>
            </Command.Item>

            <Command.Item
              value="go-to-systems"
              onSelect={() => runCommand(() => navigate('/systems'))}
              className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm aria-selected:bg-accent"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
                <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.4" />
                <circle cx="12" cy="12" r="2" />
                <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.4" />
                <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19" />
              </svg>
              <span>Go to Systems</span>
              <kbd className="ml-auto text-xs text-muted-foreground">g e</kbd>
            </Command.Item>

            <Command.Item
              value="go-to-directory"
              onSelect={() => runCommand(() => navigate('/directory'))}
              className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm aria-selected:bg-accent"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
              </svg>
              <span>Go to Directory</span>
              <kbd className="ml-auto text-xs text-muted-foreground">g r</kbd>
            </Command.Item>

            <Command.Item
              value="go-to-settings"
              onSelect={() => runCommand(() => navigate('/settings'))}
              className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm aria-selected:bg-accent"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span>Go to Settings</span>
              <kbd className="ml-auto text-xs text-muted-foreground">g s</kbd>
            </Command.Item>

            <Command.Item
              value="go-to-admin"
              onSelect={() => runCommand(() => navigate('/admin'))}
              className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm aria-selected:bg-accent"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
              </svg>
              <span>Go to Admin</span>
              <kbd className="ml-auto text-xs text-muted-foreground">g x</kbd>
            </Command.Item>
          </Command.Group>}

          {/* Talkgroup results */}
          {talkgroups.length > 0 && (
            <Command.Group heading="Talkgroups" className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
              {talkgroups.map((tg) => (
                <Command.Item
                  key={`${tg.system_id}:${tg.tgid}`}
                  value={`talkgroup-${tg.system_id}-${tg.tgid}-${tg.alpha_tag || ''}`}
                  onSelect={() => runCommand(() => navigate(`/talkgroups/${tg.system_id}:${tg.tgid}`))}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm aria-selected:bg-accent"
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-primary/20 text-primary text-xs font-semibold">
                    TG
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">{getTalkgroupDisplayName(tg.tgid, tg.alpha_tag)}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {[tg.group, tg.description].filter(Boolean).join(' — ') || tg.tag || ''}
                    </span>
                  </div>
                  <span className="ml-auto font-mono text-xs text-muted-foreground">
                    {tg.tgid}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {/* Unit results */}
          {units.length > 0 && (
            <Command.Group heading="Units" className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
              {units.map((unit) => (
                <Command.Item
                  key={`${unit.system_id}:${unit.unit_id}`}
                  value={`unit-${unit.system_id}-${unit.unit_id}-${unit.alpha_tag || ''}`}
                  onSelect={() => runCommand(() => navigate(`/units/${unit.system_id}:${unit.unit_id}`))}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm aria-selected:bg-accent"
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-info/20 text-info text-xs font-semibold">
                    U
                  </div>
                  <span>{getUnitDisplayName(unit.unit_id, unit.alpha_tag)}</span>
                  <span className="ml-auto font-mono text-xs text-muted-foreground">
                    {unit.unit_id}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {/* Transcription results */}
          {(transcriptions.length > 0 || transcriptionLoading) && (
            <Command.Group
              heading={transcriptionLoading && transcriptions.length === 0 ? 'Transcriptions (searching...)' : 'Transcriptions'}
              className="px-2 py-1.5 text-xs font-semibold text-muted-foreground"
            >
              {transcriptions.map((hit) => (
                <Command.Item
                  key={`transcription-${hit.id}`}
                  value={`transcription-${hit.id}-${hit.call_id}`}
                  onSelect={() => runCommand(() => navigate(`/calls/${hit.call_id}`))}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm aria-selected:bg-accent"
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-emerald-500/20 text-emerald-400 text-xs font-semibold">
                    Tx
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="truncate text-xs">{hit.text}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {[hit.tg_alpha_tag || `TG ${hit.tgid}`, hit.call_start_time && formatRelativeTime(hit.call_start_time)].filter(Boolean).join(' — ')}
                    </span>
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
      </div>
    </Command.Dialog>
  )
}
