import { Button } from '@/components/ui/button'
import { TalkgroupMultiSelect } from '@/components/calls/TalkgroupMultiSelect'
import type { Restriction, System } from '@/api/types'
import { cn } from '@/lib/utils'

/**
 * Editable form of a Restriction (§3.2 of the API-key design):
 *   none     → null: unrestricted
 *   all      → { allow_all: true, exclude_talkgroups }
 *   selected → { systems, talkgroups, exclude_talkgroups }
 * An empty `selected` allows nothing, which keys and the anonymous policy
 * reject; restrictionAllowsNothing() lets forms block saving it.
 */
export interface RestrictionDraft {
  mode: 'none' | 'all' | 'selected'
  systems: number[]
  talkgroups: string[]
  exclude: string[]
}

export const EMPTY_DRAFT: RestrictionDraft = { mode: 'none', systems: [], talkgroups: [], exclude: [] }

export function draftFromRestriction(r: Restriction | null | undefined): RestrictionDraft {
  if (!r) return EMPTY_DRAFT
  return {
    mode: r.allow_all ? 'all' : 'selected',
    systems: r.allow_all ? [] : [...(r.systems ?? [])],
    talkgroups: r.allow_all ? [] : [...(r.talkgroups ?? [])],
    exclude: [...(r.exclude_talkgroups ?? [])],
  }
}

export function restrictionFromDraft(d: RestrictionDraft): Restriction | null {
  switch (d.mode) {
    case 'none':
      return null
    case 'all':
      return { allow_all: true, systems: [], talkgroups: [], exclude_talkgroups: d.exclude }
    case 'selected':
      return { allow_all: false, systems: d.systems, talkgroups: d.talkgroups, exclude_talkgroups: d.exclude }
  }
}

export function restrictionAllowsNothing(d: RestrictionDraft): boolean {
  return d.mode === 'selected' && d.systems.length === 0 && d.talkgroups.length === 0
}

/** One-line description of a restriction, for tables */
export function describeRestriction(r: Restriction | null | undefined, systems: System[]): string {
  if (!r) return 'all talkgroups'
  const sysName = (id: number) => systems.find((s) => s.system_id === id)?.name || `system ${id}`
  const parts: string[] = []
  if (r.allow_all) {
    parts.push('all talkgroups')
  } else {
    if (r.systems?.length) parts.push(r.systems.map(sysName).join(', '))
    if (r.talkgroups?.length) parts.push(`${r.talkgroups.length} talkgroup${r.talkgroups.length === 1 ? '' : 's'}`)
    if (parts.length === 0) parts.push('nothing')
  }
  const excluded = r.exclude_talkgroups?.length ?? 0
  if (excluded) parts.push(`except ${excluded} talkgroup${excluded === 1 ? '' : 's'}`)
  return parts.join(' + ').replace(' + except', ' except')
}

const HEADING = 'mb-1 block text-xs font-medium text-muted-foreground'

interface RestrictionEditorProps {
  value: RestrictionDraft
  onChange: (value: RestrictionDraft) => void
  systems: System[]
  /** Label for the unrestricted choice */
  noneLabel?: string
  disabled?: boolean
}

export function RestrictionEditor({ value, onChange, systems, noneLabel = 'Everything', disabled }: RestrictionEditorProps) {
  const set = (patch: Partial<RestrictionDraft>) => onChange({ ...value, ...patch })
  const modes: { mode: RestrictionDraft['mode']; label: string }[] = [
    { mode: 'none', label: noneLabel },
    { mode: 'all', label: 'All talkgroups except…' },
    { mode: 'selected', label: 'Only selected systems/talkgroups' },
  ]

  const toggleSystem = (id: number) => {
    set({ systems: value.systems.includes(id) ? value.systems.filter((s) => s !== id) : [...value.systems, id].sort((a, b) => a - b) })
  }

  return (
    <div className={cn('space-y-3', disabled && 'pointer-events-none opacity-60')}>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Restriction">
        {modes.map((m) => (
          <Button
            key={m.mode}
            type="button"
            size="sm"
            role="radio"
            aria-checked={value.mode === m.mode}
            variant={value.mode === m.mode ? 'default' : 'outline'}
            onClick={() => set({ mode: m.mode })}
          >
            {m.label}
          </Button>
        ))}
      </div>

      {value.mode === 'selected' && (
        <div className="space-y-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Systems (all their talkgroups)</p>
            {systems.length === 0 ? (
              <p className="text-xs text-muted-foreground">No systems yet.</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {systems.map((sys) => (
                  <label key={sys.system_id} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={value.systems.includes(sys.system_id)}
                      onChange={() => toggleSystem(sys.system_id)}
                    />
                    {sys.name || `System ${sys.system_id}`}
                    <span className="text-xs text-muted-foreground">#{sys.system_id}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div>
            <TalkgroupMultiSelect
              label="Individually allowed talkgroups"
              labelClassName={HEADING}
              selected={value.talkgroups}
              onSelectionChange={(keys) => set({ talkgroups: keys })}
              talkgroups={[]}
            />
          </div>
        </div>
      )}

      {value.mode !== 'none' && (
        <div>
          <TalkgroupMultiSelect
            label="Excluded talkgroups (never allowed)"
            labelClassName={HEADING}
            selected={value.exclude}
            onSelectionChange={(keys) => set({ exclude: keys })}
            talkgroups={[]}
          />
        </div>
      )}
    </div>
  )
}
