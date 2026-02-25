import { useEffect, useState, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SkeletonRow } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Pagination } from '@/components/ui/pagination'
import { CallList } from '@/components/calls/CallList'
import { getCalls, getTalkgroups, getSystems } from '@/api/client'
import { useRealtimeStore } from '@/stores/useRealtimeStore'
import { useTranscriptionCache } from '@/stores/useTranscriptionCache'
import type { Call, Talkgroup, System } from '@/api/types'

const DEFAULT_PAGE_SIZE = 50

export default function Calls() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [systems, setSystems] = useState<System[]>([])
  const [talkgroups, setTalkgroups] = useState<Talkgroup[]>([])

  const page = parseInt(searchParams.get('page') || '1', 10)
  const pageSize = parseInt(searchParams.get('size') || String(DEFAULT_PAGE_SIZE), 10)
  const systemFilter = searchParams.get('system') || ''
  const talkgroupFilter = searchParams.get('talkgroup') || ''

  const offset = (page - 1) * pageSize

  // Fetch systems and talkgroups for filters
  useEffect(() => {
    Promise.all([getSystems(), getTalkgroups({ limit: 100 })])
      .then(([sysRes, tgRes]) => {
        setSystems(sysRes.systems || [])
        setTalkgroups(tgRes.talkgroups || [])
      })
      .catch(console.error)
  }, [])

  const fetchTranscription = useTranscriptionCache((s) => s.fetchTranscription)

  // Fetch calls
  useEffect(() => {
    setLoading(true)
    getCalls({
      system_id: systemFilter || undefined,
      tgid: talkgroupFilter || undefined,
      sort: '-start_time',
      deduplicate: true,
      limit: pageSize,
      offset,
    })
      .then((res) => {
        const fetched = res.calls || []
        setCalls(fetched)
        setTotalCount(res.total)
        for (const call of fetched) {
          if (call.has_transcription) {
            fetchTranscription(call.call_id)
          }
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [page, pageSize, systemFilter, talkgroupFilter, offset, fetchTranscription])

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const newParams = new URLSearchParams(searchParams)
      if (value) {
        newParams.set(key, value)
      } else {
        newParams.delete(key)
      }
      newParams.set('page', '1')
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

  // On page 1, prepend active (in-progress) calls from the realtime store
  const activeCalls = useRealtimeStore((s) => s.activeCalls)
  const mergedCalls = useMemo(() => {
    if (page !== 1) return calls
    const apiCallIds = new Set(calls.map((c) => c.call_id))
    const active = Array.from(activeCalls.values())
      .filter((c) => !apiCallIds.has(c.call_id))
      .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
    return [...active, ...calls]
  }, [page, calls, activeCalls])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Call History</h1>
        <p className="text-muted-foreground">Browse recorded calls</p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="w-48">
              <label className="mb-1 block text-sm text-muted-foreground">System</label>
              <select
                value={systemFilter}
                onChange={(e) => updateFilter('system', e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">All systems</option>
                {systems.map((sys) => (
                  <option key={sys.system_id} value={sys.system_id}>
                    {sys.name || `System ${sys.system_id}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-64">
              <label className="mb-1 block text-sm text-muted-foreground">Talkgroup</label>
              <select
                value={talkgroupFilter}
                onChange={(e) => updateFilter('talkgroup', e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">All talkgroups</option>
                {talkgroups.map((tg) => (
                  <option key={`${tg.system_id}:${tg.tgid}`} value={tg.tgid}>
                    {tg.alpha_tag || `TG ${tg.tgid}`}
                  </option>
                ))}
              </select>
            </div>

            {(systemFilter || talkgroupFilter) && (
              <div className="flex items-end">
                <Button
                  variant="ghost"
                  onClick={() => {
                    const newParams = new URLSearchParams()
                    newParams.set('page', '1')
                    setSearchParams(newParams)
                  }}
                >
                  Clear filters
                </Button>
              </div>
            )}
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
      />

      {/* Results */}
      <div>
        {loading ? (
          <div className="space-y-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : (
          <CallList calls={mergedCalls} emptyMessage="No calls match your filters" />
        )}
      </div>

      {/* Pagination - Bottom */}
      <Pagination
        page={page}
        totalCount={totalCount}
        pageSize={pageSize}
        onPageChange={goToPage}
        onPageSizeChange={changePageSize}
      />
    </div>
  )
}
