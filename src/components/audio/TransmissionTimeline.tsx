import type { CallTransmission } from '@/api/types'
import { cn, formatUnitId } from '@/lib/utils'
import { useFilterStore } from '@/stores/useFilterStore'

interface TransmissionTimelineProps {
  transmissions: CallTransmission[]
  unitTags: Map<number, string>
  duration: number
  currentTime: number
  onSeek: (time: number) => void
}

interface TransmissionLegendProps {
  transmissions: CallTransmission[]
  unitTags: Map<number, string>
}

export const TRANSMISSION_COLORS = [
  'bg-primary',
  'bg-info',
  'bg-success',
  'bg-warning',
  'bg-destructive',
  'bg-purple-500',
  'bg-pink-500',
  'bg-cyan-500',
]

// Helper to get unit colors map - shared between timeline and legend
function getUnitColorsMap(transmissions: CallTransmission[]): Map<number, string> {
  const unitColors = new Map<number, string>()
  const validTransmissions = transmissions.filter(
    (tx) => tx.duration != null && tx.duration > 0
  )
  validTransmissions.forEach((tx) => {
    if (!unitColors.has(tx.src)) {
      unitColors.set(tx.src, TRANSMISSION_COLORS[unitColors.size % TRANSMISSION_COLORS.length])
    }
  })
  return unitColors
}

// Legend component to show unit names with colors
export function TransmissionLegend({ transmissions, unitTags }: TransmissionLegendProps) {
  const unitIdHex = useFilterStore((s) => s.unitIdHex)
  if (transmissions.length === 0) return null

  const unitColors = getUnitColorsMap(transmissions)
  if (unitColors.size === 0) return null

  const getUnitLabel = (src: number): string => {
    const tag = unitTags.get(src)
    return tag || formatUnitId(src, unitIdHex)
  }

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {Array.from(unitColors.entries()).map(([src, color]) => {
        const label = getUnitLabel(src)
        return (
          <span key={src} className="inline-flex items-center gap-1.5">
            <span className={cn('inline-block h-2 w-2 rounded-full', color)} />
            <span title={label}>{label}</span>
          </span>
        )
      })}
    </div>
  )
}

export function TransmissionTimeline({
  transmissions,
  unitTags,
  duration,
  currentTime,
  onSeek,
}: TransmissionTimelineProps) {
  const unitIdHex = useFilterStore((s) => s.unitIdHex)
  if (duration === 0 || transmissions.length === 0) return null

  // Process transmissions - use pos field, fallback to running position
  let runningPosition = 0
  const processedTransmissions = transmissions
    .filter((tx) => tx.duration != null && tx.duration > 0)
    .map((tx) => {
      const position = tx.pos != null && tx.pos >= 0 ? tx.pos : runningPosition
      runningPosition = position + (tx.duration || 0)
      return { ...tx, position }
    })

  if (processedTransmissions.length === 0) return null

  const unitColors = getUnitColorsMap(transmissions)

  const getUnitLabel = (src: number): string => {
    const tag = unitTags.get(src)
    return tag || formatUnitId(src, unitIdHex)
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 z-10">
      {processedTransmissions.map((tx, i) => {
        const txPosition = tx.position
        const txDuration = tx.duration!
        const left = (txPosition / duration) * 100
        const width = (txDuration / duration) * 100
        const color = unitColors.get(tx.src) || 'bg-muted'
        const isCurrentlyPlaying =
          currentTime >= txPosition && currentTime < txPosition + txDuration
        const label = getUnitLabel(tx.src)

        return (
          <button
            key={i}
            onClick={() => onSeek(txPosition)}
            className={cn(
              'pointer-events-auto absolute top-0 h-full rounded-full transition-opacity hover:opacity-80',
              color,
              isCurrentlyPlaying && 'ring-1 ring-white'
            )}
            style={{
              left: `${left}%`,
              width: `${Math.max(width, 0.5)}%`,
            }}
            title={`${label} - ${txDuration.toFixed(1)}s`}
          />
        )
      })}
    </div>
  )
}
