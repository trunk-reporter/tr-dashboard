import { useEffect, useState, useCallback, useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Pagination } from '@/components/ui/pagination'
import { getUnits, getSystems, getUnitAffiliations } from '@/api/client'
import type { Unit, System, Affiliation } from '@/api/types'
import { useRealtimeStore } from '@/stores/useRealtimeStore'
import { cn, getUnitDisplayName, formatRelativeTime, getEventTypeLabel, getEventTypeColor } from '@/lib/utils'
import { SkeletonRow } from '@/components/ui/skeleton'

const DEFAULT_PAGE_SIZE = 100

export default function Units() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [units, setUnits] = useState<Unit[]>([])
  const [systems, setSystems] = useState<System[]>([])
  const [affiliations, setAffiliations] = useState<Affiliation[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [activeView, setActiveView] = useState(searchParams.get('view') === 'active')

  const page = parseInt(searchParams.get('page') || '1', 10)
  const pageSize = parseInt(searchParams.get('size') || String(DEFAULT_PAGE_SIZE), 10)
  const search = searchParams.get('search') || ''
  const systemFilter = searchParams.get('system_id') || ''
  const sortBy = (searchParams.get('sort') as 'alpha_tag' | 'unit_id' | 'last_seen') || 'last_seen'
  const sortDir = (searchParams.get('dir') as 'asc' | 'desc') || 'desc'

  const offset = (page - 1) * pageSize

  // Realtime enrichment
  const unitEvents = useRealtimeStore((s) => s.unitEvents)
  const activeCalls = useRealtimeStore((s) => s.activeCalls)

  const recentlyActiveUnits = useMemo(() => {
    const active = new Set<number>()
    for (const evt of unitEvents) active.add(evt.unit_rid)
    for (const call of activeCalls.values()) {
      if (call.units) call.units.forEach((u) => active.add(u.unit_id))
    }
    return active
  }, [unitEvents, activeCalls])

  // Count recent SSE events per unit
  const eventCountByUnit = useMemo(() => {
    const counts = new Map<number, number>()
    for (const evt of unitEvents) {
      counts.set(evt.unit_rid, (counts.get(evt.unit_rid) || 0) + 1)
    }
    return counts
  }, [unitEvents])

  // Build affiliation lookup: "system_id:unit_id" → Affiliation
  const affiliationMap = useMemo(() => {
    const map = new Map<string, Affiliation>()
    for (const aff of affiliations) {
      map.set(`${aff.system_id}:${aff.unit_id}`, aff)
    }
    return map
  }, [affiliations])

  // Fetch systems + affiliations on mount
  useEffect(() => {
    getSystems().then((res) => setSystems(res.systems)).catch(console.error)
    getUnitAffiliations({ status: 'affiliated', limit: 1000 })
      .then((res) => setAffiliations(res.affiliations))
      .catch(console.error)
  }, [])

  // Fetch units
  useEffect(() => {
    setLoading(true)

    getUnits({
      sysid: systemFilter || undefined,
      search: search || undefined,
      active_within: activeView ? 10 : undefined,
      sort: sortBy,
      sort_dir: sortDir,
      limit: pageSize,
      offset,
    })
      .then((res) => {
        setUnits(res.units || [])
        setTotalCount(res.total)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [page, pageSize, search, systemFilter, sortBy, sortDir, offset, activeView])

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

  const toggleView = () => {
    const newParams = new URLSearchParams(searchParams)
    if (activeView) {
      newParams.delete('view')
    } else {
      newParams.set('view', 'active')
    }
    newParams.set('page', '1')
    setSearchParams(newParams)
    setActiveView(!activeView)
  }

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
    <div className="space-y-3">
      {/* Header + filters on one line */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold mr-2">Units</h1>

        <div className="flex gap-1">
          <Button
            variant={activeView ? 'outline' : 'default'}
            size="sm"
            onClick={toggleView}
          >
            All
          </Button>
          <Button
            variant={activeView ? 'default' : 'outline'}
            size="sm"
            onClick={toggleView}
          >
            Active
          </Button>
        </div>

        {!activeView && (
          <Input
            placeholder="Search units..."
            value={search}
            onChange={(e) => updateParam('search', e.target.value)}
            className="flex-1 max-w-xs h-8 text-sm"
          />
        )}

        <select
          value={systemFilter}
          onChange={(e) => updateParam('system_id', e.target.value)}
          className="rounded-md border border-input bg-background px-2 py-1 text-sm h-8"
        >
          <option value="">All systems</option>
          {systems.map((sys) => (
            <option key={sys.system_id} value={sys.sysid || String(sys.system_id)}>
              {sys.name || `System ${sys.system_id}`}
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
          className="rounded-md border border-input bg-background px-2 py-1 text-sm h-8"
        >
          <option value="last_seen:desc">Recent</option>
          <option value="alpha_tag:asc">Name A-Z</option>
          <option value="alpha_tag:desc">Name Z-A</option>
          <option value="unit_id:asc">ID Low-High</option>
          <option value="unit_id:desc">ID High-Low</option>
        </select>

        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {totalCount.toLocaleString()} units
        </span>
      </div>

      {/* Results — dense rows */}
      <div>
        {loading ? (
          <div className="space-y-0.5">
            {Array.from({ length: 12 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : units.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-40">
              <path d="M18 20a6 6 0 0 0-12 0" />
              <circle cx="12" cy="10" r="4" />
              <circle cx="12" cy="12" r="10" />
            </svg>
            <span>No units found</span>
            <span className="text-xs">Try adjusting your search or filters</span>
          </div>
        ) : (
          <div className="space-y-0.5">
            {units.map((unit, i) => {
              const isActive = recentlyActiveUnits.has(unit.unit_id)
              const eventCount = eventCountByUnit.get(unit.unit_id) || 0
              const affiliation = affiliationMap.get(`${unit.system_id}:${unit.unit_id}`)
              return (
                <Link
                  key={`${unit.system_id}:${unit.unit_id}`}
                  to={`/units/${unit.system_id}:${unit.unit_id}`}
                  className={cn(
                    'flex items-center gap-2 rounded-md border px-2.5 py-1.5 card-call-hover card-fade-in',
                    isActive && 'border-l-2 border-l-live'
                  )}
                  style={{ '--i': i } as React.CSSProperties}
                >
                  {/* Activity dot */}
                  <span className={cn(
                    'h-1.5 w-1.5 rounded-full shrink-0',
                    isActive ? 'bg-success' : 'bg-muted-foreground/30'
                  )} />

                  {/* Name + ID inline */}
                  <span className="font-medium text-sm truncate min-w-0 max-w-[180px]">
                    {getUnitDisplayName(unit.unit_id, unit.alpha_tag)}
                  </span>
                  <span className="text-[11px] font-mono text-muted-foreground/60 shrink-0">
                    {unit.unit_id}
                  </span>
                  {unit.system_name && (
                    <span className="text-[11px] text-muted-foreground/50 shrink-0 hidden lg:inline">
                      {unit.system_name}
                    </span>
                  )}

                  {isActive && (
                    <Badge variant="live" className="text-[9px] px-1 py-0 shrink-0">ACTIVE</Badge>
                  )}

                  {/* Affiliation — current TG */}
                  {affiliation && (
                    <span className="hidden md:inline text-[11px] text-muted-foreground truncate max-w-[140px]" title={`Affiliated: ${affiliation.tg_alpha_tag || `TG ${affiliation.tgid}`}`}>
                      → {affiliation.tg_alpha_tag || `TG ${affiliation.tgid}`}
                    </span>
                  )}

                  {/* Spacer */}
                  <span className="flex-1" />

                  {/* Last event context */}
                  {unit.last_event_tg_tag && (
                    <span className="hidden sm:inline text-[11px] text-muted-foreground truncate max-w-[120px]">
                      {unit.last_event_tg_tag}
                    </span>
                  )}
                  {unit.last_event_type && (
                    <Badge variant="secondary" className={cn('text-[9px] px-1 py-0 shrink-0', getEventTypeColor(unit.last_event_type))}>
                      {getEventTypeLabel(unit.last_event_type)}
                    </Badge>
                  )}

                  {/* Recent event count from SSE */}
                  {eventCount > 0 && (
                    <span className="hidden sm:inline text-[10px] text-muted-foreground/60 tabular-nums shrink-0" title={`${eventCount} recent SSE events`}>
                      {eventCount}ev
                    </span>
                  )}

                  {/* Relative time */}
                  <span className="text-[11px] text-muted-foreground shrink-0 w-14 text-right tabular-nums">
                    {formatRelativeTime(unit.last_seen || '')}
                  </span>
                </Link>
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
        pageSizeOptions={[50, 100, 200]}
      />
    </div>
  )
}
