import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatFrequency(hz: number): string {
  const mhz = hz / 1000000
  return `${mhz.toFixed(4)} MHz`
}

export function formatDuration(seconds: number): string {
  // Clamp to 0 to handle clock skew
  const clamped = Math.max(0, seconds)
  const mins = Math.floor(clamped / 60)
  const secs = Math.floor(clamped % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function formatDurationLong(seconds: number): string {
  // Clamp to 0 to handle clock skew
  const clamped = Math.max(0, seconds)
  const hours = Math.floor(clamped / 3600)
  const mins = Math.floor((clamped % 3600) / 60)
  const secs = Math.floor(clamped % 60)

  if (hours > 0) {
    return `${hours}h ${mins}m ${secs}s`
  }
  if (mins > 0) {
    return `${mins}m ${secs}s`
  }
  return `${secs}s`
}

export function formatRelativeTime(timestamp: string | number): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSeconds < 60) {
    return 'just now'
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`
  }

  return date.toLocaleDateString()
}

export function formatTime(timestamp: string | number): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function formatDateTime(timestamp: string | number): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp)
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

const P25_MAX_RATE = 40

export function normalizeDecodeRate(raw: number): number {
  // API returns messages/sec (0-40 for P25 Phase 1), normalize to 0-1
  if (raw <= 1) return raw // already normalized
  return Math.min(raw / P25_MAX_RATE, 1)
}

export function formatDecodeRate(rate: number): string {
  // Rate may be raw messages/sec or 0-1 ratio
  const normalized = normalizeDecodeRate(rate)
  return `${Math.round(normalized * 100)}%`
}

// Composite key helpers (system_id:tgid format)
export function talkgroupKey(systemId: number, tgid: number): string {
  return `${systemId}:${tgid}`
}

export function parseTalkgroupKey(key: string): { systemId: number; tgid: number } | null {
  const parts = key.split(':')
  if (parts.length !== 2) return null
  const systemId = parseInt(parts[0], 10)
  const tgid = parseInt(parts[1], 10)
  if (isNaN(systemId) || isNaN(tgid)) return null
  return { systemId, tgid }
}

export function getTalkgroupDisplayName(tgid: number, alphaTag?: string): string {
  return alphaTag || `TG ${tgid}`
}

export function getUnitDisplayName(unitId: number, alphaTag?: string): string {
  return alphaTag || `Unit ${unitId}`
}

export function getEventTypeLabel(eventType: string): string {
  const labels: Record<string, string> = {
    on: 'Registered',
    off: 'Deregistered',
    join: 'Affiliated',
    call: 'Transmitted',
    ackresp: 'Acknowledged',
    end: 'TX Ended',
    leave: 'Left',
    data: 'Data TX',
    status_update: 'Status',
  }
  return labels[eventType] || eventType
}

export function getEventTypeColor(eventType: string): string {
  const colors: Record<string, string> = {
    on: 'text-success',
    off: 'text-muted-foreground',
    join: 'text-info',
    call: 'text-primary',
    ackresp: 'text-muted-foreground',
    end: 'text-muted-foreground',
    leave: 'text-warning',
    data: 'text-info',
    status_update: 'text-muted-foreground',
  }
  return colors[eventType] || 'text-foreground'
}

// Unit color palette for distinguishing speakers in transcriptions
// Using distinct, accessible colors that work on both light and dark backgrounds
const UNIT_COLORS = [
  { text: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/50' },
  { text: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/50' },
  { text: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/50' },
  { text: 'text-violet-500', bg: 'bg-violet-500/10', border: 'border-violet-500/50' },
  { text: 'text-rose-500', bg: 'bg-rose-500/10', border: 'border-rose-500/50' },
  { text: 'text-cyan-500', bg: 'bg-cyan-500/10', border: 'border-cyan-500/50' },
  { text: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/50' },
  { text: 'text-pink-500', bg: 'bg-pink-500/10', border: 'border-pink-500/50' },
]

export function getUnitColor(index: number): { text: string; bg: string; border: string } {
  return UNIT_COLORS[index % UNIT_COLORS.length]
}

export function getUnitColorByRid(unitRid: number, allUnits: number[]): { text: string; bg: string; border: string } | null {
  const index = allUnits.indexOf(unitRid)
  if (index === -1) return null
  return getUnitColor(index)
}
