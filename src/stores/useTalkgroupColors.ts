import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getHexFromTailwind } from '@/components/ui/color-picker'

export type RuleMode = 'color' | 'hide' | 'highlight'
export type OverrideMode = RuleMode | 'default' // 'default' means use keyword rules

export interface ColorRule {
  label: string
  keywords: string[]
  color: string // Tailwind color name, e.g., "blue-500"
  mode: RuleMode // 'color' = border color, 'hide' = filter out, 'highlight' = prominent display
}

export interface TalkgroupOverride {
  mode: OverrideMode
  color?: string // used when mode is 'color' or 'highlight'
}

// Fields to match keywords against
export interface TalkgroupFields {
  alpha_tag?: string
  description?: string
  group?: string
  tag?: string
  system_id?: number
  tgid?: number
}

/**
 * Match a keyword pattern against text with wildcard support.
 *
 * Patterns:
 *   "osp"    → whole word match (word boundaries)
 *   "*osp*"  → substring match anywhere
 *   "osp*"   → word starting with "osp"
 *   "*osp"   → word ending with "osp"
 */
function matchKeyword(keyword: string, text: string): boolean {
  const kw = keyword.toLowerCase().trim()
  const str = text.toLowerCase()

  if (!kw || kw === '*' || kw === '**') return false

  const startsWithWildcard = kw.startsWith('*')
  const endsWithWildcard = kw.endsWith('*')

  // Remove wildcards to get the core pattern
  let pattern = kw
  if (startsWithWildcard) pattern = pattern.slice(1)
  if (endsWithWildcard) pattern = pattern.slice(0, -1)

  if (!pattern) return false

  // Escape regex special characters in the pattern
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  let regex: RegExp
  if (startsWithWildcard && endsWithWildcard) {
    // *osp* → substring match anywhere
    regex = new RegExp(escaped, 'i')
  } else if (startsWithWildcard) {
    // *osp → word ending with pattern
    regex = new RegExp(escaped + '\\b', 'i')
  } else if (endsWithWildcard) {
    // osp* → word starting with pattern
    regex = new RegExp('\\b' + escaped, 'i')
  } else {
    // osp → whole word match
    regex = new RegExp('\\b' + escaped + '\\b', 'i')
  }

  return regex.test(str)
}

// Module-level color cache — lives outside Zustand state so reads/writes
// don't trigger React re-renders. Cleared whenever rules or overrides change.
let colorCache = new Map<string, string | null>()

export function clearColorCache() {
  colorCache = new Map()
}

export interface TalkgroupColorsState {
  rules: ColorRule[]
  overrides: Record<string, TalkgroupOverride> // key is "system_id:tgid"

  // Actions for rules
  setRules: (rules: ColorRule[]) => void
  addRule: (rule: ColorRule) => void
  updateRule: (index: number, rule: ColorRule) => void
  deleteRule: (index: number) => void
  moveRule: (fromIndex: number, toIndex: number) => void
  resetToDefaults: () => void

  // Actions for per-talkgroup overrides
  setOverride: (systemId: number, tgid: number, override: TalkgroupOverride | null) => void
  getOverride: (systemId: number, tgid: number) => TalkgroupOverride | null
  clearAllOverrides: () => void

  // Utility - these check overrides first, then fall back to keyword rules
  getColorForTalkgroup: (fields: TalkgroupFields) => string | null
  getCachedColor: (systemId: number, tgid: number, fields: TalkgroupFields) => string | null
  shouldHideTalkgroup: (fields: TalkgroupFields) => boolean
  shouldHighlightTalkgroup: (fields: TalkgroupFields) => boolean
  getRuleForTalkgroup: (fields: TalkgroupFields) => ColorRule | null
  getEffectiveStyle: (fields: TalkgroupFields) => { mode: RuleMode | null; color: string | null }
}

const DEFAULT_RULES: ColorRule[] = [
  { label: 'Law', keywords: ['law', 'police'], color: 'blue-500', mode: 'color' },
  { label: 'Fire', keywords: ['fire'], color: 'red-500', mode: 'color' },
  { label: 'EMS', keywords: ['ems', 'medical', 'hospital'], color: 'green-500', mode: 'color' },
  { label: 'Dispatch', keywords: ['dispatch', 'interop', 'multi'], color: 'purple-500', mode: 'color' },
  { label: 'Public Works', keywords: ['public', 'works', 'transport', 'highway'], color: 'amber-500', mode: 'color' },
  { label: 'Schools', keywords: ['school', 'security', 'campus'], color: 'cyan-500', mode: 'color' },
  { label: 'Corrections', keywords: ['corrections', 'jail', 'prison'], color: 'slate-500', mode: 'color' },
]

export const useTalkgroupColors = create<TalkgroupColorsState>()(
  persist(
    (set, get) => ({
      rules: DEFAULT_RULES,
      overrides: {},

      // Rule actions - all clear the color cache
      setRules: (rules) => { clearColorCache(); set({ rules }) },

      addRule: (rule) => { clearColorCache(); set((state) => ({ rules: [...state.rules, rule] })) },

      updateRule: (index, rule) => {
        clearColorCache()
        set((state) => ({
          rules: state.rules.map((r, i) => (i === index ? rule : r)),
        }))
      },

      deleteRule: (index) => {
        clearColorCache()
        set((state) => ({
          rules: state.rules.filter((_, i) => i !== index),
        }))
      },

      moveRule: (fromIndex, toIndex) => {
        clearColorCache()
        set((state) => {
          const rules = [...state.rules]
          const [removed] = rules.splice(fromIndex, 1)
          rules.splice(toIndex, 0, removed)
          return { rules }
        })
      },

      resetToDefaults: () => { clearColorCache(); set({ rules: DEFAULT_RULES, overrides: {} }) },

      // Override actions
      setOverride: (systemId, tgid, override) => {
        const key = `${systemId}:${tgid}`
        colorCache.delete(key)
        set((state) => {
          const newOverrides = { ...state.overrides }
          if (override === null || override.mode === 'default') {
            delete newOverrides[key]
          } else {
            newOverrides[key] = override
          }
          return { overrides: newOverrides }
        })
      },

      getOverride: (systemId, tgid) => {
        const key = `${systemId}:${tgid}`
        return get().overrides[key] || null
      },

      clearAllOverrides: () => { clearColorCache(); set({ overrides: {} }) },

      // Utility functions
      getRuleForTalkgroup: (fields) => {
        const searchStrings = [
          fields.alpha_tag,
          fields.description,
          fields.group,
          fields.tag,
        ].filter(Boolean) as string[]

        const { rules } = get()

        for (const rule of rules) {
          for (const keyword of rule.keywords) {
            for (const str of searchStrings) {
              if (matchKeyword(keyword, str)) {
                return rule
              }
            }
          }
        }

        return null
      },

      getEffectiveStyle: (fields) => {
        // Check for per-talkgroup override first
        if (fields.system_id !== undefined && fields.tgid !== undefined) {
          const override = get().getOverride(fields.system_id, fields.tgid)
          if (override && override.mode !== 'default') {
            return {
              mode: override.mode,
              color: override.color || null,
            }
          }
        }

        // Fall back to keyword rules
        const rule = get().getRuleForTalkgroup(fields)
        if (rule) {
          return {
            mode: rule.mode,
            color: rule.color,
          }
        }

        return { mode: null, color: null }
      },

      getColorForTalkgroup: (fields) => {
        const style = get().getEffectiveStyle(fields)
        if (style.mode === 'color' || style.mode === 'highlight') {
          return style.color
        }
        return null
      },

      getCachedColor: (systemId, tgid, fields) => {
        const key = `${systemId}:${tgid}`

        if (colorCache.has(key)) {
          return colorCache.get(key) ?? null
        }

        const colorName = get().getColorForTalkgroup(fields)
        const hexColor = colorName ? getHexFromTailwind(colorName) : null

        // Write to module-level cache — no store mutation, safe during render
        colorCache.set(key, hexColor)

        return hexColor
      },

      shouldHideTalkgroup: (fields) => {
        const style = get().getEffectiveStyle(fields)
        return style.mode === 'hide'
      },

      shouldHighlightTalkgroup: (fields) => {
        const style = get().getEffectiveStyle(fields)
        return style.mode === 'highlight'
      },
    }),
    {
      name: 'tr-dashboard-talkgroup-colors',
      version: 3,
      partialize: (state) => ({ rules: state.rules, overrides: state.overrides }),
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as { rules?: ColorRule[]; overrides?: Record<string, TalkgroupOverride> }

        if (version < 1) {
          if (state.rules) {
            state.rules = state.rules.map((rule) => ({
              ...rule,
              mode: rule.mode || 'color',
            }))
          }
        }

        if (version < 2) {
          state.overrides = state.overrides || {}
        }

        if (version < 3) {
          // Migration v2 -> v3: clear overrides that used old sysid:tgid format
          // New format uses integer system_id:tgid — can't reliably map old keys
          state.overrides = {}
        }

        return state as TalkgroupColorsState
      },
    }
  )
)
