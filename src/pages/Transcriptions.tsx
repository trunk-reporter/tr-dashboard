import { useEffect, useState, useCallback, useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Pagination } from '@/components/ui/pagination'
import { SkeletonRow } from '@/components/ui/skeleton'
import { searchTranscriptions, getCall, getSystems } from '@/api/client'
import { useAudioStore } from '@/stores/useAudioStore'
import type { TranscriptionSearchHit, System } from '@/api/types'
import { formatRelativeTime, formatDuration } from '@/lib/utils'

const DEFAULT_PAGE_SIZE = 25

// Time range presets: label, hours (0 = all time)
const TIME_PRESETS = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
  { label: 'All', hours: 0 },
] as const

function highlightTerms(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text
  const terms = query.trim().split(/\s+/).filter(Boolean)
  const pattern = new RegExp(`(${terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  const parts = text.split(pattern)
  return parts.map((part, i) =>
    pattern.test(part)
      ? <mark key={i} className="bg-primary/20 text-primary font-semibold rounded-sm px-0.5">{part}</mark>
      : part
  )
}

export default function Transcriptions() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [results, setResults] = useState<TranscriptionSearchHit[]>([])
  const [systems, setSystems] = useState<System[]>([])
  const [loading, setLoading] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [hasSearched, setHasSearched] = useState(false)
  const [loadingCallId, setLoadingCallId] = useState<number | null>(null)

  // Local search input (not committed to URL until submit)
  const [searchInput, setSearchInput] = useState(searchParams.get('q') || '')

  const loadCall = useAudioStore((s) => s.loadCall)

  const query = searchParams.get('q') || ''
  const page = parseInt(searchParams.get('page') || '1', 10)
  const pageSize = parseInt(searchParams.get('size') || String(DEFAULT_PAGE_SIZE), 10)
  const systemFilter = searchParams.get('system_id') || ''
  const tgidFilter = searchParams.get('tgid') || ''
  const timeRange = searchParams.get('hours') || '0'
  const sortBy = searchParams.get('sort') || 'relevance'

  const offset = (page - 1) * pageSize

  // Compute start_time from hours preset
  const startTime = useMemo(() => {
    const hours = parseInt(timeRange, 10)
    if (!hours) return undefined
    const d = new Date()
    d.setHours(d.getHours() - hours)
    return d.toISOString()
  }, [timeRange])

  // Fetch systems for filter dropdown
  useEffect(() => {
    getSystems().then((res) => setSystems(res.systems)).catch(console.error)
  }, [])

  // Fetch results when URL params change (and query is non-empty)
  useEffect(() => {
    if (!query) {
      setResults([])
      setTotalCount(0)
      return
    }
    setLoading(true)
    setHasSearched(true)
    searchTranscriptions(query, {
      system_id: systemFilter || undefined,
      tgid: tgidFilter || undefined,
      start_time: startTime,
      limit: pageSize,
      offset,
    })
      .then((res) => {
        setResults(res.results || [])
        setTotalCount(res.total)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [query, systemFilter, tgidFilter, startTime, pageSize, offset])

  const submitSearch = useCallback(() => {
    const newParams = new URLSearchParams(searchParams)
    if (searchInput.trim()) {
      newParams.set('q', searchInput.trim())
    } else {
      newParams.delete('q')
    }
    newParams.set('page', '1')
    setSearchParams(newParams)
  }, [searchInput, searchParams, setSearchParams])

  const updateParam = useCallback(
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

  const handlePlay = useCallback(async (callId: number) => {
    setLoadingCallId(callId)
    try {
      const call = await getCall(callId)
      loadCall(call)
    } catch (e) {
      console.error('Failed to load call for playback:', e)
    } finally {
      setLoadingCallId(null)
    }
  }, [loadCall])

  const sortedResults = useMemo(() => {
    if (sortBy === 'relevance') return results
    const sorted = [...results]
    if (sortBy === 'recent') {
      sorted.sort((a, b) => {
        const ta = a.call_start_time ? new Date(a.call_start_time).getTime() : 0
        const tb = b.call_start_time ? new Date(b.call_start_time).getTime() : 0
        return tb - ta
      })
    } else if (sortBy === 'longest') {
      sorted.sort((a, b) => (b.call_duration ?? 0) - (a.call_duration ?? 0))
    }
    return sorted
  }, [results, sortBy])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Transcriptions</h1>

      {/* Search bar */}
      <div className="flex gap-2">
        <Input
          placeholder="Search transcriptions..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submitSearch()}
          className="flex-1"
        />
        <Button onClick={submitSearch} disabled={!searchInput.trim()}>
          Search
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Time range presets */}
        <div className="flex gap-1">
          {TIME_PRESETS.map((preset) => (
            <Button
              key={preset.label}
              variant={timeRange === String(preset.hours) ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateParam('hours', String(preset.hours))}
            >
              {preset.label}
            </Button>
          ))}
        </div>

        <select
          value={systemFilter}
          onChange={(e) => updateParam('system_id', e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        >
          <option value="">All systems</option>
          {systems.map((sys) => (
            <option key={sys.system_id} value={String(sys.system_id)}>
              {sys.name || `System ${sys.system_id}`}
            </option>
          ))}
        </select>

        <Input
          placeholder="Talkgroup ID"
          value={tgidFilter}
          onChange={(e) => updateParam('tgid', e.target.value)}
          className="w-32"
        />

        <select
          value={sortBy}
          onChange={(e) => updateParam('sort', e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        >
          <option value="relevance">Best Match</option>
          <option value="recent">Most Recent</option>
          <option value="longest">Longest</option>
        </select>

        {hasSearched && (
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {totalCount.toLocaleString()} results
          </span>
        )}
      </div>

      {/* Results */}
      <div>
        {!hasSearched && !query ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-40">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <span>Search across all transcriptions</span>
            <span className="text-xs">Enter a word or phrase to find matching radio calls</span>
          </div>
        ) : loading ? (
          <div className="space-y-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : sortedResults.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-40">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <span>No transcriptions match your search</span>
            <span className="text-xs">Try different keywords or broaden your filters</span>
          </div>
        ) : (
          <div className="space-y-1">
            {sortedResults.map((hit, i) => (
              <div
                key={hit.id}
                className="flex items-center gap-3 rounded-lg border px-3 py-2 card-call-hover card-fade-in"
                style={{ '--i': i } as React.CSSProperties}
              >
                {/* Play button */}
                <button
                  onClick={() => handlePlay(hit.call_id)}
                  disabled={loadingCallId === hit.call_id}
                  className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                  title="Play call audio"
                >
                  {loadingCallId === hit.call_id ? (
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.49-8.49l2.83-2.83M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.49 8.49l2.83 2.83" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>

                {/* Left: talkgroup + system/call context */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {hit.tg_alpha_tag ? (
                      <Link
                        to={`/talkgroups/${hit.system_id}:${hit.tgid}`}
                        className="font-medium text-sm truncate hover:underline"
                      >
                        {hit.tg_alpha_tag}
                      </Link>
                    ) : hit.tgid ? (
                      <Link
                        to={`/talkgroups/${hit.system_id}:${hit.tgid}`}
                        className="font-medium text-sm font-mono truncate hover:underline"
                      >
                        TG {hit.tgid}
                      </Link>
                    ) : (
                      <span className="font-medium text-sm text-muted-foreground">Unknown TG</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {hit.system_name && <span>{hit.system_name}</span>}
                    {hit.system_name && <span className="text-muted-foreground/40">&middot;</span>}
                    <Link
                      to={`/calls/${hit.call_id}`}
                      className="hover:underline"
                    >
                      Call #{hit.call_id}
                    </Link>
                  </div>
                </div>

                {/* Center: transcription text with highlights */}
                <div className="hidden md:block flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground italic truncate">
                    {highlightTerms(
                      hit.text.length > 120 ? hit.text.slice(0, 120).trim() + '...' : hit.text,
                      query
                    )}
                  </p>
                </div>

                {/* Right: time + duration */}
                <div className="shrink-0 text-right">
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {hit.call_start_time ? formatRelativeTime(hit.call_start_time) : '—'}
                  </div>
                  {hit.call_duration != null && (
                    <div className="text-xs text-muted-foreground/60 tabular-nums">
                      {formatDuration(hit.call_duration)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {hasSearched && results.length > 0 && (
        <Pagination
          page={page}
          totalCount={totalCount}
          pageSize={pageSize}
          onPageChange={goToPage}
          onPageSizeChange={changePageSize}
          pageSizeOptions={[25, 50, 100]}
        />
      )}
    </div>
  )
}
