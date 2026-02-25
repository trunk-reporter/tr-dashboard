import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Pagination } from '@/components/ui/pagination'
import { getTalkgroups, getSystems } from '@/api/client'
import type { Talkgroup, System } from '@/api/types'
import { useFilterStore } from '@/stores/useFilterStore'
import { useMonitorStore } from '@/stores/useMonitorStore'
import { useRealtimeStore } from '@/stores/useRealtimeStore'
import { useTalkgroupColors } from '@/stores/useTalkgroupColors'
import { getHexFromTailwind } from '@/components/ui/color-picker'
import { talkgroupKey, formatRelativeTime, cn } from '@/lib/utils'
import { SkeletonCard } from '@/components/ui/skeleton'

const DEFAULT_PAGE_SIZE = 30

export default function Talkgroups() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [allTalkgroups, setAllTalkgroups] = useState<Talkgroup[]>([])
  const [systems, setSystems] = useState<System[]>([])
  const [availableGroups, setAvailableGroups] = useState<string[]>([])
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [openOverrideMenu, setOpenOverrideMenu] = useState<string | null>(null)
  const overrideMenuRef = useRef<HTMLDivElement>(null)

  // Close override menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (overrideMenuRef.current && !overrideMenuRef.current.contains(e.target as Node)) {
        setOpenOverrideMenu(null)
      }
    }
    if (openOverrideMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [openOverrideMenu])

  // Subscribe to state to trigger re-renders, then get actions separately
  const favoriteTalkgroups = useFilterStore((s) => s.favoriteTalkgroups)
  const isFavorite = useFilterStore((s) => s.isFavorite)
  const toggleFavoriteTalkgroup = useFilterStore((s) => s.toggleFavoriteTalkgroup)
  const monitoredTalkgroups = useMonitorStore((s) => s.monitoredTalkgroups)
  const isMonitored = useMonitorStore((s) => s.isMonitored)
  const toggleTalkgroupMonitor = useMonitorStore((s) => s.toggleTalkgroupMonitor)
  // Force re-render when these change (the state subscriptions above handle this)
  void favoriteTalkgroups
  void monitoredTalkgroups

  // Talkgroup color rules and overrides
  const colorRules = useTalkgroupColors((s) => s.rules)
  const overrides = useTalkgroupColors((s) => s.overrides)
  const getColorForTalkgroup = useTalkgroupColors((s) => s.getColorForTalkgroup)
  const shouldHideTalkgroup = useTalkgroupColors((s) => s.shouldHideTalkgroup)
  const shouldHighlightTalkgroup = useTalkgroupColors((s) => s.shouldHighlightTalkgroup)
  const setOverride = useTalkgroupColors((s) => s.setOverride)
  const getOverride = useTalkgroupColors((s) => s.getOverride)
  // Force re-render when overrides change
  void overrides

  // Subscribe to active calls for real-time highlighting
  const activeCalls = useRealtimeStore((s) => s.activeCalls)

  const page = parseInt(searchParams.get('page') || '1', 10)
  const pageSize = parseInt(searchParams.get('size') || String(DEFAULT_PAGE_SIZE), 10)
  const search = searchParams.get('search') || ''
  const systemFilter = searchParams.get('system_id') || ''
  const groupFilter = searchParams.get('group') || ''
  const tagFilter = searchParams.get('tag') || ''
  const sortBy = (searchParams.get('sort') as 'alpha_tag' | 'tgid' | 'last_seen' | 'call_count' | 'calls_1h' | 'calls_24h' | 'unit_count') || 'calls_24h'
  const sortDir = (searchParams.get('dir') as 'asc' | 'desc') || 'desc'

  const offset = (page - 1) * pageSize

  // Fetch systems for filter
  useEffect(() => {
    getSystems().then((res) => setSystems(res.systems)).catch(console.error)
  }, [])

  // Fetch all talkgroups once on mount (paginated to get all)
  useEffect(() => {
    setLoading(true)

    async function fetchAllTalkgroups() {
      const allTgs: Talkgroup[] = []
      const batchSize = 1000
      let fetchOffset = 0
      let hasMore = true

      while (hasMore) {
        const res = await getTalkgroups({ limit: batchSize, offset: fetchOffset })
        const tgs = res.talkgroups || []
        allTgs.push(...tgs)

        // If we got fewer than batchSize, we've reached the end
        if (tgs.length < batchSize) {
          hasMore = false
        } else {
          fetchOffset += batchSize
        }
      }

      return allTgs
    }

    fetchAllTalkgroups()
      .then((tgs) => {
        setAllTalkgroups(tgs)

        // Extract unique groups and tags for filters
        const groups = new Set<string>()
        const tags = new Set<string>()
        for (const tg of tgs) {
          if (tg.group) groups.add(tg.group)
          if (tg.tag) tags.add(tg.tag)
        }
        setAvailableGroups(Array.from(groups).sort())
        setAvailableTags(Array.from(tags).sort())
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // Client-side filtering, sorting, and pagination
  const filteredAndSorted = (() => {
    let result = [...allTalkgroups]

    // Apply hide rules first (check both keyword rules and per-talkgroup overrides)
    result = result.filter((tg) => !shouldHideTalkgroup({
      alpha_tag: tg.alpha_tag,
      description: tg.description,
      group: tg.group,
      tag: tg.tag,
      system_id: tg.system_id,
      tgid: tg.tgid,
    }))

    // Filter by system
    if (systemFilter) {
      result = result.filter((tg) => String(tg.system_id) === systemFilter)
    }

    // Filter by group
    if (groupFilter) {
      result = result.filter((tg) => tg.group === groupFilter)
    }

    // Filter by tag
    if (tagFilter) {
      result = result.filter((tg) => tg.tag === tagFilter)
    }

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase()
      result = result.filter((tg) =>
        (tg.alpha_tag && tg.alpha_tag.toLowerCase().includes(searchLower)) ||
        (tg.description && tg.description.toLowerCase().includes(searchLower)) ||
        (tg.group && tg.group.toLowerCase().includes(searchLower)) ||
        (tg.tag && tg.tag.toLowerCase().includes(searchLower)) ||
        String(tg.tgid).includes(search)
      )
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0
      switch (sortBy) {
        case 'alpha_tag':
          cmp = (a.alpha_tag || '').localeCompare(b.alpha_tag || '')
          break
        case 'tgid':
          cmp = a.tgid - b.tgid
          break
        case 'last_seen':
          cmp = new Date(a.last_seen || 0).getTime() - new Date(b.last_seen || 0).getTime()
          break
        case 'call_count':
          cmp = (a.call_count || 0) - (b.call_count || 0)
          break
        case 'calls_1h':
          cmp = (a.calls_1h || 0) - (b.calls_1h || 0)
          break
        case 'calls_24h':
          cmp = (a.calls_24h || 0) - (b.calls_24h || 0)
          break
        case 'unit_count':
          cmp = (a.unit_count || 0) - (b.unit_count || 0)
          break
      }
      return sortDir === 'desc' ? -cmp : cmp
    })

    return result
  })()

  const totalCount = filteredAndSorted.length
  const talkgroups = filteredAndSorted.slice(offset, offset + pageSize)

  const updateParam = useCallback(
    (key: string, value: string) => {
      const newParams = new URLSearchParams(searchParams)
      if (value) {
        newParams.set(key, value)
      } else {
        newParams.delete(key)
      }
      if (key !== 'page') {
        newParams.set('page', '1')
      }
      setSearchParams(newParams)
    },
    [searchParams, setSearchParams]
  )

  const goToPage = useCallback(
    (newPage: number) => {
      const newParams = new URLSearchParams(searchParams)
      newParams.set('page', String(newPage))
      setSearchParams(newParams)
    },
    [searchParams, setSearchParams]
  )

  const changePageSize = useCallback(
    (newSize: number) => {
      const newParams = new URLSearchParams(searchParams)
      newParams.set('size', String(newSize))
      newParams.set('page', '1')
      setSearchParams(newParams)
    },
    [searchParams, setSearchParams]
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Talkgroups</h1>
        <p className="text-muted-foreground">Browse and monitor talkgroups</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search talkgroups..."
                value={search}
                onChange={(e) => updateParam('search', e.target.value)}
              />
            </div>

            <select
              value={systemFilter}
              onChange={(e) => updateParam('system_id', e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">All systems</option>
              {systems.map((sys) => (
                <option key={sys.system_id} value={sys.system_id}>
                  {sys.name || `System ${sys.system_id}`}
                </option>
              ))}
            </select>

            <select
              value={groupFilter}
              onChange={(e) => updateParam('group', e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">All groups</option>
              {availableGroups.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>

            <select
              value={tagFilter}
              onChange={(e) => updateParam('tag', e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">All tags</option>
              {availableTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>

            <select
              value={`${sortBy}:${sortDir}`}
              onChange={(e) => {
                const [sort, dir] = e.target.value.split(':')
                const newParams = new URLSearchParams(searchParams)
                newParams.set('sort', sort)
                newParams.set('dir', dir)
                newParams.set('page', '1')
                setSearchParams(newParams)
              }}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="alpha_tag:asc">Name (A-Z)</option>
              <option value="alpha_tag:desc">Name (Z-A)</option>
              <option value="tgid:asc">TGID (Low-High)</option>
              <option value="tgid:desc">TGID (High-Low)</option>
              <option value="last_seen:desc">Recently Active</option>
              <option value="call_count:desc">Most Calls (Total)</option>
              <option value="calls_24h:desc">Most Calls (24h)</option>
              <option value="calls_1h:desc">Most Calls (1h)</option>
              <option value="unit_count:desc">Most Units</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Pagination - Top */}
      <Pagination
        page={page}
        totalCount={totalCount}
        pageSize={pageSize}
        onPageChange={goToPage}
        onPageSizeChange={changePageSize}
        pageSizeOptions={[30, 60, 90]}
      />

      {/* Results */}
      <div>
        {loading ? (
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {Array.from({ length: 12 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : talkgroups.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-40">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span>No talkgroups found</span>
            <span className="text-xs">Try adjusting your search or filters</span>
          </div>
        ) : (
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {talkgroups.map((tg, i) => {
              const tgKey = talkgroupKey(tg.system_id, tg.tgid)
              const monitored = isMonitored(tg.system_id, tg.tgid)
              const favorite = isFavorite(tg.system_id, tg.tgid)

              const tgFields = {
                alpha_tag: tg.alpha_tag,
                description: tg.description,
                group: tg.group,
                tag: tg.tag,
                system_id: tg.system_id,
                tgid: tg.tgid,
              }
              const colorMatch = getColorForTalkgroup(tgFields)
              const isHighlighted = shouldHighlightTalkgroup(tgFields)
              const override = getOverride(tg.system_id, tg.tgid)

              // Check if this talkgroup has an active call
              const hasActiveCall = Array.from(activeCalls.values()).some(
                (call) => call.system_id === tg.system_id && call.tgid === tg.tgid
              )

              const bgClass = hasActiveCall
                ? 'bg-live/15 ring-1 ring-live/50'
                : isHighlighted
                  ? 'ring-2 ring-offset-1 ring-offset-background'
                  : monitored
                    ? 'bg-live/5'
                    : favorite
                      ? 'bg-primary/5'
                      : 'bg-card'

              // Build inline styles for colors
              const cardStyle: React.CSSProperties = {
                borderLeftColor: colorMatch ? resolveColor(colorMatch) : 'var(--color-muted-foreground)',
                ...(isHighlighted && colorMatch ? { '--tw-ring-color': resolveColor(colorMatch) } as React.CSSProperties : {}),
                '--i': i,
              } as React.CSSProperties

              return (
                <div
                  key={tgKey}
                  className={cn(
                    'flex gap-2 rounded-md border border-l-4 p-2 card-call-hover card-fade-in',
                    bgClass,
                    hasActiveCall && 'animate-pulse'
                  )}
                  style={cardStyle}
                >
                  {/* Action buttons - vertical on left */}
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      onClick={() => toggleTalkgroupMonitor(tg.system_id, tg.tgid)}
                      className={`p-0.5 rounded ${
                        monitored
                          ? 'text-live bg-live/10'
                          : 'text-muted-foreground hover:text-live'
                      }`}
                      title={monitored ? 'Stop monitoring' : 'Monitor'}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill={monitored ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" x2="12" y1="19" y2="22" />
                      </svg>
                    </button>
                    <button
                      onClick={() => toggleFavoriteTalkgroup(tg.system_id, tg.tgid)}
                      className={`p-0.5 rounded ${
                        favorite
                          ? 'text-primary bg-primary/10'
                          : 'text-muted-foreground hover:text-primary'
                      }`}
                      title={favorite ? 'Unfavorite' : 'Favorite'}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill={favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    </button>
                    {/* Override dropdown */}
                    <div className="relative" ref={openOverrideMenu === tgKey ? overrideMenuRef : undefined}>
                      <button
                        onClick={() => setOpenOverrideMenu(openOverrideMenu === tgKey ? null : tgKey)}
                        className={`p-0.5 rounded ${
                          override
                            ? 'text-amber-500 bg-amber-500/10'
                            : 'text-muted-foreground hover:text-amber-500'
                        }`}
                        title="Color/visibility override"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="3" />
                          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                        </svg>
                      </button>
                      {openOverrideMenu === tgKey && (
                        <div className="absolute left-0 top-full mt-1 z-50 bg-popover border rounded-md shadow-md p-1 min-w-[100px]">
                          <button
                            onClick={() => { setOverride(tg.system_id, tg.tgid, null); setOpenOverrideMenu(null) }}
                            className={`w-full text-left text-xs px-2 py-1 rounded hover:bg-accent ${!override ? 'bg-accent' : ''}`}
                          >
                            Default
                          </button>
                          <button
                            onClick={() => { setOverride(tg.system_id, tg.tgid, { mode: 'highlight', color: colorMatch || 'amber-500' }); setOpenOverrideMenu(null) }}
                            className={`w-full text-left text-xs px-2 py-1 rounded hover:bg-accent ${override?.mode === 'highlight' ? 'bg-accent' : ''}`}
                          >
                            Highlight
                          </button>
                          <button
                            onClick={() => { setOverride(tg.system_id, tg.tgid, { mode: 'hide' }); setOpenOverrideMenu(null) }}
                            className={`w-full text-left text-xs px-2 py-1 rounded hover:bg-accent ${override?.mode === 'hide' ? 'bg-accent' : ''}`}
                          >
                            Hide
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Content */}
                  <Link to={`/talkgroups/${tg.system_id}:${tg.tgid}`} className="flex-1 min-w-0">
                    {/* Row 1: Name + TGID + mode + tag */}
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-sm truncate hover:underline">
                        {tg.alpha_tag || `TG ${tg.tgid}`}
                      </span>
                      <span className="text-xs font-mono text-muted-foreground shrink-0">{tg.tgid}</span>
                      {tg.mode && <span className="text-xs text-muted-foreground shrink-0">{tg.mode}</span>}
                      {tg.tag && <span className="text-xs text-muted-foreground/70 shrink-0 ml-auto">{tg.tag}</span>}
                    </div>
                    {/* Row 2: Description */}
                    {tg.description && (
                      <div className="text-xs text-muted-foreground truncate">{tg.description}</div>
                    )}
                    {/* Row 3: Group */}
                    {tg.group && (
                      <div className="text-xs text-muted-foreground/70 truncate">{tg.group}</div>
                    )}
                    {/* Row 4: Stats + Live badge */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <span><span className="text-foreground">{tg.calls_1h ?? 0}</span>/1h</span>
                      <span><span className="text-foreground">{tg.calls_24h ?? 0}</span>/24h</span>
                      <span><span className="text-foreground">{tg.unit_count ?? 0}</span>u</span>
                      <span className="text-muted-foreground/60">{formatRelativeTime(tg.last_seen || '')}</span>
                      {hasActiveCall && (
                        <span className="shrink-0 px-1 py-0.5 text-[10px] font-bold bg-live text-white rounded ml-auto">
                          LIVE
                        </span>
                      )}
                    </div>
                  </Link>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      <Pagination
        page={page}
        totalCount={totalCount}
        pageSize={pageSize}
        onPageChange={goToPage}
        onPageSizeChange={changePageSize}
        pageSizeOptions={[30, 60, 90]}
      />

      {/* Color Key - only show non-hidden rules */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {colorRules
          .filter((rule) => rule.mode !== 'hide')
          .map((rule) => (
            <span key={rule.label} className="flex items-center gap-1.5">
              <span
                className={`w-3 h-3 rounded-sm ${rule.mode === 'highlight' ? 'ring-2 ring-offset-1' : ''}`}
                style={{
                  backgroundColor: resolveColor(rule.color),
                  ...(rule.mode === 'highlight' ? { '--tw-ring-color': resolveColor(rule.color) } as React.CSSProperties : {}),
                }}
              />
              {rule.label}
              {rule.mode === 'highlight' && ' ✦'}
            </span>
          ))}
        {colorRules.some((rule) => rule.mode === 'hide') && (
          <span className="text-muted-foreground/70">
            ({colorRules.filter((r) => r.mode === 'hide').length} hidden by rule)
          </span>
        )}
        {Object.keys(overrides).length > 0 && (
          <span className="text-muted-foreground/70">
            ({Object.keys(overrides).length} custom)
          </span>
        )}
      </div>
    </div>
  )
}

// Alias for cleaner code
const resolveColor = getHexFromTailwind
