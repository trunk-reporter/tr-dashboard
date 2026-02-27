import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Pagination } from '@/components/ui/pagination'
import { getTalkgroupDirectory, getSystems } from '@/api/client'
import type { TalkgroupDirectoryEntry, System } from '@/api/types'

const DEFAULT_PAGE_SIZE = 50

export default function TalkgroupDirectory() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [entries, setEntries] = useState<TalkgroupDirectoryEntry[]>([])
  const [systems, setSystems] = useState<System[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [availableCategories, setAvailableCategories] = useState<string[]>([])

  const page = parseInt(searchParams.get('page') || '1', 10)
  const pageSize = parseInt(searchParams.get('size') || String(DEFAULT_PAGE_SIZE), 10)
  const search = searchParams.get('search') || ''
  const systemFilter = searchParams.get('system_id') || ''
  const categoryFilter = searchParams.get('category') || ''
  const modeFilter = searchParams.get('mode') || ''

  const offset = (page - 1) * pageSize

  // Debounce search
  const [searchInput, setSearchInput] = useState(search)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const categoriesExtractedRef = useRef(false)

  useEffect(() => {
    setSearchInput(search)
  }, [search])

  // Clean up debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const handleSearchChange = (value: string) => {
    setSearchInput(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      updateParam('search', value)
    }, 300)
  }

  // Fetch systems for filter
  useEffect(() => {
    getSystems().then((res) => setSystems(res.systems)).catch(console.error)
  }, [])

  // Fetch directory entries
  useEffect(() => {
    setLoading(true)
    getTalkgroupDirectory({
      system_id: systemFilter ? parseInt(systemFilter, 10) : undefined,
      search: search || undefined,
      category: categoryFilter || undefined,
      mode: modeFilter || undefined,
      limit: pageSize,
      offset,
    })
      .then((res) => {
        setEntries(res.talkgroups || [])
        setTotalCount(res.total)

        // Extract unique categories from first response only
        if (!categoriesExtractedRef.current && res.talkgroups) {
          categoriesExtractedRef.current = true
          const cats = new Set<string>()
          for (const tg of res.talkgroups) {
            if (tg.category) cats.add(tg.category)
          }
          if (cats.size > 0) {
            setAvailableCategories(Array.from(cats).sort())
          }
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, search, systemFilter, categoryFilter, modeFilter, offset])

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

  const MODE_LABELS: Record<string, string> = {
    D: 'Digital',
    A: 'Analog',
    E: 'Encrypted',
    M: 'Mixed',
    T: 'TDMA',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Talkgroup Directory</h1>
        <p className="text-muted-foreground">
          Reference directory of all known talkgroups
          {!loading && <span className="ml-2 text-xs">({totalCount} total)</span>}
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="Search talkgroups..."
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
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

            {availableCategories.length > 0 && (
              <select
                value={categoryFilter}
                onChange={(e) => updateParam('category', e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">All categories</option>
                {availableCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            )}

            <select
              value={modeFilter}
              onChange={(e) => updateParam('mode', e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">All modes</option>
              {Object.entries(MODE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
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
        pageSizeOptions={[50, 100, 200]}
      />

      {/* Results */}
      <div>
        {loading ? (
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            Loading...
          </div>
        ) : entries.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            No talkgroups found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-4">TGID</th>
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2 pr-4">Mode</th>
                  <th className="pb-2 pr-4">Description</th>
                  <th className="pb-2 pr-4">Tag</th>
                  <th className="pb-2 pr-4">Category</th>
                  <th className="pb-2">System</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, i) => (
                  <tr
                    key={`${entry.system_id}:${entry.tgid}:${i}`}
                    className="border-b border-border/50 hover:bg-accent/50 transition-colors"
                  >
                    <td className="py-2 pr-4 font-mono text-xs">
                      {entry.system_id && entry.tgid ? (
                        <Link
                          to={`/talkgroups/${entry.system_id}:${entry.tgid}`}
                          className="hover:underline text-primary"
                        >
                          {entry.tgid}
                        </Link>
                      ) : (
                        entry.tgid ?? '—'
                      )}
                    </td>
                    <td className="py-2 pr-4 font-medium">
                      {entry.alpha_tag || '—'}
                    </td>
                    <td className="py-2 pr-4">
                      {entry.mode ? (
                        <Badge
                          variant={entry.mode === 'E' ? 'destructive' : 'outline'}
                          className="text-xs"
                        >
                          {MODE_LABELS[entry.mode] || entry.mode}
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground max-w-xs truncate">
                      {entry.description || '—'}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground text-xs">
                      {entry.tag || '—'}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground text-xs">
                      {entry.category || '—'}
                    </td>
                    <td className="py-2 text-muted-foreground text-xs">
                      {entry.system_name || (entry.system_id ? `System ${entry.system_id}` : '—')}
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
