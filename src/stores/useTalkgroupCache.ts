import { create } from 'zustand'
import type { Talkgroup } from '@/api/types'

interface TalkgroupInfo {
  sysid: string       // P25 system ID
  tgid: number        // radio talkgroup ID
  alphaTag?: string
  description?: string
  group?: string
  tag?: string
}

// Helper to create composite key
export function talkgroupKey(sysid: string, tgid: number): string {
  return `${sysid}:${tgid}`
}

// Helper to parse composite key
export function parseTalkgroupKey(key: string): { sysid: string; tgid: number } | null {
  const parts = key.split(':')
  if (parts.length !== 2) return null
  const tgid = parseInt(parts[1], 10)
  if (isNaN(tgid)) return null
  return { sysid: parts[0], tgid }
}

interface TalkgroupCacheState {
  // Map from "sysid:tgid" to talkgroup info
  cache: Map<string, TalkgroupInfo>

  // Actions
  addTalkgroup: (tg: Talkgroup) => void
  addTalkgroups: (tgs: Talkgroup[]) => void
  addFromCall: (sysid: string, tgid: number, alphaTag?: string) => void
  getInfo: (sysid: string, tgid: number) => TalkgroupInfo | undefined
  getAlphaTag: (sysid: string, tgid: number) => string | undefined

  // Lookup by tgid only (returns first match - use when sysid unknown)
  getAlphaTagByTgid: (tgid: number) => string | undefined
}

export const useTalkgroupCache = create<TalkgroupCacheState>((set, get) => ({
  cache: new Map(),

  addTalkgroup: (tg) =>
    set((state) => {
      const key = talkgroupKey(tg.sysid, tg.tgid)
      const newCache = new Map(state.cache)
      newCache.set(key, {
        sysid: tg.sysid,
        tgid: tg.tgid,
        alphaTag: tg.alpha_tag,
        description: tg.description,
        group: tg.group,
        tag: tg.tag,
      })
      return { cache: newCache }
    }),

  addTalkgroups: (tgs) =>
    set((state) => {
      const newCache = new Map(state.cache)
      for (const tg of tgs) {
        const key = talkgroupKey(tg.sysid, tg.tgid)
        newCache.set(key, {
          sysid: tg.sysid,
          tgid: tg.tgid,
          alphaTag: tg.alpha_tag,
          description: tg.description,
          group: tg.group,
          tag: tg.tag,
        })
      }
      return { cache: newCache }
    }),

  // Add from WebSocket/call data
  addFromCall: (sysid, tgid, alphaTag) =>
    set((state) => {
      const key = talkgroupKey(sysid, tgid)
      const existing = state.cache.get(key)

      // If we already have this talkgroup, only update if we're adding new info
      if (existing) {
        if (!existing.alphaTag && alphaTag) {
          const newCache = new Map(state.cache)
          newCache.set(key, { ...existing, alphaTag })
          return { cache: newCache }
        }
        return state
      }

      // Add new entry
      const newCache = new Map(state.cache)
      newCache.set(key, { sysid, tgid, alphaTag })
      return { cache: newCache }
    }),

  getInfo: (sysid, tgid) => get().cache.get(talkgroupKey(sysid, tgid)),

  getAlphaTag: (sysid, tgid) => get().cache.get(talkgroupKey(sysid, tgid))?.alphaTag,

  // Fallback lookup when sysid is unknown - returns first match
  getAlphaTagByTgid: (tgid) => {
    for (const info of get().cache.values()) {
      if (info.tgid === tgid) {
        return info.alphaTag
      }
    }
    return undefined
  },
}))
