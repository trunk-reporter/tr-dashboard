import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Pagination } from '@/components/ui/pagination'
import { CallList } from '@/components/calls/CallList'
import { getCalls, getTalkgroups, getSystems } from '@/api/client'
import type { Call, Talkgroup, System } from '@/api/types'
import { useTranscriptionCache } from '@/stores/useTranscriptionCache'

const DEFAULT_PAGE_SIZE = 25

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
        setSystems(sysRes.sites || [])
        setTalkgroups(tgRes.talkgroups || [])
      })
      .catch(console.error)
  }, [])

  const fetchTranscription = useTranscriptionCache((s) => s.fetchTranscription)

  // Fetch calls
  useEffect(() => {
    setLoading(true)
    getCalls({
      system: systemFilter ? parseInt(systemFilter, 10) : undefined,
      talkgroup: talkgroupFilter ? parseInt(talkgroupFilter, 10) : undefined,
      limit: pageSize,
      offset,
    })
      .then((res) => {
        const loadedCalls = res.calls || []
        setCalls(loadedCalls)
        setTotalCount(res.count)

        // Fetch transcriptions for loaded calls
        // Call type uses tg_sysid:tgid:timestamp format
        for (const call of loadedCalls) {
          if (call.tg_sysid && call.tgid && call.start_time) {
            const timestamp = Math.floor(new Date(call.start_time).getTime() / 1000)
            const callId = `${call.tg_sysid}:${call.tgid}:${timestamp}`
            fetchTranscription(callId)
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
                  <option key={sys.id} value={sys.id}>
                    {sys.short_name}
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
                  <option key={`${tg.sysid}:${tg.tgid}`} value={tg.tgid}>
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
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            Loading...
          </div>
        ) : (
          <CallList calls={calls} emptyMessage="No calls match your filters" />
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
