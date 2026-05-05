import { useEffect, useRef } from 'react'
import { useRealtimeStore } from '@/stores/useRealtimeStore'
import { useAlertStore, type AlertRule } from '@/stores/useAlertStore'

const cooldowns = new Map<string, number>()

function isOnCooldown(ruleId: string, cooldownMs: number): boolean {
  const until = cooldowns.get(ruleId)
  if (until && Date.now() < until) return true
  cooldowns.set(ruleId, Date.now() + cooldownMs)
  return false
}

function notify(rule: AlertRule, message: string) {
  if (typeof Notification === 'undefined') return
  if (Notification.permission === 'granted') {
    new Notification(rule.label, {
      body: message,
      tag: `alert-${rule.id}-${Date.now()}`,
      icon: '/pwa-192x192.png',
    })
  }
}

function evaluateRule(rule: AlertRule): string | null {
  const { activeCalls } = useRealtimeStore.getState()

  switch (rule.trigger) {
    case 'keyword': {
      const q = rule.value.toLowerCase()
      for (const call of activeCalls.values()) {
        if (call.tg_alpha_tag?.toLowerCase().includes(q) ||
            call.tg_description?.toLowerCase().includes(q)) {
          return `${call.tg_alpha_tag || `TG ${call.tgid}`} — ${call.system_name || ''}`
        }
      }
      return null
    }

    case 'talkgroup': {
      const parts = rule.value.split(':')
      const systemId = parts.length > 1 ? Number(parts[0]) : undefined
      const tgid = Number(parts[parts.length - 1])
      if (isNaN(tgid)) return null
      for (const call of activeCalls.values()) {
        if ((!systemId || call.system_id === systemId) && call.tgid === tgid) {
          return `${call.tg_alpha_tag || `TG ${tgid}`} is active`
        }
      }
      return null
    }

    case 'unit': {
      const unitId = Number(rule.value)
      if (isNaN(unitId)) return null
      for (const call of activeCalls.values()) {
        if (call.units?.some((u) => u.unit_id === unitId)) {
          return `Unit ${unitId} active on ${call.tg_alpha_tag || `TG ${call.tgid}`}`
        }
      }
      return null
    }

    case 'emergency': {
      for (const call of activeCalls.values()) {
        if (call.emergency) {
          return `Emergency: ${call.tg_alpha_tag || `TG ${call.tgid}`}`
        }
      }
      return null
    }
  }

  return null
}

export function useAlertEngine() {
  const rules = useAlertStore((s) => s.rules)
  const addEvent = useAlertStore((s) => s.addEvent)
  const activeCalls = useRealtimeStore((s) => s.activeCalls)
  const unitEvents = useRealtimeStore((s) => s.unitEvents)
  const callCountRef = useRef(activeCalls.size)
  const unitCountRef = useRef(unitEvents.length)

  useEffect(() => {
    if (rules.length === 0) return
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    const enabledRules = rules.filter((r) => r.enabled)
    if (enabledRules.length === 0) return

    // Only fire if new data arrived
    if (activeCalls.size === callCountRef.current && unitEvents.length === unitCountRef.current) return
    callCountRef.current = activeCalls.size
    unitCountRef.current = unitEvents.length

    // Request notification permissions lazily
    for (const rule of enabledRules) {
      if (isOnCooldown(rule.id, rule.cooldownMs)) continue
      const message = evaluateRule(rule)
      if (message) {
        addEvent({ ruleId: rule.id, label: rule.label, message })
        notify(rule, message)
      }
    }
  }, [rules, activeCalls, unitEvents, addEvent])
}
