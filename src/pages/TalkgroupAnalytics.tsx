import { useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { getTalkgroup, getTalkgroupCalls, getTalkgroupUnits, getUnitCalls, getUnitAffiliations, searchTranscriptions } from '@/api/client'
import type { Talkgroup, Call, Unit, Affiliation, TranscriptionSearchHit } from '@/api/types'
import { formatRelativeTime, formatDuration } from '@/lib/utils'

// ─── Keyword extraction ─────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her',
  'was', 'one', 'our', 'out', 'has', 'have', 'been', 'from', 'with', 'they',
  'that', 'this', 'will', 'would', 'there', 'their', 'what', 'about', 'which',
  'when', 'make', 'like', 'time', 'just', 'know', 'take', 'come', 'could',
  'than', 'look', 'only', 'into', 'over', 'such', 'also', 'back', 'after',
  'yeah', 'okay', 'going', 'gonna', 'copy', 'thank', 'thanks', 'right',
  'we\'re', 'i\'m', 'it\'s', 'don\'t', 'that\'s', 'let', 'get', 'got',
  'them', 'then', 'were', 'here', 'well', 'your', 'some', 'more',
])

function extractKeywords(texts: string[]): { word: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const text of texts) {
    const words = text.toLowerCase().replace(/[^a-z0-9\s'-]/g, '').split(/\s+/)
    for (const word of words) {
      if (word.length < 3 || STOP_WORDS.has(word)) continue
      counts.set(word, (counts.get(word) || 0) + 1)
    }
  }
  return Array.from(counts.entries())
    .map(([word, count]) => ({ word, count }))
    .filter((kw) => kw.count >= 2) // require at least 2 occurrences
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
}

// ─── Timeline bucketing ─────────────────────────────────────────────────────

function bucketCallsByHour(calls: Call[], hours: number): number[] {
  const now = Date.now()
  const buckets = new Array(hours).fill(0)
  for (const call of calls) {
    const hoursAgo = (now - new Date(call.start_time).getTime()) / 3_600_000
    if (hoursAgo >= 0 && hoursAgo < hours) {
      buckets[hours - 1 - Math.floor(hoursAgo)]++
    }
  }
  return buckets
}

function hourLabels(hours: number): string[] {
  const now = new Date()
  const labels: string[] = []
  for (let i = hours - 1; i >= 0; i--) {
    const h = new Date(now.getTime() - i * 3_600_000).getHours()
    labels.push(h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`)
  }
  return labels
}

function bucketCallsByDay(calls: Call[], days: number): { buckets: number[]; labels: string[] } {
  const now = Date.now()
  const buckets = new Array(days).fill(0)
  const labels: string[] = []
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86_400_000)
    labels.push(i === 0 ? 'Today' : `${months[d.getMonth()]} ${d.getDate()}`)
  }
  for (const call of calls) {
    const daysAgo = (now - new Date(call.start_time).getTime()) / 86_400_000
    if (daysAgo >= 0 && daysAgo < days) {
      buckets[days - 1 - Math.floor(daysAgo)]++
    }
  }
  return { buckets, labels }
}

// Paginate all calls for the talkgroup — fetches everything available
async function fetchAllCalls(id: string): Promise<Call[]> {
  const pageSize = 1000
  const all: Call[] = []
  let offset = 0
  for (;;) {
    const res = await getTalkgroupCalls(id, { limit: pageSize, offset })
    const batch = res.calls || []
    all.push(...batch)
    if (batch.length < pageSize || all.length >= res.total) break
    offset += pageSize
  }
  return all
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface UnitCrossRef {
  unit_id: number
  alpha_tag: string
  system_id: number
  callCount: number
  otherTGs: { tgid: number; alpha_tag: string; count: number }[]
}

// ─── Bar chart component ────────────────────────────────────────────────────

function HBar({ label, value, max, href, color = 'bg-primary/50' }: {
  label: string
  value: number
  max: number
  href?: string
  color?: string
}) {
  const inner = (
    <div className="flex items-center gap-2">
      <span className="text-xs truncate w-28 shrink-0">{label}</span>
      <div className="flex-1 h-3 bg-muted rounded-sm overflow-hidden">
        <div className={`h-full ${color} rounded-sm`} style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="text-[11px] text-muted-foreground tabular-nums w-8 text-right shrink-0">{value}</span>
    </div>
  )
  if (href) return <Link to={href} className="block hover:bg-accent/30 rounded -mx-1 px-1">{inner}</Link>
  return inner
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function TalkgroupAnalytics() {
  const { id } = useParams<{ id: string }>()
  const [talkgroup, setTalkgroup] = useState<Talkgroup | null>(null)
  const [calls, setCalls] = useState<Call[]>([])
  const [tgUnits, setTgUnits] = useState<Unit[]>([])
  const [affiliations, setAffiliations] = useState<Affiliation[]>([])
  const [transcriptionHits, setTranscriptionHits] = useState<TranscriptionSearchHit[]>([])
  const [crossRefs, setCrossRefs] = useState<UnitCrossRef[]>([])
  const [loading, setLoading] = useState(true)
  const [crossRefLoading, setCrossRefLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Phase 1: Load talkgroup, calls, affiliations, transcriptions
  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)

    const parts = id.split(':')
    const tgidStr = parts.length > 1 ? parts[1] : parts[0]

    // Fetch a broad transcription sample — search for common radio words
    const transcriptionFetch = searchTranscriptions('*', { tgid: tgidStr, limit: 100 })
      .catch(() =>
        // Fallback: try a common word if wildcard isn't supported
        searchTranscriptions('control', { tgid: tgidStr, limit: 100 })
          .catch(() => ({ results: [] as TranscriptionSearchHit[], total: 0, limit: 100, offset: 0 }))
      )

    Promise.all([
      getTalkgroup(id),
      fetchAllCalls(id),
      getTalkgroupUnits(id, { limit: 100 }),
      getUnitAffiliations({ tgid: tgidStr, status: 'affiliated', limit: 200 }).catch(() => ({ affiliations: [] as Affiliation[], total: 0, limit: 200, offset: 0, summary: { talkgroup_counts: {} } })),
      transcriptionFetch,
    ])
      .then(([tgRes, allCalls, unitsRes, affRes, txRes]) => {
        setTalkgroup(tgRes)
        setCalls(allCalls)
        setTgUnits(unitsRes.units || [])
        setAffiliations(affRes.affiliations || [])
        setTranscriptionHits(txRes.results || [])
      })
      .catch((err) => {
        console.error(err)
        setError('Failed to load talkgroup analytics')
      })
      .finally(() => setLoading(false))
  }, [id])

  // Phase 2: Cross-reference top units with their other TGs
  useEffect(() => {
    if (!talkgroup || tgUnits.length === 0) return

    const topUnits = tgUnits.filter((u) => u.unit_id > 0).slice(0, 8)
    if (topUnits.length === 0) return

    setCrossRefLoading(true)
    Promise.all(
      topUnits.map((u) =>
        getUnitCalls(`${talkgroup.system_id}:${u.unit_id}`, { limit: 1000 })
          .then((res) => ({ unit_id: u.unit_id, alpha_tag: u.alpha_tag || '', system_id: talkgroup.system_id, calls: res.calls || [], total: res.total }))
          .catch(() => ({ unit_id: u.unit_id, alpha_tag: u.alpha_tag || '', system_id: talkgroup.system_id, calls: [] as Call[], total: 0 }))
      )
    ).then((results) => {
      setCrossRefs(
        results.map((r) => {
          const tgCounts = new Map<number, { tgid: number; alpha_tag: string; count: number }>()
          let thisTgSample = 0
          for (const call of r.calls) {
            if (call.tgid === talkgroup.tgid) { thisTgSample++; continue }
            const ex = tgCounts.get(call.tgid)
            if (ex) { ex.count++; if (!ex.alpha_tag && call.tg_alpha_tag) ex.alpha_tag = call.tg_alpha_tag }
            else tgCounts.set(call.tgid, { tgid: call.tgid, alpha_tag: call.tg_alpha_tag || '', count: 1 })
          }
          // Extrapolate count when we hit the fetch limit
          const sampleSize = r.calls.length
          const thisCount = sampleSize > 0 && sampleSize < r.total
            ? Math.round((thisTgSample / sampleSize) * r.total)
            : thisTgSample
          return {
            unit_id: r.unit_id,
            alpha_tag: r.alpha_tag,
            system_id: r.system_id,
            callCount: thisCount,
            otherTGs: Array.from(tgCounts.values()).sort((a, b) => b.count - a.count).slice(0, 8),
          }
        })
      )
      setCrossRefLoading(false)
    })
  }, [talkgroup, tgUnits])

  // ─── Derived data ───────────────────────────────────────────────────────

  // 7-day daily buckets
  const daily = useMemo(() => bucketCallsByDay(calls, 30), [calls])
  const maxDaily = Math.max(...daily.buckets, 1)

  // 24h hourly detail
  const hourlyBuckets = useMemo(() => bucketCallsByHour(calls, 24), [calls])
  const hourlyLabels = useMemo(() => hourLabels(24), [])
  const maxHourly = Math.max(...hourlyBuckets, 1)

  // Keywords from call transcription_text (denormalized) + search hits
  const keywords = useMemo(() => {
    const texts: string[] = []
    for (const c of calls) { if (c.transcription_text) texts.push(c.transcription_text) }
    for (const h of transcriptionHits) { if (h.text) texts.push(h.text) }
    return extractKeywords(texts)
  }, [calls, transcriptionHits])
  const maxKw = keywords.length > 0 ? keywords[0].count : 1

  // Build unit stats from crossRefs (which have real call counts) + tgUnits for names
  const unitStats = useMemo(() => {
    // Build call count lookup from crossRefs (Phase 2 data)
    const crossRefCounts = new Map<number, number>()
    for (const ref of crossRefs) {
      crossRefCounts.set(ref.unit_id, ref.callCount)
    }
    // Merge tgUnits with crossRef counts, filter out invalid unit IDs
    return tgUnits
      .filter((u) => u.unit_id > 0)
      .map((u) => ({
        unit_id: u.unit_id,
        alpha_tag: u.alpha_tag || '',
        count: crossRefCounts.get(u.unit_id) || 0,
      }))
      .sort((a, b) => b.count - a.count || a.alpha_tag.localeCompare(b.alpha_tag))
  }, [tgUnits, crossRefs])
  const maxUnit = unitStats.length > 0 ? Math.max(unitStats[0].count, 1) : 1

  const durationStats = useMemo(() => {
    const durations = calls.filter((c) => c.duration != null).map((c) => c.duration!)
    if (durations.length === 0) return null
    const total = durations.reduce((a, b) => a + b, 0)
    return {
      count: calls.length,
      total,
      avg: Math.round(total / durations.length),
      max: Math.max(...durations),
      emergency: calls.filter((c) => c.emergency).length,
      encrypted: calls.filter((c) => c.encrypted).length,
      transcribed: calls.filter((c) => c.has_transcription || c.transcription_text).length,
    }
  }, [calls])

  // ─── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading analytics...</div>
  }

  if (error || !talkgroup) {
    return (
      <div className="space-y-4">
        <div className="flex h-64 items-center justify-center text-destructive">{error || 'Talkgroup not found'}</div>
        <div className="text-center">
          <Link to="/talkgroups" className="text-primary hover:underline">← Back to talkgroups</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <div className="mb-2">
          <Link to={`/talkgroups/${id}`} className="text-sm text-muted-foreground hover:underline">
            ← {talkgroup.alpha_tag || `TG ${talkgroup.tgid}`}
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{talkgroup.alpha_tag || `TG ${talkgroup.tgid}`}</h1>
          <Badge variant="outline" className="font-mono">TGID {talkgroup.tgid}</Badge>
          {talkgroup.group && <Badge variant="secondary">{talkgroup.group}</Badge>}
          {talkgroup.tag && <Badge variant="secondary">{talkgroup.tag}</Badge>}
          {talkgroup.mode === 'D' && <Badge variant="outline">Digital</Badge>}
          {talkgroup.mode === 'E' && <Badge variant="destructive">Encrypted</Badge>}
          <span className="text-sm text-muted-foreground ml-1">Analytics</span>
        </div>
        {talkgroup.description && (
          <p className="text-sm text-muted-foreground mt-1">{talkgroup.description}</p>
        )}
      </div>

      {/* Summary stats */}
      {durationStats && (
        <div className="rounded-lg border px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <div><span className="text-muted-foreground">Calls </span><span className="font-bold tabular-nums">{durationStats.count}</span></div>
            <div><span className="text-muted-foreground">Total </span><span className="font-bold tabular-nums">{formatDuration(durationStats.total)}</span></div>
            <div><span className="text-muted-foreground">Avg </span><span className="font-bold tabular-nums">{formatDuration(durationStats.avg)}</span></div>
            <div><span className="text-muted-foreground">Longest </span><span className="font-bold tabular-nums">{formatDuration(durationStats.max)}</span></div>
            <div><span className="text-muted-foreground">Units </span><span className="font-bold tabular-nums">{unitStats.length}</span></div>
            {durationStats.emergency > 0 && (
              <div className="text-destructive"><span className="font-bold tabular-nums">{durationStats.emergency}</span> emerg</div>
            )}
            {durationStats.encrypted > 0 && (
              <div><span className="font-bold tabular-nums">{durationStats.encrypted}</span><span className="text-muted-foreground"> enc</span></div>
            )}
            <div><span className="font-bold tabular-nums">{durationStats.transcribed}</span><span className="text-muted-foreground"> transcribed</span></div>
          </div>
        </div>
      )}

      {/* Activity Timeline — 7-day + 24h detail */}
      <div className="rounded-lg border px-4 py-3 space-y-3">
        {/* 7-day daily view */}
        <div>
          <h2 className="text-sm font-semibold mb-2">Call Activity (30 days) <span className="text-xs text-muted-foreground font-normal">{calls.length.toLocaleString()} calls loaded</span></h2>
          <div className="flex items-end gap-1 h-16">
            {daily.buckets.map((count, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-sm cursor-default"
                style={{
                  height: count > 0 ? `${Math.max((count / maxDaily) * 100, 6)}%` : '2px',
                  backgroundColor: count > 0 ? 'var(--color-primary)' : 'var(--color-muted)',
                  opacity: count > 0 ? 0.7 : 0.2,
                }}
                title={`${daily.labels[i]}: ${count} calls`}
              />
            ))}
          </div>
          <div className="flex mt-1">
            {daily.labels.map((l, i) => (
              <span key={i} className="flex-1 text-center text-[9px] text-muted-foreground/50 tabular-nums">
                {i % 7 === 0 || i === daily.labels.length - 1 ? l : ''}
              </span>
            ))}
          </div>
        </div>

        {/* 24h hourly detail */}
        <div>
          <h2 className="text-xs font-medium text-muted-foreground mb-2">Last 24 hours (hourly)</h2>
          <div className="flex items-end gap-[2px] h-14">
            {hourlyBuckets.map((count, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-sm cursor-default"
                style={{
                  height: count > 0 ? `${Math.max((count / maxHourly) * 100, 4)}%` : '2px',
                  backgroundColor: count > 0 ? 'var(--color-primary)' : 'var(--color-muted)',
                  opacity: count > 0 ? 0.5 : 0.15,
                }}
                title={`${hourlyLabels[i]}: ${count} calls`}
              />
            ))}
          </div>
          <div className="flex mt-1">
            {hourlyLabels.map((l, i) => (
              <span key={i} className="flex-1 text-center text-[9px] text-muted-foreground/50 tabular-nums">
                {i % 4 === 0 ? l : ''}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Two-column: Units + Keywords */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Top Units bar chart */}
        <div className="rounded-lg border px-4 py-3">
          <h2 className="text-sm font-semibold mb-3">Top Units <span className="text-xs text-muted-foreground font-normal">({unitStats.length} total)</span></h2>
          <div className="space-y-1">
            {unitStats.slice(0, 15).map((u) => (
              <HBar
                key={u.unit_id}
                label={u.alpha_tag || `Unit ${u.unit_id}`}
                value={u.count}
                max={maxUnit}
                href={`/units/${talkgroup.system_id}:${u.unit_id}`}
              />
            ))}
            {unitStats.length > 15 && (
              <p className="text-[11px] text-muted-foreground mt-2">+{unitStats.length - 15} more units</p>
            )}
          </div>
        </div>

        {/* Transcription Keywords */}
        <div className="rounded-lg border px-4 py-3">
          <h2 className="text-sm font-semibold mb-3">
            Top Keywords
            {durationStats && durationStats.transcribed > 0 && (
              <span className="text-xs text-muted-foreground font-normal ml-2">
                from {durationStats.transcribed} transcriptions
              </span>
            )}
          </h2>
          {keywords.length === 0 ? (
            <p className="text-xs text-muted-foreground">No transcription data available for keyword analysis</p>
          ) : (
            <div className="space-y-1">
              {keywords.map((kw) => (
                <HBar
                  key={kw.word}
                  label={kw.word}
                  value={kw.count}
                  max={maxKw}
                  href={`/transcriptions?q=${encodeURIComponent(kw.word)}&tgid=${talkgroup.tgid}`}
                  color="bg-amber-500/50"
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Unit Cross-Reference */}
      <div className="rounded-lg border px-4 py-3">
        <h2 className="text-sm font-semibold mb-3">
          Unit Cross-Reference
          <span className="text-xs text-muted-foreground font-normal ml-2">other talkgroups these units appear on</span>
        </h2>
        {crossRefLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-6 bg-muted/50 rounded animate-pulse" />
            ))}
          </div>
        ) : crossRefs.length === 0 ? (
          <p className="text-xs text-muted-foreground">No cross-reference data</p>
        ) : (
          <div className="space-y-2.5">
            {crossRefs.map((ref) => (
              <div key={ref.unit_id}>
                <div className="flex items-center gap-2 mb-1">
                  <Link
                    to={`/units/${ref.system_id}:${ref.unit_id}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {ref.alpha_tag || `Unit ${ref.unit_id}`}
                  </Link>
                  <span className="text-[11px] font-mono text-muted-foreground/50">{ref.unit_id}</span>
                  <span className="text-[11px] text-muted-foreground">{ref.callCount} calls here</span>
                </div>
                {ref.otherTGs.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground/60 ml-2">Only seen on this talkgroup</p>
                ) : (
                  <div className="flex flex-wrap gap-1 ml-2">
                    {ref.otherTGs.map((tg) => (
                      <Link
                        key={tg.tgid}
                        to={`/talkgroups/${ref.system_id}:${tg.tgid}`}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] hover:bg-accent transition-colors"
                      >
                        {tg.alpha_tag || `TG ${tg.tgid}`}
                        <span className="text-muted-foreground/60">({tg.count})</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Currently Affiliated Units */}
      {affiliations.length > 0 && (
        <div className="rounded-lg border px-4 py-3">
          <h2 className="text-sm font-semibold mb-3">
            Currently Affiliated
            <span className="text-xs text-muted-foreground font-normal ml-2">{affiliations.length} units</span>
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {affiliations.map((aff) => (
              <Link
                key={`${aff.system_id}:${aff.unit_id}`}
                to={`/units/${aff.system_id}:${aff.unit_id}`}
              >
                <Badge variant="outline" className="text-xs hover:bg-accent cursor-pointer">
                  {aff.unit_alpha_tag || aff.unit_id}
                  <span className="ml-1 text-muted-foreground/50">{formatRelativeTime(aff.affiliated_since)}</span>
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recent Transcription Samples */}
      {transcriptionHits.length > 0 && (
        <div className="rounded-lg border px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">
              Recent Transcriptions
              <span className="text-xs text-muted-foreground font-normal ml-2">sample</span>
            </h2>
            <Link
              to={`/transcriptions?tgid=${talkgroup.tgid}`}
              className="text-xs text-primary hover:underline"
            >
              Search all →
            </Link>
          </div>
          <div className="space-y-1.5">
            {transcriptionHits.slice(0, 10).map((hit) => (
              <div key={hit.id} className="flex items-start gap-2 text-xs">
                <Link
                  to={`/calls/${hit.call_id}`}
                  className="shrink-0 text-muted-foreground hover:underline tabular-nums"
                >
                  #{hit.call_id}
                </Link>
                <p className="text-muted-foreground italic line-clamp-1 min-w-0">
                  {hit.text.length > 150 ? hit.text.slice(0, 150).trim() + '...' : hit.text}
                </p>
                {hit.call_start_time && (
                  <span className="shrink-0 text-muted-foreground/50 tabular-nums">
                    {formatRelativeTime(hit.call_start_time)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
