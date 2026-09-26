// Pure helpers for the Admin page's maintenance summary, built from what
// GET /admin/maintenance reports. Tested by scripts/test-auth-state.mjs.
import type { MaintenanceConfig, MaintenanceRun } from '@/api/types'

/** Every retention setting tr-engine reports, in display order (calls are kept forever: no setting) */
const RETENTION_SETTINGS = [
  ['Raw Messages', 'retention_raw_messages'],
  ['Console Logs', 'retention_console_logs'],
  ['Plugin Status', 'retention_plugin_status'],
  ['Trunking Messages', 'retention_trunking_messages'],
  ['Checkpoints', 'retention_checkpoints'],
  ['Stale Calls', 'retention_stale_calls'],
  ['Audit Log', 'retention_audit_log'],
] as const

export type RetentionKey = (typeof RETENTION_SETTINGS)[number][1]

export interface RetentionRow {
  key: RetentionKey
  label: string
  value: string
  /** Where the value comes from: `env` (locked), `db` (set through the API) or `default` */
  source?: 'env' | 'db' | 'default'
  locked: boolean
}

/** The retention settings the engine reported, with their source */
export function retentionRows(config: MaintenanceConfig): RetentionRow[] {
  const rows: RetentionRow[] = []
  for (const [label, key] of RETENTION_SETTINGS) {
    const value = config[key]
    if (!value) continue
    rows.push({
      key,
      label,
      value,
      source: config[`${key}_source` as const],
      locked: config[`${key}_locked` as const] === true,
    })
  }
  return rows
}

/** Short text for where a retention value comes from */
export function describeRetentionSource(row: Pick<RetentionRow, 'source' | 'locked'>): string {
  switch (row.source) {
    case 'env':
      return row.locked ? 'environment (locked)' : 'environment'
    case 'db':
      return 'set through the API'
    case 'default':
      return 'default'
    default:
      return row.locked ? 'locked' : ''
  }
}

export interface RunSummary {
  durationMs?: number
  partitionsCreated: number
  partitionsDropped: string[]
  /** Rows purged per table, largest first, zero counts left out */
  purged: Array<[table: string, rows: number]>
  purgedTotal: number
  /** Rows removed by decimation (both phases) per table, zero counts left out */
  decimated: Array<[table: string, rows: number]>
  decimatedTotal: number
}

/** What a maintenance run did, from the fields tr-engine reports */
export function summarizeRun(run: MaintenanceRun): RunSummary {
  const purged = Object.entries(run.purged ?? {})
    .filter(([, n]) => typeof n === 'number' && n > 0)
    .sort((a, b) => b[1] - a[1])
  const decimated = Object.entries(run.decimation ?? {})
    .map(([table, d]): [string, number] => [table, (d?.phase1_deleted ?? 0) + (d?.phase2_deleted ?? 0)])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
  return {
    durationMs: run.duration_ms,
    partitionsCreated: run.partitions_created ?? 0,
    partitionsDropped: run.partitions_dropped ?? [],
    purged,
    purgedTotal: purged.reduce((sum, [, n]) => sum + n, 0),
    decimated,
    decimatedTotal: decimated.reduce((sum, [, n]) => sum + n, 0),
  }
}
