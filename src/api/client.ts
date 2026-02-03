import type {
  System,
  SystemListResponse,
  P25SystemListResponse,
  Talkgroup,
  TalkgroupListResponse,
  Unit,
  UnitListResponse,
  UnitEventListResponse,
  Call,
  CallListResponse,
  RecentCallsResponse,
  TransmissionListResponse,
  FrequencyListResponse,
  CallGroupListResponse,
  CallGroupDetailResponse,
  RecorderListResponse,
  StatsResponse,
  ActivityResponse,
  EncryptionStatsResponse,
  RatesResponse,
  Transcription,
  TranscriptionSearchResponse,
  TranscriptionQueueStats,
  HealthResponse,
} from './types'

const API_BASE = '/api/v1'

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
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
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

// Systems (recording sites)
export async function getSystems(): Promise<SystemListResponse> {
  return request('/systems')
}

// P25 Systems (with nested sites)
export async function getP25Systems(): Promise<P25SystemListResponse> {
  return request('/p25-systems')
}

export async function getSystem(id: number): Promise<System> {
  return request(`/systems/${id}`)
}

export async function getSystemTalkgroups(
  id: number,
  params?: { limit?: number; offset?: number }
): Promise<TalkgroupListResponse> {
  return request(`/systems/${id}/talkgroups${buildQueryString(params ?? {})}`)
}

// Talkgroups
export interface TalkgroupQueryParams {
  sysid?: string           // Filter by P25 system ID
  search?: string
  sort?: 'alpha_tag' | 'tgid' | 'last_seen' | 'first_seen' | 'group' | 'call_count' | 'calls_1h' | 'calls_24h' | 'unit_count'
  sort_dir?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export async function getTalkgroups(
  params?: TalkgroupQueryParams
): Promise<TalkgroupListResponse> {
  return request(`/talkgroups${buildQueryString(params ?? {})}`)
}

// Get talkgroup by composite key: "sysid:tgid" or plain tgid (may return 409 if ambiguous)
export async function getTalkgroup(id: string | number): Promise<Talkgroup> {
  return request(`/talkgroups/${id}`)
}

// Get calls for a talkgroup (id can be "sysid:tgid" or plain tgid)
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

export async function getEncryptionStats(
  hours?: number
): Promise<EncryptionStatsResponse> {
  return request(
    `/talkgroups/encryption-stats${buildQueryString({ hours })}`
  )
}

// Units
export interface UnitQueryParams {
  sysid?: string           // Filter by P25 system ID
  search?: string
  sort?: 'alpha_tag' | 'unit_id' | 'last_seen' | 'first_seen'
  sort_dir?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export async function getUnits(params?: UnitQueryParams): Promise<UnitListResponse> {
  return request(`/units${buildQueryString(params ?? {})}`)
}

// Get unit by composite key: "sysid:unit_id" or plain unit_id (may return 409 if ambiguous)
export async function getUnit(id: string | number): Promise<Unit> {
  return request(`/units/${id}`)
}

// Get unit events (id can be "sysid:unit_id" or plain unit_id)
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

// Get unit calls (id can be "sysid:unit_id" or plain unit_id)
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

export interface ActiveUnitsParams {
  window?: number
  sysid?: string           // Filter by P25 system ID
  system?: number | string // Deprecated, use sysid
  sys_name?: string
  talkgroup?: number
  sort?: 'alpha_tag' | 'unit_id' | 'last_seen' | 'first_seen'
  sort_dir?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export async function getActiveUnits(
  params?: ActiveUnitsParams
): Promise<UnitListResponse> {
  return request(`/units/active${buildQueryString(params ?? {})}`)
}

// Calls
export interface CallQueryParams {
  system?: number
  talkgroup?: number
  start_time?: string
  end_time?: string
  limit?: number
  offset?: number
}

export async function getCalls(params?: CallQueryParams): Promise<CallListResponse> {
  return request(`/calls${buildQueryString(params ?? {})}`)
}

export async function getCall(id: number | string): Promise<Call> {
  return request(`/calls/${id}`)
}

export function getCallAudioUrl(id: number | string): string {
  return `${API_BASE}/calls/${id}/audio`
}

export async function getCallTransmissions(
  id: number | string
): Promise<TransmissionListResponse> {
  return request(`/calls/${id}/transmissions`)
}

export async function getCallFrequencies(
  id: number | string
): Promise<FrequencyListResponse> {
  return request(`/calls/${id}/frequencies`)
}

export interface ActiveCallsParams {
  system?: number | string
  sys_name?: string
  talkgroup?: number
  emergency?: boolean
  encrypted?: boolean
  limit?: number
  offset?: number
}

export async function getActiveCalls(
  params?: ActiveCallsParams
): Promise<CallListResponse> {
  return request(`/calls/active${buildQueryString(params ?? {})}`)
}

export async function getActiveCallsRealtime(): Promise<CallListResponse> {
  return request('/calls/active/realtime')
}

export async function getRecentCalls(
  limit?: number,
  deduplicate?: boolean
): Promise<RecentCallsResponse> {
  // Backend deduplicates by default; only pass param if explicitly set to false
  const params = deduplicate === false ? { limit, deduplicate } : { limit }
  return request(`/calls/recent${buildQueryString(params)}`)
}

// Transcriptions
export async function getCallTranscription(
  id: number | string
): Promise<Transcription> {
  return request(`/calls/${id}/transcription`)
}

export async function transcribeCall(
  id: number | string,
  priority?: number
): Promise<{ status: string; message: string }> {
  return request(`/calls/${id}/transcribe`, {
    method: 'POST',
    body: JSON.stringify({ priority }),
  })
}

export async function searchTranscriptions(
  q: string,
  params?: { limit?: number; offset?: number }
): Promise<TranscriptionSearchResponse> {
  return request(`/transcriptions/search${buildQueryString({ q, ...params })}`)
}

export async function getRecentTranscriptions(
  params?: { limit?: number; offset?: number }
): Promise<TranscriptionSearchResponse> {
  return request(`/transcriptions/recent${buildQueryString(params ?? {})}`)
}

export async function getTranscriptionStatus(): Promise<TranscriptionQueueStats> {
  return request('/transcription/status')
}

// Call Groups
export async function getCallGroups(params?: {
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

// Recorders
export async function getRecorders(): Promise<RecorderListResponse> {
  return request('/recorders')
}

// Statistics
export async function getStats(): Promise<StatsResponse> {
  return request('/stats')
}

export async function getDecodeRates(params?: {
  start_time?: string
  end_time?: string
}): Promise<RatesResponse> {
  return request(`/stats/rates${buildQueryString(params ?? {})}`)
}

export async function getActivity(): Promise<ActivityResponse> {
  return request('/stats/activity')
}

// Health check (root level endpoint, not under /api/v1)
export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch('/health')
  if (!response.ok) {
    throw new ApiError(response.status, `Health check failed: ${response.statusText}`)
  }
  return response.json()
}

export { ApiError }
