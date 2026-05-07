/**
 * API Types for tr-engine.
 *
 * Most exported types are aliases to the generated OpenAPI schemas.
 * Regenerate with: npm run api:generate
 */

import type { components } from './generated'

type Schema = components['schemas']

// =============================================================================
// Enums
// =============================================================================

export type SystemType = Schema['SystemType']
export type TalkgroupMode = Schema['TalkgroupMode']
export type EventType = Schema['EventType']
export type CallState = Schema['CallState']
export type MonState = Schema['MonState']
export type RecState = Schema['RecState']
export type TranscriptionStatus = Schema['TranscriptionStatus']
export type TranscriptionSource = Schema['TranscriptionSource']
export type SSEEventType = Schema['SSEEventType']

// =============================================================================
// Core Models
// =============================================================================

export type System = Omit<Schema['System'], 'sites'> & {
  sites?: Site[]
}
export type Site = Schema['Site'] & {
  system_id: number
}
export type P25System = Schema['P25System']
export type Talkgroup = Schema['Talkgroup']
export type Unit = Schema['Unit']
export type UnitEvent = Schema['UnitEvent']
export type Call = Omit<Schema['Call'], 'src_list' | 'freq_list'> & {
  src_list?: CallTransmission[]
  freq_list?: CallFrequency[]
}
export type CallUnit = Schema['CallUnit']
export type CallTransmission = Schema['CallTransmission'] & {
  src: number
  time: number
  pos: number
  duration: number
  emergency: number
}
export type CallFrequency = Schema['CallFrequency'] & {
  freq: number
  time: number
  pos: number
  len: number
}
export type CallGroup = Schema['CallGroup']
export type Transcription = Schema['Transcription']
export type AttributedWord = Schema['AttributedWord']
export type TranscriptionSegment = Schema['TranscriptionSegment']
export type Recorder = Schema['Recorder'] & {
  id: string
  src_num: number
  rec_num: number
  freq: number
  duration: number
  count: number
  instance_id?: string
  system_id?: number | null
}
export type Affiliation = Schema['Affiliation']
export type TalkgroupDirectoryEntry = Schema['TalkgroupDirectoryEntry']

// =============================================================================
// Response Wrappers
// =============================================================================

export interface SystemListResponse extends Omit<Schema['SystemListResponse'], 'systems'> {
  systems: System[]
}
export type P25SystemListResponse = Schema['P25SystemListResponse']
export type TalkgroupListResponse = Schema['TalkgroupListResponse']
export type UnitListResponse = Schema['UnitListResponse']
export type UnitEventListResponse = Schema['UnitEventListResponse']
export interface CallListResponse extends Omit<Schema['CallListResponse'], 'calls'> {
  calls: Call[]
}
export interface ActiveCallListResponse extends Omit<Schema['ActiveCallListResponse'], 'calls'> {
  calls: Call[]
}
export interface CallGroupListResponse extends Omit<Schema['CallGroupListResponse'], 'call_groups'> {
  call_groups: CallGroup[]
}
export interface CallGroupDetailResponse extends Omit<Schema['CallGroupDetailResponse'], 'call_group' | 'calls'> {
  call_group: CallGroup
  calls: Call[]
}
export interface CallFrequencyListResponse extends Omit<Schema['CallFrequencyListResponse'], 'frequencies'> {
  frequencies: CallFrequency[]
}
export interface CallTransmissionListResponse extends Omit<Schema['CallTransmissionListResponse'], 'transmissions'> {
  transmissions: CallTransmission[]
}
export type AffiliationListResponse = Schema['AffiliationListResponse']
export interface TalkgroupDirectoryListResponse {
  talkgroups: TalkgroupDirectoryEntry[]
  total: number
  limit: number
  offset: number
}
export type TranscriptionSearchHit = Schema['TranscriptionSearchHit'] & {
  id: number
  call_id: number
  text: string
}
export interface TranscriptionSearchResponse extends Omit<Schema['TranscriptionSearchResponse'], 'results'> {
  results: TranscriptionSearchHit[]
}
export type TranscriptionQueueStats = Schema['TranscriptionQueueStats']
export interface RecorderListResponse extends Omit<Schema['RecorderListResponse'], 'recorders'> {
  recorders: Recorder[]
}

// =============================================================================
// Stats Types
// =============================================================================

export type SystemActivity = Schema['SystemActivity'] & {
  system_id: number
}
export interface StatsResponse extends Omit<Schema['StatsResponse'], 'system_activity'> {
  system_activity?: SystemActivity[]
}
export type DecodeRate = Schema['DecodeRate'] & {
  system_id: number
  sys_name?: string
  decode_rate: number
  total_messages?: number
}
export interface DecodeRatesResponse extends Omit<Schema['DecodeRatesResponse'], 'rates'> {
  rates: DecodeRate[]
}
export type TalkgroupActivity = Schema['TalkgroupActivity']
export interface TalkgroupActivityResponse {
  activity: TalkgroupActivity[]
  total: number
}
export type TalkgroupEncryptionStat = Schema['TalkgroupEncryptionStat']
export type EncryptionStatsResponse = Schema['EncryptionStatsResponse']

// =============================================================================
// Health
// =============================================================================

export interface HealthResponse extends Omit<Schema['HealthResponse'], 'trunk_recorders'> {
  trunk_recorders?: Array<{
    instance_id: string
    status: string
    last_seen?: string
  }>
}

// =============================================================================
// Admin
// =============================================================================

export interface SystemMergeRequest extends Omit<Schema['SystemMergeRequest'], 'update_target_metadata'> {
  update_target_metadata?: boolean
}
export type SystemMergeResponse = Schema['SystemMergeResponse']
export type MaintenanceConfig = Schema['MaintenanceConfig'] & {
  retention_calls?: string
}
export type MaintenanceRun = Schema['MaintenanceRun'] & {
  started_at: string
  completed_at?: string
  calls_deleted?: number
  raw_messages_deleted?: number
  console_logs_deleted?: number
  errors?: string[]
}
export interface MaintenanceStatusResponse extends Omit<Schema['MaintenanceStatus'], 'config' | 'last_run'> {
  config?: MaintenanceConfig
  last_run?: MaintenanceRun | null
  running?: boolean
}
export type MaintenanceRunResponse = MaintenanceRun

// =============================================================================
// Error Types
// =============================================================================

export type ErrorResponse = Schema['Error']
export type AmbiguousError = Schema['AmbiguousError']

// =============================================================================
// Patch Types (for PATCH requests)
// =============================================================================

export type SystemPatch = Schema['SystemPatch']
export type SitePatch = Schema['SitePatch']
export type TalkgroupPatch = Schema['TalkgroupPatch']
export type UnitPatch = Schema['UnitPatch']
