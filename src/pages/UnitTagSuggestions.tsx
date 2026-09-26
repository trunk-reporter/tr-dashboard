import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Banner } from '@/components/ui/banner'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorPanel } from '@/components/ui/error-panel'
import { Pagination } from '@/components/ui/pagination'
import { SkeletonCard } from '@/components/ui/skeleton'
import { API_BASE, ApiError, getCall, describeError, isUnavailable, type UnitTagSuggestionQueryParams } from '@/api/client'
import { useApiMutation, useApiQuery } from '@/api/query'
import { queryKeys, systemService, unitTagSuggestionService } from '@/api/services'
import type {
  ErrorResponse,
  UnitTagEvidence,
  UnitTagScannerStatus,
  UnitTagSuggestion,
  UnitTagSuggestionStatus,
} from '@/api/types'
import { useAudioStore, selectIsPlaying } from '@/stores/useAudioStore'
import { useCanEdit, useRestricted } from '@/stores/useAuthStore'
import { RestrictedNotice } from '@/components/ui/restricted-notice'
import { useFilterStore } from '@/stores/useFilterStore'
import { useToastStore, type ToastVariant } from '@/stores/useToastStore'
import { cn, formatDateTime, formatRelativeTime, formatUnitId, getTalkgroupDisplayName } from '@/lib/utils'

const DEFAULT_PAGE_SIZE = 25
const EVIDENCE_PREVIEW_COUNT = 3
// Start playback slightly before the unit's transmission so the first word isn't clipped
const EVIDENCE_PREROLL_S = 0.3
// The scanner normally trails by its settle delay + poll interval; only call out a real backfill
const BACKFILL_NOTICE_THRESHOLD = 500

const STATUS_TABS: { value: UnitTagSuggestionStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'dismissed', label: 'Dismissed' },
]

const PATTERN_LABELS: Record<UnitTagEvidence['pattern'], { label: string; hint: string }> = {
  addressee_caller: { label: 'calling', hint: 'Unit called someone and gave its ID ("County, Medic 12 …")' },
  unit_caller: { label: 'unit to unit', hint: 'Unit called another unit ("Engine 5, Medic 12")' },
  caller_to: { label: 'caller to', hint: 'Unit gave its ID first ("Medic 12 to County")' },
  from_caller: { label: 'from', hint: 'Unit called "X from <ID>" ("Command from Engine 5")' },
  this_is: { label: 'this is', hint: 'Unit said "this is <ID>"' },
  status: { label: 'status', hint: 'Unit reported a status with its ID ("Engine 5 on scene")' },
  bare: { label: 'ID only', hint: 'The transmission was only the ID. This is ambiguous: a dispatcher calling the unit sounds the same.' },
}

const TAG_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
    <path d="M7 7h.01" />
  </svg>
)

type PendingAction = 'approve' | 'dismiss'

interface UnitGroup {
  key: string
  systemId: number
  systemName?: string
  unitId: number
  unitAlphaTag: string
  unitAlphaTagSource?: string
  suggestions: UnitTagSuggestion[]
}

// Pending results arrive grouped by unit; decided results are ordered by decision
// time, so only adjacent rows for the same unit are folded together. A unit that
// shows up in several runs gets a numbered key so each card keeps a stable identity.
function groupByUnit(suggestions: UnitTagSuggestion[]): UnitGroup[] {
  const groups: UnitGroup[] = []
  const runs = new Map<string, number>()
  for (const s of suggestions) {
    const unitKey = `${s.system_id}:${s.unit_id}`
    const last = groups[groups.length - 1]
    if (last && last.systemId === s.system_id && last.unitId === s.unit_id) {
      last.suggestions.push(s)
    } else {
      const run = runs.get(unitKey) ?? 0
      runs.set(unitKey, run + 1)
      groups.push({
        key: `${unitKey}#${run}`,
        systemId: s.system_id,
        systemName: s.system_name,
        unitId: s.unit_id,
        unitAlphaTag: s.unit_alpha_tag,
        unitAlphaTagSource: s.unit_alpha_tag_source,
        suggestions: [s],
      })
    }
  }
  return groups
}

function parseStatus(value: string | null): UnitTagSuggestionStatus {
  return STATUS_TABS.some((t) => t.value === value) ? (value as UnitTagSuggestionStatus) : 'pending'
}

function describeActionError(err: unknown, action: PendingAction): { message: string; variant: ToastVariant; refetch: boolean } {
  if (err instanceof ApiError) {
    const data = err.data as Partial<ErrorResponse> | undefined
    if (err.status === 401 || err.status === 403) {
      return { message: describeError(err, "Your key can't do this (needs edit)."), variant: 'error', refetch: false }
    }
    if (err.status === 409) {
      const status = data?.detail?.replace(/^status:\s*/, '')
      return { message: `This suggestion was already ${status || 'decided'}. The list has been refreshed.`, variant: 'warning', refetch: true }
    }
    if (err.status === 404) {
      const what = data?.error === 'unit not found' ? 'unit' : 'suggestion'
      return { message: `That ${what} no longer exists. The list has been refreshed.`, variant: 'warning', refetch: true }
    }
    if (err.status === 400 && data?.error) {
      return { message: `Couldn't ${action}: ${data.error}`, variant: 'error', refetch: false }
    }
  }
  return { message: `Failed to ${action} the suggestion.`, variant: 'error', refetch: false }
}

export default function UnitTagSuggestions() {
  const [searchParams, setSearchParams] = useSearchParams()
  const status = parseStatus(searchParams.get('status'))
  const systemFilter = searchParams.get('system') || ''
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
  // The API accepts limit 1–1000; clamp hand-edited URLs instead of surfacing a 400
  const pageSize = Math.min(1000, Math.max(1, parseInt(searchParams.get('size') || String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE))
  const offset = (page - 1) * pageSize

  const unitIdHex = useFilterStore((s) => s.unitIdHex)
  // Approve/dismiss need a key with the edit scope
  const canWrite = useCanEdit()
  // The suggestions endpoints deny restricted credentials
  const restricted = useRestricted()
  const showToast = useToastStore((s) => s.show)

  const loadCall = useAudioStore((s) => s.loadCall)
  const requestPause = useAudioStore((s) => s.requestPause)
  const currentCallId = useAudioStore((s) => s.currentCall?.callId ?? null)
  const isPlaying = useAudioStore(selectIsPlaying)
  const [loadingCallId, setLoadingCallId] = useState<number | null>(null)

  // Rows decided in this session are hidden from stale pending data until the refetch lands
  const [decided, setDecided] = useState<Set<number>>(() => new Set())
  const [busy, setBusy] = useState<Map<number, PendingAction>>(() => new Map())

  const systemsQuery = useApiQuery(
    queryKeys.systems.list(),
    systemService.list,
    { staleTime: 5 * 60 * 1000 }
  )
  const listParams = useMemo<UnitTagSuggestionQueryParams>(() => ({
    status,
    system_id: systemFilter || undefined,
    limit: pageSize,
    offset,
  }), [status, systemFilter, pageSize, offset])
  // Engines before v0.10 have no suggestions API; once that is known, stop requesting it
  const unavailable = unitTagSuggestionService.isUnavailable()
  const listQuery = useApiQuery(
    queryKeys.unitTagSuggestions.list(listParams),
    () => unitTagSuggestionService.list(listParams),
    { staleTime: 10_000, enabled: !unavailable && !restricted }
  )

  const approveMutation = useApiMutation(unitTagSuggestionService.approve, {
    invalidate: [queryKeys.unitTagSuggestions.all],
  })
  const dismissMutation = useApiMutation(unitTagSuggestionService.dismiss, {
    invalidate: [queryKeys.unitTagSuggestions.all],
  })

  const systems = systemsQuery.data?.systems || []
  // Scanner status is global, so the previous response is still accurate for it
  const listResult = isUnavailable(listQuery.data) ? undefined : listQuery.data
  const scanner = listResult?.scanner
  // Right after a tab/filter/page change the hook still holds the previous key's
  // rows; don't show them (or their count/empty state) as if they were this view's
  const listData = listQuery.isPreviousData ? undefined : listResult
  const allSuggestions = listData?.suggestions
  const suggestions = useMemo(
    () => (allSuggestions ?? []).filter((s) => !(s.status === 'pending' && decided.has(s.id))),
    [allSuggestions, decided]
  )
  const totalCount = Math.max(0, (listData?.total ?? 0) - ((allSuggestions?.length ?? 0) - suggestions.length))
  const groups = useMemo(() => groupByUnit(suggestions), [suggestions])

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const next = new URLSearchParams(searchParams)
      for (const [key, value] of Object.entries(updates)) {
        if (value) next.set(key, value)
        else next.delete(key)
      }
      if (!('page' in updates)) next.set('page', '1')
      setSearchParams(next)
    },
    [searchParams, setSearchParams]
  )

  // Approving or dismissing the last rows of a page can leave it empty; step back to the last real page
  const lastPage = Math.max(1, Math.ceil(totalCount / pageSize))
  useEffect(() => {
    if (!listQuery.isFetching && allSuggestions && allSuggestions.length === 0 && page > lastPage) {
      updateParams({ page: String(lastPage) })
    }
  }, [listQuery.isFetching, allSuggestions, page, lastPage, updateParams])

  const refresh = () => {
    listQuery.refetch().catch(() => { /* surfaced through listQuery.error */ })
  }

  const setRowBusy = (id: number, action: PendingAction | null) => {
    setBusy((prev) => {
      const next = new Map(prev)
      if (action) next.set(id, action)
      else next.delete(id)
      return next
    })
  }

  const runAction = async (s: UnitTagSuggestion, action: PendingAction, alphaTag?: string): Promise<boolean> => {
    setRowBusy(s.id, action)
    try {
      if (action === 'approve') {
        const res = await approveMutation.mutate({ id: s.id, alphaTag })
        const applied = res.suggestion.applied_tag || res.unit.alpha_tag || alphaTag || s.proposed_tag
        showToast(`Unit ${formatUnitId(s.unit_id, unitIdHex)} tagged "${applied}"`, 'success')
      } else {
        await dismissMutation.mutate({ id: s.id })
        showToast(`Dismissed "${s.proposed_tag}" for unit ${formatUnitId(s.unit_id, unitIdHex)}`)
      }
      setDecided((prev) => new Set(prev).add(s.id))
      refresh()
      return true
    } catch (err) {
      const { message, variant, refetch } = describeActionError(err, action)
      // Conflicts and vanished rows are expected races and handled by refreshing
      if (variant === 'error') console.error(`Failed to ${action} unit tag suggestion ${s.id}:`, err)
      showToast(message, variant, 6000)
      if (refetch) refresh()
      return false
    } finally {
      setRowBusy(s.id, null)
    }
  }

  const playEvidence = async (s: UnitTagSuggestion, ev: UnitTagEvidence) => {
    if (currentCallId === ev.call_id && isPlaying) {
      requestPause()
      return
    }
    setLoadingCallId(ev.call_id)
    try {
      // Load the full call (as Transcriptions does) so the player gets its
      // transmission timeline and unit tags, then seek to this unit's words.
      const call = await getCall(ev.call_id)
      if (!call.audio_url) {
        showToast('This call has no audio recording', 'warning')
        return
      }
      loadCall(call, { startAt: Math.max(0, ev.start - EVIDENCE_PREROLL_S) })
    } catch (err) {
      console.error(`Failed to load call ${ev.call_id} for suggestion ${s.id}:`, err)
      showToast(
        err instanceof ApiError && err.status === 404 ? 'That call no longer exists' : 'Failed to load call audio',
        'error'
      )
    } finally {
      setLoadingCallId(null)
    }
  }

  const activeTabLabel = STATUS_TABS.find((t) => t.value === status)?.label.toLowerCase() ?? status
  // Also covers the first render, before the query effect has started fetching
  const loading = !listData && !listQuery.error
  const loadError = listQuery.error

  if (restricted || isUnavailable(listQuery.data)) {
    return <RestrictedNotice what="Unit tag suggestions" />
  }

  if (unavailable) {
    return (
      <div className="space-y-3">
        <div>
          <Link to="/units" className="text-sm text-muted-foreground hover:underline">
            ← Back to units
          </Link>
        </div>
        <h1 className="text-2xl font-bold">Unit Tag Suggestions</h1>
        <EmptyState
          icon={TAG_ICON}
          title="Requires tr-engine v0.10 or newer"
          description={`This tr-engine doesn't provide unit tag suggestions. Upgrade it to review unit tags heard on air. If it's already v0.10 or newer, check that your reverse proxy forwards ${API_BASE}/unit-tag-suggestions.`}
        />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <Link to="/units" className="text-sm text-muted-foreground hover:underline">
          ← Back to units
        </Link>
      </div>

      {/* Header + filters */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold mr-2">Unit Tag Suggestions</h1>

        <div className="flex gap-1" role="tablist" aria-label="Suggestion status">
          {STATUS_TABS.map((tab) => (
            <Button
              key={tab.value}
              role="tab"
              aria-selected={status === tab.value}
              variant={status === tab.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateParams({ status: tab.value === 'pending' ? '' : tab.value })}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <select
          value={systemFilter}
          onChange={(e) => updateParams({ system: e.target.value })}
          className="rounded-md border border-input bg-background px-2 py-1 text-sm h-8"
          aria-label="Filter by system"
        >
          <option value="">All systems</option>
          {systems.map((sys) => (
            <option key={sys.system_id} value={String(sys.system_id)}>
              {sys.name || `System ${sys.system_id}`}
            </option>
          ))}
        </select>

        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {listData ? `${totalCount.toLocaleString()} ${activeTabLabel}` : ''}
        </span>
      </div>

      {status === 'pending' && scanner && (
        <p className="text-xs text-muted-foreground">
          Tags that units said on air when identifying themselves. A candidate is listed once it was heard
          in at least {scanner.min_calls} {scanner.min_calls === 1 ? 'call' : 'calls'}
          {scanner.min_share > 0 && ` and makes up at least ${Math.round(scanner.min_share * 100)}% of that unit's self-identifications`}
          . Nothing changes until you approve it.
        </p>
      )}

      {scanner && <ScannerNotice scanner={scanner} />}

      {!canWrite && (
        <Banner
          variant="info"
          action={
            <Link to="/settings" className="text-sm text-primary hover:underline">
              Settings
            </Link>
          }
        >
          Read-only access. Approving or dismissing suggestions needs an API key with the edit scope.
        </Banner>
      )}

      {loadError && listData && (
        <Banner
          variant="error"
          action={<Button size="sm" variant="outline" onClick={refresh}>Retry</Button>}
        >
          Couldn't refresh suggestions. Showing the last loaded results.
        </Banner>
      )}

      {/* Results */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : loadError && !listData ? (
        <ErrorPanel
          title="Failed to load suggestions"
          message={loadError.message}
          onRetry={refresh}
        />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={TAG_ICON}
          title={
            status === 'pending'
              ? 'No suggestions to review'
              : status === 'approved'
                ? 'No approved suggestions'
                : 'No dismissed suggestions'
          }
          description={
            systemFilter
              ? 'Nothing for this system. Try all systems.'
              : status === 'pending'
                ? scanner?.enabled === false
                  ? 'The scanner is turned off, so no new candidates are being found.'
                  : 'New candidates appear here once units identify themselves often enough.'
                : undefined
          }
          action={
            systemFilter ? (
              <Button size="sm" variant="outline" onClick={() => updateParams({ system: '' })}>
                Show all systems
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className={cn('space-y-3 transition-opacity', listQuery.isFetching && 'opacity-70')}>
          {groups.map((group) => (
            <UnitGroupCard
              key={group.key}
              group={group}
              unitIdHex={unitIdHex}
              canWrite={canWrite}
              busy={busy}
              playingCallId={isPlaying ? currentCallId : null}
              loadingCallId={loadingCallId}
              onApprove={(s, alphaTag) => runAction(s, 'approve', alphaTag)}
              onDismiss={(s) => runAction(s, 'dismiss')}
              onPlay={playEvidence}
            />
          ))}
        </div>
      )}

      <Pagination
        page={page}
        totalCount={totalCount}
        pageSize={pageSize}
        onPageChange={(p) => updateParams({ page: String(p) })}
        onPageSizeChange={(size) => updateParams({ size: String(size) })}
        pageSizeOptions={[25, 50, 100]}
      />
    </div>
  )
}

function ScannerNotice({ scanner }: { scanner: UnitTagScannerStatus }) {
  // Off is the engine default, so this is information rather than a problem
  if (!scanner.enabled) {
    return (
      <Banner variant="info">
        The unit tag scanner is off on this tr-engine, so no new suggestions are being found. Set{' '}
        <code className="font-mono text-xs">UNIT_TAG_SUGGESTIONS=true</code> on the engine to turn it on.
      </Banner>
    )
  }
  const remaining = scanner.max_transcription_id - scanner.last_transcription_id
  if (remaining <= BACKFILL_NOTICE_THRESHOLD) return null
  const pct = scanner.max_transcription_id > 0
    ? Math.floor((scanner.last_transcription_id / scanner.max_transcription_id) * 100)
    : 0
  return (
    <Banner variant="info">
      Scanning transcription history ({pct}%, {remaining.toLocaleString()} to go). More suggestions will
      appear as the scan catches up.
    </Banner>
  )
}

interface UnitGroupCardProps {
  group: UnitGroup
  unitIdHex: boolean
  canWrite: boolean
  busy: Map<number, PendingAction>
  playingCallId: number | null
  loadingCallId: number | null
  onApprove: (s: UnitTagSuggestion, alphaTag?: string) => Promise<boolean>
  onDismiss: (s: UnitTagSuggestion) => Promise<boolean>
  onPlay: (s: UnitTagSuggestion, ev: UnitTagEvidence) => void
}

function UnitGroupCard({ group, unitIdHex, ...rowProps }: UnitGroupCardProps) {
  const unitLabel = formatUnitId(group.unitId, unitIdHex)
  return (
    <div className="rounded-lg border bg-card card-glass">
      {/* Unit header: ID + current tag */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2">
        <Link
          to={`/units/${group.systemId}:${group.unitId}`}
          className="font-mono text-sm font-semibold hover:underline"
          title="Open unit details"
        >
          Unit {unitLabel}
        </Link>
        <span className="text-sm">
          <span className="text-muted-foreground">Current tag: </span>
          {group.unitAlphaTag ? (
            <span className="font-medium">{group.unitAlphaTag}</span>
          ) : (
            <span className="italic text-muted-foreground">none</span>
          )}
        </span>
        {group.unitAlphaTag && group.unitAlphaTagSource && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {group.unitAlphaTagSource}
          </Badge>
        )}
        {group.systemName && (
          <span className="ml-auto text-xs text-muted-foreground">{group.systemName}</span>
        )}
      </div>

      <div className="divide-y">
        {group.suggestions.map((s) => (
          <SuggestionRow key={s.id} suggestion={s} {...rowProps} />
        ))}
      </div>
    </div>
  )
}

interface SuggestionRowProps extends Omit<UnitGroupCardProps, 'group' | 'unitIdHex'> {
  suggestion: UnitTagSuggestion
}

function SuggestionRow({
  suggestion: s,
  canWrite,
  busy,
  playingCallId,
  loadingCallId,
  onApprove,
  onDismiss,
  onPlay,
}: SuggestionRowProps) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(s.proposed_tag)
  const [showAllEvidence, setShowAllEvidence] = useState(false)

  const action = busy.get(s.id)
  const isBusy = action !== undefined
  const isPending = s.status === 'pending'
  const trimmed = editValue.trim()
  const evidence = showAllEvidence ? s.evidence : s.evidence.slice(0, EVIDENCE_PREVIEW_COUNT)
  const hiddenEvidence = s.evidence.length - EVIDENCE_PREVIEW_COUNT

  const startEdit = () => {
    setEditValue(s.proposed_tag)
    setEditing(true)
  }

  const saveEdit = async () => {
    if (!trimmed || isBusy) return
    // Only send an override when the reviewer actually changed the tag
    const ok = await onApprove(s, trimmed === s.proposed_tag ? undefined : trimmed)
    if (ok) setEditing(false)
  }

  return (
    <div className={cn('px-3 py-3 space-y-2', isBusy && 'opacity-60')}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        {/* Proposal + stats */}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold leading-tight">{s.proposed_tag}</span>
            {s.status === 'approved' && <Badge variant="success">Approved</Badge>}
            {s.status === 'dismissed' && <Badge variant="secondary">Dismissed</Badge>}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
            <span title="Distinct calls where the unit said this ID">
              {s.call_count} {s.call_count === 1 ? 'call' : 'calls'}
            </span>
            <span className="text-muted-foreground/40">&middot;</span>
            <span title="Total times the unit said this ID">
              {s.occurrences} {s.occurrences === 1 ? 'mention' : 'mentions'}
            </span>
            <span className="text-muted-foreground/40">&middot;</span>
            <span title="Share of this unit's self-identification calls that used this ID">
              {Math.round(s.share * 100)}% of its IDs
            </span>
            <span className="text-muted-foreground/40">&middot;</span>
            <span title={`First heard ${formatDateTime(s.first_seen)}`}>
              first {formatDateTime(s.first_seen)}
            </span>
            <span className="text-muted-foreground/40">&middot;</span>
            <span title={`Last heard ${formatDateTime(s.last_seen)}`}>
              last {formatRelativeTime(s.last_seen)}
            </span>
          </div>
          {!isPending && <DecisionSummary suggestion={s} />}
        </div>

        {/* Actions */}
        {isPending && canWrite && (
          editing ? (
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit()
                  if (e.key === 'Escape') setEditing(false)
                }}
                className="h-8 w-full text-sm sm:w-56"
                placeholder="Unit tag"
                aria-label={`Tag for unit ${s.unit_id}`}
                disabled={isBusy}
                autoFocus
              />
              <Button size="sm" onClick={saveEdit} disabled={!trimmed || isBusy}>
                {action === 'approve' ? 'Approving…' : 'Approve'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={isBusy}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => onApprove(s)}
                disabled={isBusy}
                title={`Set the unit's tag to "${s.proposed_tag}"`}
              >
                {action === 'approve' ? 'Approving…' : 'Approve'}
              </Button>
              <Button size="sm" variant="outline" onClick={startEdit} disabled={isBusy}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDismiss(s)}
                disabled={isBusy}
                className="text-muted-foreground hover:text-destructive"
                title="Dismiss this suggestion. The unit is not changed."
              >
                {action === 'dismiss' ? 'Dismissing…' : 'Dismiss'}
              </Button>
            </div>
          )
        )}
      </div>

      {/* Evidence */}
      {s.evidence.length > 0 && (
        <div className="space-y-1">
          {evidence.map((ev, i) => (
            <EvidenceRow
              key={`${i}:${ev.call_id}`}
              evidence={ev}
              systemId={s.system_id}
              proposedTag={s.proposed_tag}
              isPlaying={playingCallId === ev.call_id}
              isLoading={loadingCallId === ev.call_id}
              onPlay={() => onPlay(s, ev)}
            />
          ))}
          {hiddenEvidence > 0 && (
            <button
              type="button"
              onClick={() => setShowAllEvidence(!showAllEvidence)}
              className="pl-10 text-xs text-primary hover:underline"
            >
              {showAllEvidence ? 'Show fewer' : `Show ${hiddenEvidence} more ${hiddenEvidence === 1 ? 'call' : 'calls'}`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function DecisionSummary({ suggestion: s }: { suggestion: UnitTagSuggestion }) {
  const parts: string[] = []
  if (s.status === 'approved') {
    parts.push(`Applied "${s.applied_tag ?? s.proposed_tag}"`)
    parts.push(s.previous_tag ? `was "${s.previous_tag}"` : 'unit had no tag')
  }
  if (s.decided_by) parts.push(`by ${s.decided_by}`)
  if (s.decided_at) parts.push(formatDateTime(s.decided_at))
  if (parts.length === 0) return null
  return <p className="text-xs text-muted-foreground">{parts.join(' · ')}</p>
}

interface EvidenceRowProps {
  evidence: UnitTagEvidence
  systemId: number
  proposedTag: string
  isPlaying: boolean
  isLoading: boolean
  onPlay: () => void
}

function EvidenceRow({ evidence: ev, systemId, proposedTag, isPlaying, isLoading, onPlay }: EvidenceRowProps) {
  const pattern = PATTERN_LABELS[ev.pattern]
  return (
    <div className={cn('flex items-start gap-2 rounded-md px-1 py-1', isPlaying && 'bg-primary/5')}>
      <button
        type="button"
        onClick={onPlay}
        disabled={isLoading}
        className={cn(
          'mt-0.5 shrink-0 flex h-7 w-7 items-center justify-center rounded-full transition-colors disabled:opacity-50',
          isPlaying ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary hover:bg-primary/20'
        )}
        title={isPlaying ? 'Pause' : 'Play from where the unit speaks'}
        aria-label={isPlaying ? 'Pause call audio' : `Play call ${ev.call_id}`}
      >
        {isLoading ? (
          <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.49-8.49l2.83-2.83M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.49 8.49l2.83 2.83" />
          </svg>
        ) : isPlaying ? (
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        ) : (
          <svg className="h-3.5 w-3.5 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-sm italic text-foreground/90 break-words">
          “<HighlightedExcerpt text={ev.excerpt} tag={proposedTag} />”
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          <Link to={`/talkgroups/${systemId}:${ev.tgid}`} className="truncate max-w-[200px] hover:underline">
            {getTalkgroupDisplayName(ev.tgid, ev.tg_alpha_tag)}
          </Link>
          <span className="text-muted-foreground/40">&middot;</span>
          <Link to={`/calls/${ev.call_id}`} className="hover:underline" title={formatDateTime(ev.call_start_time)}>
            {formatRelativeTime(ev.call_start_time)}
          </Link>
          <span
            className={cn(
              'rounded border px-1 leading-4',
              ev.pattern === 'bare' ? 'border-warning/40 text-warning' : 'border-border'
            )}
            title={pattern?.hint}
          >
            {pattern?.label ?? ev.pattern}
          </span>
        </div>
      </div>
    </div>
  )
}

function HighlightedExcerpt({ text, tag }: { text: string; tag: string }) {
  const idx = tag ? text.toLowerCase().indexOf(tag.toLowerCase()) : -1
  if (idx < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-primary/20 px-0.5 not-italic font-medium text-foreground">
        {text.slice(idx, idx + tag.length)}
      </mark>
      {text.slice(idx + tag.length)}
    </>
  )
}
