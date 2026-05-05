import { useEffect, useState, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Pagination } from '@/components/ui/pagination'
import { Input } from '@/components/ui/input'
import { getCallGroups, getSystems } from '@/api/client'
import type { CallGroup, System } from '@/api/types'
import { formatRelativeTime } from '@/lib/utils'

const PAGE_SIZE = 50

export default function CallGroups() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [groups, setGroups] = useState<CallGroup[]>([])
  const [systems, setSystems] = useState<System[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const page = parseInt(searchParams.get('page') || '1', 10)
  const systemFilter = searchParams.get('system_id') || ''
  const searchQuery = searchParams.get('q') || ''
  const offset = (page - 1) * PAGE_SIZE

  useEffect(() => {
    getSystems().then((res) => setSystems(res.systems)).catch(console.error)
  }, [])

  const fetchGroups = useCallback(() => {
    setLoading(true)
    getCallGroups({
      sysid: systemFilter || undefined,
      limit: PAGE_SIZE,
      offset,
    })
      .then((res) => {
        setGroups(res.call_groups)
        setTotalCount(res.total)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [systemFilter, offset])

  useEffect(() => {
    fetchGroups()
  }, [fetchGroups])

  const updateParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams)
      if (value) next.set(key, value)
      else next.delete(key)
      if (key !== 'page') next.set('page', '1')
      setSearchParams(next)
    },
    [searchParams, setSearchParams]
  )

  const goToPage = useCallback(
    (newPage: number) => {
      const next = new URLSearchParams(searchParams)
      next.set('page', String(newPage))
      setSearchParams(next)
    },
    [searchParams, setSearchParams]
  )

  // Client-side keyword filter
  const filteredGroups = searchQuery
    ? groups.filter((g) => {
        const q = searchQuery.toLowerCase()
        return (
          g.tg_alpha_tag?.toLowerCase().includes(q) ||
          g.tg_description?.toLowerCase().includes(q) ||
          g.tg_tag?.toLowerCase().includes(q) ||
          g.tg_group?.toLowerCase().includes(q) ||
          String(g.tgid).includes(q)
        )
      })
    : groups

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Call Groups</h1>
        <p className="text-muted-foreground">
          Grouped duplicate call recordings from multiple sites
          {!loading && <span className="ml-2 text-xs">({totalCount} total)</span>}
        </p>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4">
            <select
              value={systemFilter}
              onChange={(e) => updateParam('system_id', e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">All Systems</option>
              {systems.map((s) => (
                <option key={s.system_id} value={s.sysid}>
                  {s.name || s.sysid || `System ${s.system_id}`}
                </option>
              ))}
            </select>
            <Input
              placeholder="Filter by talkgroup..."
              value={searchQuery}
              onChange={(e) => updateParam('q', e.target.value)}
              className="w-48"
            />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground">
          Loading...
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground">
          No call groups found
        </div>
      ) : (
        <div className="space-y-2">
          {filteredGroups.map((group) => (
            <Link
              key={group.id}
              to={`/call-groups/${group.id}`}
              className="block rounded-lg border border-border/40 bg-card/50 px-4 py-3 hover:bg-card transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">
                      {group.tg_alpha_tag || `TG ${group.tgid}`}
                    </span>
                    {group.tg_group && (
                      <Badge variant="secondary" className="text-[10px]">{group.tg_group}</Badge>
                    )}
                    {group.has_transcription && (
                      <Badge variant="outline" className="text-[10px] text-green-400 border-green-700/40">
                        TX
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {group.system_name && <span>{group.system_name} · </span>}
                    {group.call_count != null && <span>{group.call_count} call{group.call_count !== 1 ? 's' : ''} · </span>}
                    {group.start_time && <span>{formatRelativeTime(group.start_time)}</span>}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground shrink-0">
                  {group.duration ? `${Math.round(group.duration)}s` : ''}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <Pagination
          page={page}
          totalCount={totalCount}
          pageSize={PAGE_SIZE}
          onPageChange={goToPage}
          onPageSizeChange={(size) => updateParam('size', String(size))}
        />
      )}
    </div>
  )
}
