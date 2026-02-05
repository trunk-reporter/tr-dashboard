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
  sysid?: string
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

export interface TalkgroupColorsState {
  rules: ColorRule[]
  overrides: Record<string, TalkgroupOverride> // key is "sysid:tgid"
  colorCache: Map<string, string | null> // key is "sysid:tgid", value is hex color (e.g., "#3b82f6") or null

  // Actions for rules
  setRules: (rules: ColorRule[]) => void
  addRule: (rule: ColorRule) => void
  updateRule: (index: number, rule: ColorRule) => void
  deleteRule: (index: number) => void
  moveRule: (fromIndex: number, toIndex: number) => void
  resetToDefaults: () => void

  // Actions for per-talkgroup overrides
  setOverride: (sysid: string, tgid: number, override: TalkgroupOverride | null) => void
  getOverride: (sysid: string, tgid: number) => TalkgroupOverride | null
  clearAllOverrides: () => void

  // Utility - these check overrides first, then fall back to keyword rules
  getColorForTalkgroup: (fields: TalkgroupFields) => string | null
  getCachedColor: (sysid: string, tgid: number, fields: TalkgroupFields) => string | null
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
      colorCache: new Map(),

      // Rule actions - all clear the color cache
      setRules: (rules) => set({ rules, colorCache: new Map() }),

      addRule: (rule) => set((state) => ({ rules: [...state.rules, rule], colorCache: new Map() })),

      updateRule: (index, rule) =>
        set((state) => ({
          rules: state.rules.map((r, i) => (i === index ? rule : r)),
          colorCache: new Map(),
        })),

      deleteRule: (index) =>
        set((state) => ({
          rules: state.rules.filter((_, i) => i !== index),
          colorCache: new Map(),
        })),

      moveRule: (fromIndex, toIndex) =>
        set((state) => {
          const rules = [...state.rules]
          const [removed] = rules.splice(fromIndex, 1)
          rules.splice(toIndex, 0, removed)
          return { rules, colorCache: new Map() }
        }),

      resetToDefaults: () => set({ rules: DEFAULT_RULES, overrides: {}, colorCache: new Map() }),

      // Override actions - clear cache for affected talkgroup
      setOverride: (sysid, tgid, override) => {
        const key = `${sysid}:${tgid}`
        set((state) => {
          const newOverrides = { ...state.overrides }
          const newColorCache = new Map(state.colorCache)
          newColorCache.delete(key) // Clear cached color for this talkgroup
          if (override === null || override.mode === 'default') {
            delete newOverrides[key]
          } else {
            newOverrides[key] = override
          }
          return { overrides: newOverrides, colorCache: newColorCache }
        })
      },

      getOverride: (sysid, tgid) => {
        const key = `${sysid}:${tgid}`
        return get().overrides[key] || null
      },

      clearAllOverrides: () => set({ overrides: {}, colorCache: new Map() }),

      // Utility functions
      getRuleForTalkgroup: (fields) => {
        // Build array of strings to match against
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
        if (fields.sysid !== undefined && fields.tgid !== undefined) {
          const override = get().getOverride(fields.sysid, fields.tgid)
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

      // Get color with caching - returns hex color or null
      getCachedColor: (sysid, tgid, fields) => {
        const key = `${sysid}:${tgid}`
        const { colorCache } = get()

        // Check cache first
        if (colorCache.has(key)) {
          return colorCache.get(key) ?? null
        }

        // Compute color and convert to hex
        const colorName = get().getColorForTalkgroup(fields)
        const hexColor = colorName ? getHexFromTailwind(colorName) : null

        // Cache the hex result (even if null)
        set((state) => {
          const newCache = new Map(state.colorCache)
          newCache.set(key, hexColor)
          return { colorCache: newCache }
        })

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
      version: 2,
      // Don't persist colorCache - it's a runtime cache
      partialize: (state) => ({ rules: state.rules, overrides: state.overrides }),
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as { rules?: ColorRule[]; overrides?: Record<string, TalkgroupOverride> }

        if (version < 1) {
          // Migration v0 -> v1: add 'mode' field to existing rules
          if (state.rules) {
            state.rules = state.rules.map((rule) => ({
              ...rule,
              mode: rule.mode || 'color',
            }))
          }
        }

        if (version < 2) {
          // Migration v1 -> v2: add overrides object
          state.overrides = state.overrides || {}
        }

        return state as TalkgroupColorsState
      },
    }
  )
)
