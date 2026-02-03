// Core Entities

// A recording site (trunk-recorder instance) within a P25 system
export interface System {
  system_id: number          // Primary identifier, matches call.system_id
  id: number                 // Deprecated alias for system_id
  instance_id: number
  sys_num: number
  short_name: string
  system_type?: string
  // P25 system identifiers (shared across sites in the same P25 network)
  sysid?: string             // P25 System ID (e.g., "348" for Ohio MARCS)
  wacn?: string              // Wide Area Communication Network ID
  // Site-specific P25 identifiers (unique per recording site)
  nac?: string               // Network Access Code (e.g., "340" for butco)
  rfss?: number              // RF Subsystem number
  site_id?: number           // Site ID within the RFSS
}

// P25 system with nested recording sites
export interface P25System {
  sysid: string              // P25 System ID (e.g., "348")
  wacn: string               // Wide Area Communication Network ID
  sites: P25Site[]
}

export interface P25Site {
  short_name: string
  nac: string
  rfss: number
  site_id: number
  system_id: number          // Database ID, matches call.system_id
}

export interface Talkgroup {
  // Composite primary key: (sysid, tgid)
  sysid: string           // P25 System ID (hex string like "348")
  tgid: number            // Talkgroup ID
  alpha_tag?: string
  description?: string
  group?: string
  tag?: string
  priority: number
  mode?: string
  first_seen: string
  last_seen: string
  // Stats
  call_count?: number     // Total calls
  calls_1h?: number       // Calls in past hour
  calls_24h?: number      // Calls in past 24 hours
  unit_count?: number     // Unique units affiliated/talked
}

export interface Unit {
  // Composite primary key: (sysid, unit_id)
  sysid: string           // P25 System ID (hex string like "348")
  unit_id: number         // Radio ID
  alpha_tag?: string
  alpha_tag_source?: string
  first_seen: string
  last_seen: string
  last_event_type?: string
  last_event_tgid?: number
  last_event_tg_tag?: string
  last_event_time?: string
}

export interface CallUnit {
  unit_rid: number
  alpha_tag: string
}

export interface Call {
  id: number
  call_group_id?: number
  instance_id: number
  system_id: number
  recorder_id?: number
  tr_call_id?: string
  call_num: number
  start_time: string
  stop_time?: string
  duration: number
  call_state: number
  mon_state: number
  encrypted: boolean
  emergency: boolean
  phase2_tdma: boolean
  tdma_slot: number
  conventional: boolean
  analog: boolean
  audio_type: string
  freq: number
  freq_error?: number
  error_count?: number
  spike_count?: number
  signal_db?: number
  noise_db?: number
  audio_path?: string
  audio_url?: string           // API URL for audio (e.g., "/api/v1/calls/123/audio")
  audio_size?: number
  patched_tgids?: number[]
  metadata_json?: Record<string, unknown>
  // Joined talkgroup fields
  tg_sysid?: string            // Talkgroup's P25 system ID
  tgid?: number
  tg_alpha_tag?: string
  units?: CallUnit[]
}

export interface Transmission {
  id: number
  call_id: number
  unit_sysid?: string        // Unit's P25 system ID
  unit_rid: number           // Radio ID
  start_time: string
  stop_time?: string
  duration?: number | null   // can be -1, 0, or null due to data quality
  position?: number | null   // can be -1, 0, or null due to data quality
  emergency: boolean
  error_count?: number
  spike_count?: number
}

export interface CallFrequency {
  id: number
  call_id: number
  freq: number
  time: string
  position?: number | null   // can be -1, 0, or null due to data quality
  duration?: number | null   // can be -1, 0, or null due to data quality
  error_count?: number
  spike_count?: number
}

export interface UnitEvent {
  id: number
  instance_id: number
  system_id: number
  unit_sysid?: string        // Unit's P25 system ID
  unit_rid: number           // Radio ID
  event_type: EventType
  tg_sysid?: string          // Talkgroup's P25 system ID
  tgid: number
  time: string
  metadata_json?: Record<string, unknown>
}

export type EventType =
  | 'on'
  | 'off'
  | 'join'
  | 'call'
  | 'ackresp'
  | 'end'
  | 'leave'
  | 'data'
  | 'status_update'

export interface CallGroup {
  id: number
  system_id: number
  tg_sysid?: string          // Talkgroup's P25 system ID
  tgid: number
  start_time: string
  end_time?: string
  primary_call_id?: number
  call_count: number
  encrypted: boolean
  emergency: boolean
}

// Infrastructure Entities

export interface Instance {
  id: number
  instance_id: string
  instance_key?: string
  first_seen: string
  last_seen: string
  config_json?: Record<string, unknown>
}

export interface Source {
  id: number
  instance_id: number
  source_num: number
  center_freq: number
  rate: number
  driver: string
  device: string
  antenna: string
  gain: number
  config_json?: Record<string, unknown>
}

export interface Recorder {
  id: number
  instance_id: number
  source_id?: number
  rec_num: number
  rec_type: string
}

export interface RecorderStatus {
  id: number
  recorder_id: number
  time: string
  state: RecorderState
  freq?: number
  call_count: number
  duration: number
  squelched: boolean
}

export enum RecorderState {
  AVAILABLE = 0,
  RECORDING = 1,
  IDLE = 2,
}

export interface SystemRate {
  id: number
  system_id: number
  time: string
  decode_rate: number
  control_channel: number
}

// Response Wrappers

export interface ListResponse<T> {
  count: number
  limit: number
  offset: number
  [key: string]: T[] | number
}

export interface SystemListResponse {
  sites: System[]            // Renamed from "systems" to clarify these are recording sites
  count: number
}

export interface P25SystemListResponse {
  p25_systems: P25System[]
  count: number
}

export interface TalkgroupListResponse {
  talkgroups: Talkgroup[]
  count?: number
  limit: number
  offset: number
}

export interface UnitListResponse {
  units: Unit[]
  count: number
  limit: number
  offset: number
  window?: number
}

export interface CallListResponse {
  calls: Call[]
  count: number
  limit: number
  offset: number
}

export interface TransmissionListResponse {
  transmissions: Transmission[]
  count: number
}

export interface FrequencyListResponse {
  frequencies: CallFrequency[]
  count: number
}

export interface UnitEventListResponse {
  events: UnitEvent[]
  count: number
  limit: number
  offset: number
}

export interface CallGroupListResponse {
  call_groups: CallGroup[]
  count: number
  limit: number
  offset: number
}

export interface CallGroupDetailResponse {
  call_group: CallGroup
  calls: Call[]
}

export interface RecorderListResponse {
  recorders: RecorderStatus[]
  count: number
}

export interface StatsResponse {
  total_systems: number
  total_talkgroups: number
  total_units: number
  total_calls: number
  active_calls: number
  calls_last_hour: number
  calls_last_24h: number
  audio_files: number
  audio_bytes: number
}

export interface ActivityResponse {
  systems: number
  talkgroups: number
  units: number
  calls_24h: number
  system_activity: Array<{
    system: string
    call_count: number
  }>
}

export interface EncryptionStatsResponse {
  stats: Record<string, { encrypted: number; clear: number }>
  hours: number
}

export interface RatesResponse {
  rates: Array<{
    system_id: number
    short_name: string
    time: string
    decode_rate: number
    control_channel: number
  }>
  count: number
}

// Recent Call extended format
export interface RecentCallInfo {
  id?: number | null         // May be null in REST API responses
  call_id?: string           // Composite format: "sysid:tgid:timestamp"
  call_group_id?: number
  tr_call_id?: string
  call_num: number
  start_time: string
  stop_time?: string
  duration: number
  system: string
  sysid?: string             // P25 System ID (hex string like "348")
  tgid: number
  tg_alpha_tag?: string
  freq: number
  encrypted: boolean
  emergency: boolean
  audio_path?: string
  audio_url?: string         // API URL for audio
  has_audio: boolean
  units: Array<{
    unit_id: number
    unit_tag: string
  }>
}

export interface RecentCallsResponse {
  calls: RecentCallInfo[]
  count: number
}

// WebSocket Event Types

export type WebSocketEventType =
  | 'subscribed'
  | 'call_start'
  | 'call_end'
  | 'call_active'
  | 'audio_available'
  | 'unit_event'
  | 'rate_update'
  | 'recorder_update'

export interface WebSocketMessage<T = unknown> {
  event: WebSocketEventType
  timestamp: number
  data: T
}

export interface SubscriptionMessage {
  action: 'subscribe' | 'unsubscribe'
  channels: string[]
  systems?: string[]
  talkgroups?: number[]
  units?: number[]
}

export interface SubscribedData {
  action: string
  channels: string[]
  systems: string[]
  talkgroups: number[]
  units: number[]
}

export interface CallStartData {
  system: string
  sysid: string
  call_id: number
  tr_call_id?: string
  talkgroup: number
  talkgroup_alpha_tag?: string
  unit: number
  unit_alpha_tag?: string
  freq: number
  encrypted: boolean
  emergency: boolean
}

export interface CallEndData {
  system: string
  sysid: string
  call_id: number
  tr_call_id?: string
  talkgroup: number
  talkgroup_alpha_tag?: string
  unit: number
  unit_alpha_tag?: string
  duration: number
  encrypted: boolean
  emergency: boolean
  error_count?: number
  spike_count?: number
}

export interface CallActiveData {
  system: string
  sysid: string
  system_id: number
  talkgroup: number
  tg_alpha_tag?: string
  unit: number
  freq: number
  elapsed: number
  encrypted: boolean
  emergency: boolean
}

export interface AudioAvailableData {
  system: string
  sysid: string
  call_id: string              // Composite format: "sysid:tgid:timestamp"
  tr_call_id?: string
  talkgroup: number
  talkgroup_alpha_tag?: string
  audio_size: number
  duration: number
  transmissions: number
  frequencies: number
}

export interface UnitEventData {
  system: string
  sysid: string
  unit: number
  unit_tag?: string
  event_type: EventType
  talkgroup: number
}

export interface RateUpdateData {
  system: string
  sysid: string
  system_id: number
  decode_rate: number
  max_rate: number           // Max rate (40 for P25 Phase 1)
  control_channel: number
}

export interface RecorderUpdateData {
  system: string
  rec_num: number
  state: number
  state_name: string
  freq: number
  talkgroup: number
  tg_alpha_tag?: string
  unit: number
  unit_alpha_tag?: string
}

// Transcription Types

export interface TranscriptionWord {
  word: string
  start: number              // seconds from start of audio
  end: number                // seconds from start of audio
}

export interface Transcription {
  id: number
  call_id: number
  text: string
  words?: TranscriptionWord[]
  word_count: number
  confidence?: number
  language?: string
  model?: string
  provider?: string
  duration_ms?: number
  call_duration?: number     // seconds, for word timeline rendering
  created_at: string
}

export interface TranscriptionSearchResult {
  transcription: Transcription
  call: Call
}

export interface TranscriptionSearchResponse {
  results: TranscriptionSearchResult[]
  count: number
  limit: number
  offset: number
}

export interface TranscriptionQueueStats {
  pending: number
  processing: number
  completed: number
  failed: number
}

// Health check response
export interface HealthResponse {
  status: string
  version: string
}
