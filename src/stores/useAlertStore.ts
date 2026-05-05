import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AlertTriggerType = 'keyword' | 'talkgroup' | 'unit' | 'emergency'

export interface AlertRule {
  id: string
  label: string
  enabled: boolean
  trigger: AlertTriggerType
  value: string
  cooldownMs: number
}

export interface AlertEvent {
  ruleId: string
  label: string
  message: string
  timestamp: number
}

interface AlertState {
  rules: AlertRule[]
  history: AlertEvent[]
  addRule: (rule: Omit<AlertRule, 'id'>) => void
  updateRule: (id: string, patch: Partial<AlertRule>) => void
  removeRule: (id: string) => void
  moveRule: (fromIndex: number, toIndex: number) => void
  addEvent: (event: Omit<AlertEvent, 'timestamp'>) => void
  clearHistory: () => void
}

let nextId = 1
function genId(): string {
  return `alert-${nextId++}`
}

export const useAlertStore = create<AlertState>()(
  persist(
    (set) => ({
      rules: [],
      history: [],

      addRule: (rule) =>
        set((state) => ({
          rules: [...state.rules, { ...rule, id: genId() }],
        })),

      updateRule: (id, patch) =>
        set((state) => ({
          rules: state.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        })),

      removeRule: (id) =>
        set((state) => ({
          rules: state.rules.filter((r) => r.id !== id),
        })),

      moveRule: (fromIndex, toIndex) =>
        set((state) => {
          const rules = [...state.rules]
          const [moved] = rules.splice(fromIndex, 1)
          rules.splice(toIndex, 0, moved)
          return { rules }
        }),

      addEvent: (event) =>
        set((state) => ({
          history: [
            { ...event, timestamp: Date.now() },
            ...state.history,
          ].slice(0, 200),
        })),

      clearHistory: () => set({ history: [] }),
    }),
    {
      name: 'tr-dashboard-alerts',
      version: 1,
    }
  )
)
