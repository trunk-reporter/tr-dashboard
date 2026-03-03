import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Pagination } from '@/components/ui/pagination'
import { getUnitAffiliations, getSystems } from '@/api/client'
import type { Affiliation, System } from '@/api/types'
import { formatRelativeTime, formatUnitId } from '@/lib/utils'
import { useFilterStore } from '@/stores/useFilterStore'

const DEFAULT_PAGE_SIZE = 50
const POLL_INTERVAL = 10000

export default function Affiliations() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [affiliations, setAffiliations] = useState<Affiliation[]>([])
  const [systems, setSystems] = useState<System[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const unitIdHex = useFilterStore((s) => s.unitIdHex)
  const [talkgroupCounts, setTalkgroupCounts] = useState<Record<string, number>>({})

  const page = parseInt(searchParams.get('page') || '1', 10)
  const pageSize = parseInt(searchParams.get('size') || String(DEFAULT_PAGE_SIZE), 10)
  const systemFilter = searchParams.get('system_id') || ''
  const statusFilter = (searchParams.get('status') as 'affiliated' | 'off' | '') || ''

  const offset = (page - 1) * pageSize

  // Fetch systems for filter
  useEffect(() => {
    getSystems().then((res) => setSystems(res.systems)).catch(console.error)
  }, [])

  // Fetch affiliations with polling
  const fetchAffiliations = useCallback(() => {
    getUnitAffiliations({
      system_id: systemFilter || undefined,
      status: statusFilter || undefined,
      stale_threshold: 3600,
      limit: pageSize,
      offset,
    })
      .then((res) => {
        setAffiliations(res.affiliations || [])
        setTotalCount(res.total)
        setTalkgroupCounts(res.summary?.talkgroup_counts || {})
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [systemFilter, statusFilter, pageSize, offset])

  useEffect(() => {
    setLoading(true)
    fetchAffiliations()

    const interval = setInterval(fetchAffiliations, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchAffiliations])

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

  // Top talkgroups by affiliated unit count
  const topTalkgroups = Object.entries(talkgroupCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Unit Affiliations</h1>
        <p className="text-muted-foreground">
          Live unit-to-talkgroup affiliation status
          {!loading && <span className="ml-2 text-xs">({totalCount} total)</span>}
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4">
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

            <div className="flex gap-2">
              <Button
                variant={!statusFilter ? 'default' : 'outline'}
                size="sm"
                onClick={() => updateParam('status', '')}
              >
                All
              </Button>
              <Button
                variant={statusFilter === 'affiliated' ? 'default' : 'outline'}
                size="sm"
                onClick={() => updateParam('status', 'affiliated')}
              >
                Affiliated
              </Button>
              <Button
                variant={statusFilter === 'off' ? 'default' : 'outline'}
                size="sm"
                onClick={() => updateParam('status', 'off')}
              >
                Off
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary - top talkgroups by unit count */}
      {topTalkgroups.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Top Talkgroups by Affiliated Units</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {topTalkgroups.map(([tgKey, count]) => (
                <Link key={tgKey} to={`/talkgroups/${tgKey}`}>
                  <Badge variant="secondary" className="text-xs hover:bg-accent cursor-pointer">
                    {tgKey}: {count} unit{count !== 1 ? 's' : ''}
                  </Badge>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pagination - Top */}
      <Pagination
        page={page}
        totalCount={totalCount}
        pageSize={pageSize}
        onPageChange={goToPage}
        onPageSizeChange={changePageSize}
        pageSizeOptions={[50, 100, 200]}
      />

      {/* Results */}
      <div>
        {loading ? (
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            Loading...
          </div>
        ) : affiliations.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            No affiliations found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-4">Unit</th>
                  <th className="pb-2 pr-4">Talkgroup</th>
                  <th className="pb-2 pr-4">Group</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Since</th>
                  <th className="pb-2">Last Event</th>
                </tr>
              </thead>
              <tbody>
                {affiliations.map((aff, i) => (
                  <tr
                    key={`${aff.system_id}:${aff.unit_id}:${aff.tgid}:${i}`}
                    className="border-b border-border/50 hover:bg-accent/50 transition-colors"
                  >
                    <td className="py-2 pr-4">
                      <Link
                        to={`/units/${aff.system_id}:${aff.unit_id}`}
                        className="hover:underline font-medium"
                      >
                        {aff.unit_alpha_tag || `Unit ${formatUnitId(aff.unit_id, unitIdHex)}`}
                      </Link>
                      <span className="ml-1.5 font-mono text-xs text-muted-foreground">{formatUnitId(aff.unit_id, unitIdHex)}</span>
                    </td>
                    <td className="py-2 pr-4">
                      <Link
                        to={`/talkgroups/${aff.system_id}:${aff.tgid}`}
                        className="hover:underline"
                      >
                        {aff.tg_alpha_tag || `TG ${aff.tgid}`}
                      </Link>
                      <span className="ml-1.5 font-mono text-xs text-muted-foreground">{aff.tgid}</span>
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {aff.tg_group || '—'}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge
                        variant={aff.status === 'affiliated' ? 'default' : 'secondary'}
                        className={`text-xs ${aff.status === 'affiliated' ? 'bg-success/20 text-success' : ''}`}
                      >
                        {aff.status === 'affiliated' ? 'Active' : 'Off'}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground text-xs">
                      {formatRelativeTime(aff.affiliated_since)}
                    </td>
                    <td className="py-2 text-muted-foreground text-xs">
                      {formatRelativeTime(aff.last_event_time)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination - Bottom */}
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
