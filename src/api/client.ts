import type {
  System,
  SystemListResponse,
  P25SystemListResponse,
  Site,
  Talkgroup,
  TalkgroupListResponse,
  TalkgroupDirectoryListResponse,
  Unit,
  UnitListResponse,
  UnitEventListResponse,
  Call,
  CallListResponse,
  ActiveCallListResponse,
  CallTransmissionListResponse,
  CallFrequencyListResponse,
  CallGroupListResponse,
  CallGroupDetailResponse,
  AffiliationListResponse,
  RecorderListResponse,
  Transcription,
  TranscriptionSearchResponse,
  TranscriptionQueueStats,
  StatsResponse,
  DecodeRatesResponse,
  TalkgroupActivityResponse,
  EncryptionStatsResponse,
  SystemMergeRequest,
  SystemMergeResponse,
  MaintenanceStatusResponse,
  MaintenanceRunResponse,
  HealthResponse,
  SystemPatch,
  SitePatch,
  TalkgroupPatch,
  UnitPatch,
  UnitTagsImportResponse,
  UnitTagSuggestion,
  UnitTagSuggestionStatus,
  UnitTagSuggestionListResponse,
  UnitTagSuggestionApprove,
  UnitTagSuggestionApproveResponse,
  UnitTagSuggestionDismissResponse,
  APIKey,
  APIKeyCreate,
  APIKeyCreated,
  APIKeyPatch,
  APIKeyListResponse,
  AnonymousAccess,
  AnonymousAccessUpdate,
  AuditLogResponse,
  Ticket,
} from './types'

import type { components } from './generated'
import { useAuthStore } from '@/stores/useAuthStore'

declare global {
  interface Window {
    __env?: { VITE_API_BASE?: string }
  }
}

export const API_BASE = window.__env?.VITE_API_BASE || import.meta.env.VITE_API_BASE || '/api/v1'

type ErrorCode = components['schemas']['Error']['code']

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }

  /** The engine's machine-readable error code, when the body carried one */
  get code(): ErrorCode | undefined {
    const code = (this.data as { code?: unknown } | undefined)?.code
    return typeof code === 'string' ? (code as ErrorCode) : undefined
  }
}

/**
 * True when the request hit no tr-engine route (an older engine, or a reverse
 * proxy that doesn't forward it): a 404/405 without tr-engine's JSON `{error}`
 * body, which its own handlers always send (e.g. "system_id 5 not found").
 */
export function isMissingEndpoint(err: unknown): boolean {
  if (!(err instanceof ApiError) || (err.status !== 404 && err.status !== 405)) return false
  return typeof (err.data as { error?: unknown } | undefined)?.error !== 'string'
}

/** The scope named in an insufficient_scope message ("this operation needs the edit scope") */
function neededScope(data: unknown): string | null {
  const text = (data as { error?: unknown } | undefined)?.error
  if (typeof text !== 'string') return null
  const needs = text.match(/\b(?:needs?|requires?)\s+(?:the\s+)?["'`]?(admin|edit|listen|upload)\b/i)
  if (needs) return needs[1].toLowerCase()
  // Otherwise the last scope mentioned ("key has listen, operation wants edit")
  const all = text.match(/\b(admin|edit|listen|upload)\b/gi)
  return all ? all[all.length - 1].toLowerCase() : null
}

/**
 * User-facing message for an auth error from the engine, or null for other
 * errors. Pages show ApiError.message, so these read as explanations rather
 * than HTTP status texts.
 */
function authErrorMessage(data: unknown): string | null {
  const code = (data as { code?: unknown } | undefined)?.code
  switch (code) {
    case 'key_required':
      return 'This needs an API key. Add one in Settings.'
    case 'invalid_key':
      return 'tr-engine rejected the API key (unknown, revoked or expired).'
    case 'invalid_ticket':
      return 'The streaming ticket was rejected; reload to get a new one.'
    case 'insufficient_scope': {
      const scope = neededScope(data)
      return scope ? `Your key can't do this (needs ${scope}).` : "Your key can't do this."
    }
    case 'restricted_credential':
      return "Not available: your access is limited to some systems or talkgroups."
    default:
      return null
  }
}

/**
 * Message for showing a failed request: the auth explanation for auth errors
 * ("Your key can't do this (needs edit)"), else the engine's error text,
 * else `fallback`.
 */
export function describeError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (authErrorMessage(err.data)) return err.message
    const text = (err.data as { error?: unknown } | undefined)?.error
    if (typeof text === 'string' && text) return text
  }
  return fallback
}

/**
 * Called on a 401 that means the credential itself is wrong (invalid_key), or
 * that anonymous access went away while browsing without a key (key_required).
 * Registered by api/auth.ts, which re-runs /whoami and shows the key screen;
 * kept as a hook so this module doesn't import auth.ts.
 */
let authFailureHandler: (() => void) | null = null
export function onAuthFailure(handler: () => void): void {
  authFailureHandler = handler
}

function handleAuthFailure(err: ApiError): void {
  if (err.status !== 401 || !authFailureHandler) return
  const hasKey = !!useAuthStore.getState().apiKey
  if (err.code === 'invalid_key' || (err.code === 'key_required' && !hasKey)) {
    authFailureHandler()
  }
}

async function request<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE}${endpoint}`
  const headers: Record<string, string> = {}

  // Let the browser set Content-Type for FormData (multipart boundary);
  // otherwise JSON bodies.
  if (options?.body !== undefined && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  // The key goes only in this header; nothing is sent without one.
  const { apiKey } = useAuthStore.getState()
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options?.headers,
    },
  })

  if (!response.ok) {
    let data: unknown
    try {
      data = await response.json()
    } catch {
      // ignore parse error
    }
    const err = new ApiError(response.status, authErrorMessage(data) ?? `API error: ${response.statusText}`, data)
    handleAuthFailure(err)
    throw err
  }

  if (response.status === 204) {
    return undefined as T
  }
  return response.json()
}

// =============================================================================
// Restricted credentials
// =============================================================================

/**
 * Result of an API function for an endpoint that denies restricted
 * credentials (`x-restricted: deny`: units, stats, recorders, ...). While
 * whoami.restricted is true these functions return it without calling the
 * engine; a 403 restricted_credential (the policy changed under us) also
 * becomes this result.
 */
export interface Unavailable {
  readonly unavailable: true
  readonly reason: 'restricted'
}

export const UNAVAILABLE: Unavailable = Object.freeze({ unavailable: true, reason: 'restricted' })

export function isUnavailable(value: unknown): value is Unavailable {
  return typeof value === 'object' && value !== null && (value as { unavailable?: unknown }).unavailable === true
}

/** request() for an `x-restricted: deny` endpoint */
async function denyRequest<T>(endpoint: string, options?: RequestInit): Promise<T | Unavailable> {
  if (useAuthStore.getState().restricted) return UNAVAILABLE
  try {
    return await request<T>(endpoint, options)
  } catch (err) {
    if (err instanceof ApiError && err.code === 'restricted_credential') {
      authFailureHandler?.()
      return UNAVAILABLE
    }
    throw err
  }
}

function buildQueryString(params: object): string {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value))
    }
  }
  const query = searchParams.toString()
  return query ? `?${query}` : ''
}

// =============================================================================
// Systems
// =============================================================================

// Module-level cache: system_id → system_type (populated by getSystems)
const systemTypeCache = new Map<number, string>()

export function getCachedSystemType(systemId: number): string | undefined {
  return systemTypeCache.get(systemId)
}

export async function getSystems(): Promise<SystemListResponse> {
  const result = await request<SystemListResponse>('/systems')
  for (const sys of result.systems) {
    if (sys.system_type) systemTypeCache.set(sys.system_id, sys.system_type)
  }
  return result
}

export async function getSystem(id: number): Promise<System> {
  const result = await request<System>(`/systems/${id}`)
  if (result.system_type) systemTypeCache.set(result.system_id, result.system_type)
  return result
}

export async function updateSystem(id: number, patch: SystemPatch): Promise<System> {
  return request(`/systems/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export async function getP25Systems(): Promise<P25SystemListResponse | Unavailable> {
  return denyRequest('/p25-systems')
}

export async function getSite(id: number): Promise<Site> {
  return request(`/sites/${id}`)
}

export async function updateSite(id: number, patch: SitePatch): Promise<Site> {
  return request(`/sites/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

// =============================================================================
// Talkgroups
// =============================================================================

export interface TalkgroupQueryParams {
  system_id?: string
  sysid?: string
  group?: string
  search?: string
  sort?: string
  sort_dir?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export async function getTalkgroups(
  params?: TalkgroupQueryParams
): Promise<TalkgroupListResponse> {
  return request(`/talkgroups${buildQueryString(params ?? {})}`)
}

export async function getTalkgroup(id: string | number): Promise<Talkgroup> {
  return request(`/talkgroups/${id}`)
}

export async function updateTalkgroup(id: string | number, patch: TalkgroupPatch): Promise<Talkgroup> {
  return request(`/talkgroups/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export async function getTalkgroupCalls(
  id: string | number,
  params?: {
    start_time?: string
    end_time?: string
    limit?: number
    offset?: number
  }
): Promise<CallListResponse> {
  return request(`/talkgroups/${id}/calls${buildQueryString(params ?? {})}`)
}

export async function getTalkgroupUnits(
  id: string | number,
  params?: {
    window?: number
    limit?: number
    offset?: number
  }
): Promise<UnitListResponse | Unavailable> {
  return denyRequest(`/talkgroups/${id}/units${buildQueryString(params ?? {})}`)
}

export async function getEncryptionStats(
  params?: { hours?: number; sysid?: string }
): Promise<EncryptionStatsResponse | Unavailable> {
  return denyRequest(`/talkgroups/encryption-stats${buildQueryString(params ?? {})}`)
}

export async function getTalkgroupDirectory(
  params?: {
    system_id?: number
    search?: string
    category?: string
    mode?: string
    limit?: number
    offset?: number
  }
): Promise<TalkgroupDirectoryListResponse> {
  return request(`/talkgroup-directory${buildQueryString(params ?? {})}`)
}

export async function importTalkgroupDirectory(
  systemIdOrName: number | string,
  file: File
): Promise<{ imported: number; total: number; system_id: number }> {
  const formData = new FormData()
  formData.append('file', file)
  const param = typeof systemIdOrName === 'number'
    ? `system_id=${systemIdOrName}`
    : `system_name=${encodeURIComponent(systemIdOrName)}`
  return request(`/talkgroup-directory/import?${param}`, {
    method: 'POST',
    body: formData,
  })
}

// =============================================================================
// Units
// =============================================================================

export interface UnitQueryParams {
  sysid?: string
  search?: string
  active_within?: number
  talkgroup?: string
  sort?: string
  sort_dir?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export async function getUnits(params?: UnitQueryParams): Promise<UnitListResponse | Unavailable> {
  return denyRequest(`/units${buildQueryString(params ?? {})}`)
}

export async function getUnit(id: string | number): Promise<Unit | Unavailable> {
  return denyRequest(`/units/${id}`)
}

export async function updateUnit(id: string | number, patch: UnitPatch): Promise<Unit> {
  return request(`/units/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export async function importUnitTags(
  systemIdOrName: number | string,
  file: File
): Promise<UnitTagsImportResponse> {
  const formData = new FormData()
  formData.append('file', file)
  const param = typeof systemIdOrName === 'number'
    ? `system_id=${systemIdOrName}`
    : `system_name=${encodeURIComponent(systemIdOrName)}`
  return request(`/unit-tags/import?${param}`, {
    method: 'POST',
    body: formData,
  })
}

export async function getUnitCalls(
  id: string | number,
  params?: {
    start_time?: string
    end_time?: string
    limit?: number
    offset?: number
  }
): Promise<CallListResponse | Unavailable> {
  return denyRequest(`/units/${id}/calls${buildQueryString(params ?? {})}`)
}

export async function getUnitEvents(
  id: string | number,
  params?: {
    type?: string
    talkgroup?: number
    start_time?: string
    end_time?: string
    limit?: number
    offset?: number
  }
): Promise<UnitEventListResponse | Unavailable> {
  return denyRequest(`/units/${id}/events${buildQueryString(params ?? {})}`)
}

export interface GlobalUnitEventParams {
  system_id?: string
  sysid?: string
  unit_id?: string
  type?: string
  tgid?: string
  emergency?: boolean
  start_time?: string
  end_time?: string
  sort?: string
  limit?: number
  offset?: number
}

export async function getGlobalUnitEvents(
  params?: GlobalUnitEventParams
): Promise<UnitEventListResponse | Unavailable> {
  return denyRequest(`/unit-events${buildQueryString(params ?? {})}`)
}

export interface AffiliationQueryParams {
  system_id?: string
  sysid?: string
  tgid?: string
  unit_id?: string
  status?: 'affiliated' | 'off'
  stale_threshold?: number
  active_within?: number
  limit?: number
  offset?: number
}

export async function getUnitAffiliations(
  params?: AffiliationQueryParams
): Promise<AffiliationListResponse | Unavailable> {
  return denyRequest(`/unit-affiliations${buildQueryString(params ?? {})}`)
}

// =============================================================================
// Unit Tag Suggestions (review queue)
// =============================================================================

export interface UnitTagSuggestionQueryParams {
  status?: UnitTagSuggestionStatus | 'all'
  system_id?: string
  unit_id?: string
  limit?: number
  offset?: number
}

export async function getUnitTagSuggestions(
  params?: UnitTagSuggestionQueryParams
): Promise<UnitTagSuggestionListResponse | Unavailable> {
  return denyRequest(`/unit-tag-suggestions${buildQueryString(params ?? {})}`)
}

export async function getUnitTagSuggestion(id: number): Promise<UnitTagSuggestion | Unavailable> {
  return denyRequest(`/unit-tag-suggestions/${id}`)
}

/** Approve a pending suggestion. Omit `body` to apply `proposed_tag`; pass `alpha_tag` to override it. */
export async function approveUnitTagSuggestion(
  id: number,
  body?: UnitTagSuggestionApprove
): Promise<UnitTagSuggestionApproveResponse> {
  return request(`/unit-tag-suggestions/${id}/approve`, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  })
}

export async function dismissUnitTagSuggestion(id: number): Promise<UnitTagSuggestionDismissResponse> {
  return request(`/unit-tag-suggestions/${id}/dismiss`, { method: 'POST' })
}

// =============================================================================
// Calls
// =============================================================================

export interface CallQueryParams {
  sysid?: string
  system_id?: string
  site_id?: string
  tgid?: string
  unit_id?: string
  emergency?: boolean
  encrypted?: boolean
  deduplicate?: boolean
  start_time?: string
  end_time?: string
  sort?: string
  limit?: number
  offset?: number
}

export async function getCalls(params?: CallQueryParams): Promise<CallListResponse> {
  return request(`/calls${buildQueryString(params ?? {})}`)
}

export async function getActiveCalls(
  params?: {
    sysid?: string
    tgid?: number
    emergency?: boolean
    encrypted?: boolean
  }
): Promise<ActiveCallListResponse> {
  return request(`/calls/active${buildQueryString(params ?? {})}`)
}

export async function getCall(id: number): Promise<Call> {
  return request(`/calls/${id}`)
}

/**
 * The call's audio URL, built from API_BASE (never from the root-relative
 * `audio_url`, which resolves against the dashboard's origin when
 * VITE_API_BASE is absolute). It never carries a credential: AudioPlayer adds
 * a ticket right before setting `src` (see api/tickets.ts).
 */
export function callAudioUrl(id: number): string {
  return `${API_BASE}/calls/${id}/audio`
}

export async function getCallTransmissions(
  id: number
): Promise<CallTransmissionListResponse> {
  return request(`/calls/${id}/transmissions`)
}

export async function getCallFrequencies(
  id: number
): Promise<CallFrequencyListResponse> {
  return request(`/calls/${id}/frequencies`)
}

// =============================================================================
// Transcriptions
// =============================================================================

export async function getCallTranscription(
  id: number
): Promise<Transcription> {
  return request(`/calls/${id}/transcription`)
}

export async function listCallTranscriptions(
  id: number
): Promise<{ transcriptions: Transcription[]; total: number }> {
  return request(`/calls/${id}/transcriptions`)
}

export async function submitTranscription(
  id: number,
  data: { text: string; source?: string; provider?: string; language?: string; words?: object | null }
): Promise<{ id: number; call_id: number; source: string }> {
  return request(`/calls/${id}/transcription`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function transcribeCall(
  id: number
): Promise<{ call_id: number; status: string }> {
  return request(`/calls/${id}/transcribe`, { method: 'POST' })
}

export async function verifyTranscription(
  id: number
): Promise<{ call_id: number; status: string }> {
  return request(`/calls/${id}/transcription/verify`, { method: 'POST' })
}

export async function rejectTranscription(
  id: number
): Promise<{ call_id: number; status: string }> {
  return request(`/calls/${id}/transcription/reject`, { method: 'POST' })
}

export async function excludeFromDataset(
  id: number
): Promise<{ call_id: number; status: string }> {
  return request(`/calls/${id}/transcription/exclude`, { method: 'POST' })
}

export async function searchTranscriptions(
  q: string,
  params?: {
    system_id?: string
    tgid?: string
    site_id?: string
    start_time?: string
    end_time?: string
    limit?: number
    offset?: number
  }
): Promise<TranscriptionSearchResponse> {
  return request(`/transcriptions/search${buildQueryString({ q, ...params })}`)
}

export async function getTranscriptionQueueStatus(): Promise<TranscriptionQueueStats | Unavailable> {
  return denyRequest('/transcriptions/queue')
}

// =============================================================================
// Call Groups
// =============================================================================

export async function getCallGroups(params?: {
  sysid?: string
  tgid?: string
  start_time?: string
  end_time?: string
  limit?: number
  offset?: number
}): Promise<CallGroupListResponse> {
  return request(`/call-groups${buildQueryString(params ?? {})}`)
}

export async function getCallGroup(id: number): Promise<CallGroupDetailResponse> {
  return request(`/call-groups/${id}`)
}

// =============================================================================
// Recorders
// =============================================================================

export async function getRecorders(): Promise<RecorderListResponse | Unavailable> {
  return denyRequest('/recorders')
}

// =============================================================================
// Statistics
// =============================================================================

export async function getStats(): Promise<StatsResponse | Unavailable> {
  return denyRequest('/stats')
}

export async function getDecodeRates(params?: {
  start_time?: string
  end_time?: string
}): Promise<DecodeRatesResponse | Unavailable> {
  return denyRequest(`/stats/rates${buildQueryString(params ?? {})}`)
}

export async function getTalkgroupActivity(params?: {
  system_id?: string
  site_id?: string
  tgid?: string
  after?: string
  before?: string
  sort?: string
  limit?: number
  offset?: number
}): Promise<TalkgroupActivityResponse | Unavailable> {
  return denyRequest(`/stats/talkgroup-activity${buildQueryString(params ?? {})}`)
}

// =============================================================================
// Admin
// =============================================================================

export async function mergeSystems(req: SystemMergeRequest): Promise<SystemMergeResponse> {
  return request('/admin/systems/merge', {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

export async function getMaintenanceStatus(): Promise<MaintenanceStatusResponse> {
  return request('/admin/maintenance')
}

export async function runMaintenance(): Promise<MaintenanceRunResponse> {
  return request('/admin/maintenance', { method: 'POST' })
}

// =============================================================================
// Access: API keys, anonymous access policy, audit log (admin)
// =============================================================================

export async function listKeys(params?: { include_revoked?: boolean }): Promise<APIKeyListResponse> {
  return request(`/keys${buildQueryString(params ?? {})}`)
}

export async function createKey(body: APIKeyCreate): Promise<APIKeyCreated> {
  return request('/keys', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateKey(id: number, patch: APIKeyPatch): Promise<APIKey> {
  return request(`/keys/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export async function revokeKey(id: number): Promise<void> {
  await request(`/keys/${id}`, { method: 'DELETE' })
}

export async function getAnonymousAccess(): Promise<AnonymousAccess> {
  return request('/anonymous-access')
}

export async function putAnonymousAccess(body: AnonymousAccessUpdate): Promise<AnonymousAccess> {
  return request('/anonymous-access', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export async function getAuditLog(params?: {
  limit?: number
  offset?: number
  key_id?: number
  since?: string
  until?: string
}): Promise<AuditLogResponse> {
  return request(`/admin/audit-log${buildQueryString(params ?? {})}`)
}

// =============================================================================
// Tickets
// =============================================================================

/** POST /tickets with the stored key. Use getTicket() from api/tickets.ts, which caches. */
export async function mintTicket(ttlSeconds: number): Promise<Ticket> {
  return request('/tickets', {
    method: 'POST',
    body: JSON.stringify({ ttl_seconds: ttlSeconds }),
  })
}

// =============================================================================
// Health
// =============================================================================

export async function getHealth(): Promise<HealthResponse> {
  return request('/health')
}

export { ApiError }
