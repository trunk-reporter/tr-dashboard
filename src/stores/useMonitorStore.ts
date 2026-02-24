import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { talkgroupKey, parseTalkgroupKey } from '@/lib/utils'

interface MonitorState {
  // Monitored talkgroups (by "systemId:tgid" key)
  monitoredTalkgroups: Set<string>
  // Whether monitoring is active (master switch)
  isMonitoring: boolean

  // Actions
  toggleTalkgroupMonitor: (systemId: number, tgid: number) => void
  addTalkgroupMonitor: (systemId: number, tgid: number) => void
  removeTalkgroupMonitor: (systemId: number, tgid: number) => void
  clearAllMonitors: () => void
  setMonitoring: (enabled: boolean) => void
  toggleMonitoring: () => void
  isMonitored: (systemId: number, tgid: number) => boolean

  // Check if any talkgroup with this tgid is monitored (for when systemId unknown)
  isMonitoredByTgid: (tgid: number) => boolean

  // Get all monitored talkgroup keys
  getMonitoredKeys: () => string[]
}

export const useMonitorStore = create<MonitorState>()(
  persist(
    (set, get) => ({
      monitoredTalkgroups: new Set(),
      isMonitoring: false,

      toggleTalkgroupMonitor: (systemId, tgid) =>
        set((state) => {
          const key = talkgroupKey(systemId, tgid)
          const newSet = new Set(state.monitoredTalkgroups)
          if (newSet.has(key)) {
            newSet.delete(key)
            return {
              monitoredTalkgroups: newSet,
              isMonitoring: newSet.size > 0 ? state.isMonitoring : false
            }
          } else {
            newSet.add(key)
            return { monitoredTalkgroups: newSet, isMonitoring: true }
          }
        }),

      addTalkgroupMonitor: (systemId, tgid) =>
        set((state) => {
          const key = talkgroupKey(systemId, tgid)
          const newSet = new Set(state.monitoredTalkgroups)
          newSet.add(key)
          return { monitoredTalkgroups: newSet, isMonitoring: true }
        }),

      removeTalkgroupMonitor: (systemId, tgid) =>
        set((state) => {
          const key = talkgroupKey(systemId, tgid)
          const newSet = new Set(state.monitoredTalkgroups)
          newSet.delete(key)
          return { monitoredTalkgroups: newSet }
        }),

      clearAllMonitors: () => set({ monitoredTalkgroups: new Set() }),

      setMonitoring: (enabled) => set({ isMonitoring: enabled }),

      toggleMonitoring: () => set((state) => ({ isMonitoring: !state.isMonitoring })),

      isMonitored: (systemId, tgid) => get().monitoredTalkgroups.has(talkgroupKey(systemId, tgid)),

      isMonitoredByTgid: (tgid) => {
        for (const key of get().monitoredTalkgroups) {
          const parsed = parseTalkgroupKey(key)
          if (parsed && parsed.tgid === tgid) {
            return true
          }
        }
        return false
      },

      getMonitoredKeys: () => Array.from(get().monitoredTalkgroups),
    }),
    {
      name: 'tr-dashboard-monitor',
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name)
          if (!str) return null
          const parsed = JSON.parse(str)
          if (parsed.state?.monitoredTalkgroups) {
            const keys = parsed.state.monitoredTalkgroups as string[]
            // Migration: clear stale old-format keys (P25 sysid strings like "348:9178")
            // New format uses integer system_id (small numbers like "1:9178")
            const valid = keys.filter((key: string) => {
              const result = parseTalkgroupKey(key)
              return result !== null
            })
            parsed.state.monitoredTalkgroups = new Set(valid)
          }
          return parsed
        },
        setItem: (name, value) => {
          const toStore = {
            ...value,
            state: {
              ...value.state,
              monitoredTalkgroups: Array.from(value.state.monitoredTalkgroups),
            },
          }
          localStorage.setItem(name, JSON.stringify(toStore))
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
)
