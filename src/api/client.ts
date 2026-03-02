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
  QueryRequest,
  QueryResponse,
  HealthResponse,
  SystemPatch,
  SitePatch,
  TalkgroupPatch,
  UnitPatch,
} from './types'

import { useAuthStore } from '@/stores/useAuthStore'

const API_BASE = '/api/v1'
const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE}${endpoint}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  // Inject write token for mutating requests
  const method = (options?.method || 'GET').toUpperCase()
  if (WRITE_METHODS.has(method)) {
    const writeToken = useAuthStore.getState().writeToken
    if (writeToken) {
      headers['Authorization'] = `Bearer ${writeToken}`
    }
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
    throw new ApiError(response.status, `API error: ${response.statusText}`, data)
  }

  return response.json()
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

export async function getP25Systems(): Promise<P25SystemListResponse> {
  return request('/p25-systems')
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
): Promise<UnitListResponse> {
  return request(`/talkgroups/${id}/units${buildQueryString(params ?? {})}`)
}

export async function getEncryptionStats(
  params?: { hours?: number; sysid?: string }
): Promise<EncryptionStatsResponse> {
  return request(`/talkgroups/encryption-stats${buildQueryString(params ?? {})}`)
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
  const url = `${API_BASE}/talkgroup-directory/import?${param}`
  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  })
  if (!response.ok) {
    let data: unknown
    try { data = await response.json() } catch { /* ignore */ }
    throw new ApiError(response.status, `API error: ${response.statusText}`, data)
  }
  return response.json()
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

export async function getUnits(params?: UnitQueryParams): Promise<UnitListResponse> {
  return request(`/units${buildQueryString(params ?? {})}`)
}

export async function getUnit(id: string | number): Promise<Unit> {
  return request(`/units/${id}`)
}

export async function updateUnit(id: string | number, patch: UnitPatch): Promise<Unit> {
  return request(`/units/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
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
): Promise<CallListResponse> {
  return request(`/units/${id}/calls${buildQueryString(params ?? {})}`)
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
): Promise<UnitEventListResponse> {
  return request(`/units/${id}/events${buildQueryString(params ?? {})}`)
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
): Promise<UnitEventListResponse> {
  return request(`/unit-events${buildQueryString(params ?? {})}`)
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
): Promise<AffiliationListResponse> {
  return request(`/unit-affiliations${buildQueryString(params ?? {})}`)
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

export function getCallAudioUrl(id: number): string {
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

export async function getTranscriptionQueueStatus(): Promise<TranscriptionQueueStats> {
  return request('/transcriptions/queue')
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

export async function getRecorders(): Promise<RecorderListResponse> {
  return request('/recorders')
}

// =============================================================================
// Statistics
// =============================================================================

export async function getStats(): Promise<StatsResponse> {
  return request('/stats')
}

export async function getDecodeRates(params?: {
  start_time?: string
  end_time?: string
}): Promise<DecodeRatesResponse> {
  return request(`/stats/rates${buildQueryString(params ?? {})}`)
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
}): Promise<TalkgroupActivityResponse> {
  return request(`/stats/talkgroup-activity${buildQueryString(params ?? {})}`)
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

export async function executeQuery(
  sql: string,
  params?: unknown[],
  limit?: number
): Promise<QueryResponse> {
  const body: QueryRequest = { sql }
  if (params) body.params = params
  if (limit) body.limit = limit
  return request('/query', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

// =============================================================================
// Health
// =============================================================================

export async function getHealth(): Promise<HealthResponse> {
  return request('/health')
}

export { ApiError }
