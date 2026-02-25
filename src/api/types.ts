/**
 * API Types for tr-engine v0.7.3
 *
 * Hand-written types matching the OpenAPI spec. Reference: /openapi.yaml
 * Auto-generated types: npm run api:generate → src/api/generated.ts
 */

// =============================================================================
// Enums
// =============================================================================

export type SystemType = 'p25' | 'smartnet' | 'conventional'

export type TalkgroupMode = 'D' | 'A' | 'E' | 'M' | 'T'

export type EventType = 'on' | 'off' | 'join' | 'call' | 'end' | 'data' | 'ans_req' | 'location' | 'ackresp'

export type CallState = 'monitoring' | 'recording' | 'stopped' | 'completed'

export type MonState = 'unspecified' | 'active' | 'duplicate'

export type RecState = 'available' | 'recording' | 'idle' | 'stopped'

export type TranscriptionStatus = 'none' | 'auto' | 'reviewed' | 'verified' | 'excluded'

export type TranscriptionSource = 'auto' | 'human' | 'llm'

export type SSEEventType =
  | 'call_start'
  | 'call_update'
  | 'call_end'
  | 'unit_event'
  | 'recorder_update'
  | 'rate_update'
  | 'trunking_message'
  | 'console'

// =============================================================================
// Core Models
// =============================================================================

/** Logical radio network (P25 WACN-level or conventional system) */
export interface System {
  system_id: number
  system_type: SystemType
  name?: string
  sysid?: string
  wacn?: string
  sites?: Site[]
}

/** Recording site — one trunk-recorder sys_name monitoring a system */
export interface Site {
  site_id: number
  system_id: number
  short_name: string
  instance_id?: string
  nac?: string
  rfss?: number
  p25_site_id?: number
  sys_num?: number
}

/** P25 system grouped by network with sites */
export interface P25System {
  system_id: number
  name?: string
  sysid?: string
  wacn?: string
  sites?: Site[]
  talkgroup_count?: number
  unit_count?: number
  calls_24h?: number
}

/** A talkgroup on a radio system */
export interface Talkgroup {
  system_id: number
  system_name?: string
  sysid?: string
  tgid: number
  alpha_tag?: string
  tag?: string
  group?: string
  description?: string
  mode?: TalkgroupMode
  priority?: number
  first_seen?: string
  last_seen?: string
  call_count?: number
  calls_1h?: number
  calls_24h?: number
  unit_count?: number
  relevance_score?: number
}

/** A radio unit (mobile or portable radio) */
export interface Unit {
  system_id: number
  system_name?: string
  sysid?: string
  unit_id: number
  alpha_tag?: string
  alpha_tag_source?: string
  first_seen?: string
  last_seen?: string
  last_event_type?: EventType
  last_event_time?: string
  last_event_tgid?: number
  last_event_tg_tag?: string
  relevance_score?: number
}

/** A unit event (registration, affiliation, call activity) */
export interface UnitEvent {
  id: number
  event_type: EventType
  time: string
  system_id?: number
  system_name?: string
  unit_rid: number
  unit_alpha_tag?: string
  tgid?: number
  tg_alpha_tag?: string
  tg_description?: string
  instance_id?: string
  metadata_json?: Record<string, unknown>
}

/** A recorded radio call */
export interface Call {
  // Identifiers
  call_id: number
  call_group_id?: number

  // System context
  system_id: number
  system_name?: string
  sysid?: string

  // Site context
  site_id?: number
  site_short_name?: string

  // Talkgroup context
  tgid: number
  tg_alpha_tag?: string
  tg_description?: string
  tg_tag?: string
  tg_group?: string

  // Timing
  start_time: string
  stop_time?: string | null
  duration?: number

  // Audio
  audio_url?: string | null
  audio_type?: string
  audio_size?: number

  // Signal quality
  freq?: number
  freq_error?: number
  signal_db?: number | null
  noise_db?: number | null
  error_count?: number
  spike_count?: number

  // Status
  call_state?: CallState
  mon_state?: MonState
  emergency?: boolean
  encrypted?: boolean
  analog?: boolean
  conventional?: boolean
  phase2_tdma?: boolean
  tdma_slot?: number

  // Patches
  patched_tgids?: number[]

  // Inline transmission/frequency data (JSONB)
  src_list?: CallTransmission[]
  freq_list?: CallFrequency[]
  unit_ids?: number[]

  // Units on this call
  units?: CallUnit[]

  // Transcription (denormalized)
  has_transcription?: boolean
  transcription_status?: TranscriptionStatus
  transcription_text?: string | null
  transcription_word_count?: number | null

  // Extensible metadata
  metadata_json?: Record<string, unknown>
}

/** A unit that transmitted during a call */
export interface CallUnit {
  system_id: number
  unit_id: number
  alpha_tag?: string
}

/** A unit key-up from trunk-recorder's srcList */
export interface CallTransmission {
  src: number
  tag?: string
  time: number
  pos: number
  duration: number
  emergency: number
  signal_system?: string
}

/** A frequency segment from trunk-recorder's freqList */
export interface CallFrequency {
  freq: number
  time: number
  pos: number
  len: number
  error_count?: number
  spike_count?: number
}

/** A group of duplicate call recordings from multiple recorders */
export interface CallGroup {
  id: number
  system_id?: number
  system_name?: string
  sysid?: string
  site_id?: number
  site_short_name?: string
  tgid?: number
  tg_alpha_tag?: string
  tg_description?: string
  tg_tag?: string
  tg_group?: string
  start_time?: string
  stop_time?: string
  duration?: number
  call_count?: number
  primary_call_id?: number
  has_transcription?: boolean
  transcription_status?: TranscriptionStatus
  transcription_text?: string | null
}

/** A transcription of a call's audio content */
export interface Transcription {
  id: number
  call_id: number
  text: string
  source: TranscriptionSource
  is_primary?: boolean
  confidence?: number | null
  language?: string
  model?: string
  provider?: string
  word_count?: number
  duration_ms?: number
  created_at?: string
  words?: {
    words?: AttributedWord[]
    segments?: TranscriptionSegment[]
  }
}

/** A word with timing and unit attribution */
export interface AttributedWord {
  word: string
  start: number
  end: number
  src: number
  src_tag?: string
}

/** Consecutive words from the same radio unit */
export interface TranscriptionSegment {
  src: number
  src_tag?: string
  start: number
  end: number
  text: string
}

/** Trunk-recorder recorder (SDR channel) */
export interface Recorder {
  id: string
  src_num?: number
  rec_num?: number
  type?: string
  rec_state?: RecState
  freq?: number
  duration?: number
  count?: number
  squelched?: boolean
  tgid?: number | null
  tg_alpha_tag?: string | null
  unit_id?: number | null
  unit_alpha_tag?: string | null
}

/** Live talkgroup affiliation entry */
export interface Affiliation {
  system_id: number
  system_name?: string
  sysid?: string
  unit_id: number
  unit_alpha_tag?: string
  tgid: number
  tg_alpha_tag?: string
  tg_description?: string
  tg_tag?: string
  tg_group?: string
  previous_tgid?: number | null
  affiliated_since: string
  last_event_time: string
  status: 'affiliated' | 'off'
}

/** Talkgroup directory entry (from CSV import) */
export interface TalkgroupDirectoryEntry {
  system_id?: number
  system_name?: string
  tgid?: number
  alpha_tag?: string
  mode?: string
  description?: string
  tag?: string
  category?: string
  priority?: number | null
}

// =============================================================================
// Response Wrappers
// =============================================================================

export interface SystemListResponse {
  systems: System[]
  total: number
}

export interface P25SystemListResponse {
  systems: P25System[]
  total: number
}

export interface TalkgroupListResponse {
  talkgroups: Talkgroup[]
  total: number
  limit: number
  offset: number
}

export interface UnitListResponse {
  units: Unit[]
  total: number
  limit: number
  offset: number
}

export interface UnitEventListResponse {
  events: UnitEvent[]
  total: number
  limit: number
  offset: number
}

export interface CallListResponse {
  calls: Call[]
  total: number
  limit: number
  offset: number
}

export interface ActiveCallListResponse {
  calls: Call[]
  total: number
}

export interface CallGroupListResponse {
  call_groups: CallGroup[]
  total: number
  limit: number
  offset: number
}

export interface CallGroupDetailResponse {
  call_group: CallGroup
  calls: Call[]
}

export interface CallFrequencyListResponse {
  frequencies: CallFrequency[]
  total: number
}

export interface CallTransmissionListResponse {
  transmissions: CallTransmission[]
  total: number
}

export interface AffiliationListResponse {
  affiliations: Affiliation[]
  total: number
  limit: number
  offset: number
  summary: {
    talkgroup_counts: Record<string, number>
  }
}

export interface TalkgroupDirectoryListResponse {
  talkgroups: TalkgroupDirectoryEntry[]
  total: number
  limit: number
  offset: number
}

export interface TranscriptionSearchHit {
  id: number
  call_id: number
  text: string
  source?: string
  is_primary?: boolean
  word_count?: number
  duration_ms?: number
  created_at?: string
  rank?: number
  system_id?: number
  system_name?: string
  tgid?: number
  tg_alpha_tag?: string
  call_start_time?: string
  call_duration?: number | null
}

export interface TranscriptionSearchResponse {
  results: TranscriptionSearchHit[]
  total: number
  limit: number
  offset: number
}

export interface TranscriptionQueueStats {
  status: string
  pending?: number
  completed?: number
  failed?: number
}

export interface RecorderListResponse {
  recorders: Recorder[]
  total: number
}

// =============================================================================
// Stats Types
// =============================================================================

export interface StatsResponse {
  systems?: number
  talkgroups?: number
  units?: number
  total_calls?: number
  calls_24h?: number
  calls_1h?: number
  total_duration_hours?: number
  system_activity?: SystemActivity[]
}

export interface SystemActivity {
  system_id: number
  system_name?: string
  sysid?: string
  calls_1h?: number
  calls_24h?: number
  active_talkgroups?: number
  active_units?: number
}

export interface DecodeRate {
  time?: string
  system_id: number
  system_name?: string
  sys_name?: string
  sysid?: string
  decode_rate: number
  total_messages?: number
  control_channel?: number
}

export interface DecodeRatesResponse {
  rates: DecodeRate[]
  total: number
}

export interface TalkgroupActivity {
  system_id?: number
  system_name?: string
  tgid?: number
  tg_alpha_tag?: string
  tg_description?: string
  tg_tag?: string
  tg_group?: string
  call_count?: number
  total_duration?: number
  emergency_count?: number
  first_call?: string
  last_call?: string
}

export interface TalkgroupActivityResponse {
  activity: TalkgroupActivity[]
  total: number
}

export interface TalkgroupEncryptionStat {
  system_id?: number
  system_name?: string
  sysid?: string
  tgid?: number
  tg_alpha_tag?: string
  tg_description?: string
  tg_tag?: string
  tg_group?: string
  encrypted_count?: number
  clear_count?: number
  total_count?: number
  encrypted_pct?: number
}

export interface EncryptionStatsResponse {
  stats: TalkgroupEncryptionStat[]
  total: number
  hours?: number
}

// =============================================================================
// Health
// =============================================================================

export interface HealthResponse {
  status: string
  version?: string
  uptime_seconds?: number
  checks?: {
    database?: string
    mqtt?: string
    transcription?: string
  }
  trunk_recorders?: Array<{
    instance_id: string
    status: string
    last_seen?: string
  }>
}

// =============================================================================
// Admin
// =============================================================================

export interface SystemMergeRequest {
  source_id: number
  target_id: number
  update_target_metadata?: boolean
}

export interface SystemMergeResponse {
  target_id: number
  source_id: number
  calls_moved: number
  talkgroups_moved: number
  talkgroups_merged: number
  units_moved: number
  units_merged: number
  events_moved: number
}

export interface QueryRequest {
  sql: string
  params?: unknown[]
  limit?: number
}

export interface QueryResponse {
  columns: string[]
  rows: unknown[][]
  row_count: number
}

// =============================================================================
// Error Types
// =============================================================================

export interface ErrorResponse {
  error: string
  detail?: string
}

export interface AmbiguousError {
  error: string
  matches: Array<{
    system_id: number
    system_name?: string
    sysid?: string
  }>
}

// =============================================================================
// Patch Types (for PATCH requests)
// =============================================================================

export interface SystemPatch {
  sysid?: string
  wacn?: string
  name?: string
}

export interface SitePatch {
  short_name?: string
  instance_id?: string
  nac?: string
  rfss?: number
  p25_site_id?: number
}

export interface TalkgroupPatch {
  alpha_tag?: string
  alpha_tag_source?: string
  description?: string
  group?: string
  tag?: string
  priority?: number
}

export interface UnitPatch {
  alpha_tag?: string
  alpha_tag_source?: string
}
