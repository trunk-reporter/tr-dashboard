import { useMemo } from 'react'
import { useTranscriptionCache } from '@/stores/useTranscriptionCache'
import { getUnitColorByRid } from '@/lib/utils'
import type { Transmission, TranscriptionWord } from '@/api/types'

interface TranscriptionPreviewProps {
  callId: number | string
  compact?: boolean
}

// Note: This component does NOT auto-fetch transcriptions.
// Transcriptions are fetched:
// 1. On call detail page (explicit)
// 2. After audio_available WebSocket events (delayed, in useRealtimeStore)
// 3. When backend includes transcription data in call list responses (future)

// Find which unit spoke a word based on transmission time ranges
function findSpeaker(
  wordStart: number,
  wordEnd: number,
  transmissions: Transmission[]
): number | null {
  if (transmissions.length === 0) return null

  // Build transmission ranges with start/end times
  const ranges = transmissions
    .map(tx => {
      const start = (tx.position != null && tx.position >= 0) ? tx.position : 0
      const duration = (tx.duration != null && tx.duration > 0) ? tx.duration : 0
      return { start, end: start + duration, unit_rid: tx.unit_rid }
    })
    .sort((a, b) => a.start - b.start)

  // Find the transmission with the most overlap with this word
  let bestMatch: { unit_rid: number; overlap: number } | null = null

  for (const range of ranges) {
    // Calculate overlap: max(0, min(wordEnd, rangeEnd) - max(wordStart, rangeStart))
    const overlapStart = Math.max(wordStart, range.start)
    const overlapEnd = Math.min(wordEnd, range.end)
    const overlap = Math.max(0, overlapEnd - overlapStart)

    if (overlap > 0 && (bestMatch === null || overlap > bestMatch.overlap)) {
      bestMatch = { unit_rid: range.unit_rid, overlap }
    }
  }

  if (bestMatch) {
    return bestMatch.unit_rid
  }

  // If no overlap, find the transmission closest to the word's midpoint
  const wordMid = (wordStart + wordEnd) / 2
  let closest = ranges[0]
  let closestDist = Math.abs(wordMid - (closest.start + closest.end) / 2)

  for (const range of ranges) {
    const rangeMid = (range.start + range.end) / 2
    const dist = Math.abs(wordMid - rangeMid)
    if (dist < closestDist) {
      closest = range
      closestDist = dist
    }
  }

  return closest?.unit_rid ?? null
}

interface ColoredWord {
  word: string
  unitRid: number | null
}

function buildColoredWords(
  words: TranscriptionWord[],
  transmissions: Transmission[]
): ColoredWord[] {
  return words.map(w => ({
    word: w.word,
    unitRid: findSpeaker(w.start, w.end, transmissions),
  }))
}

export function TranscriptionPreview({ callId, compact = false }: TranscriptionPreviewProps) {
  const entry = useTranscriptionCache((s) => s.getEntry(callId))

  // Get unique unit RIDs in order of appearance
  const uniqueUnits = useMemo(() => {
    if (!entry?.transmissions || entry.transmissions.length === 0) return []
    const seen = new Set<number>()
    const units: number[] = []
    // Sort by position (use 0 for missing positions, preserving original order as tiebreaker)
    const sorted = [...entry.transmissions].sort((a, b) => {
      const posA = (a.position != null && a.position >= 0) ? a.position : 0
      const posB = (b.position != null && b.position >= 0) ? b.position : 0
      return posA - posB
    })
    for (const tx of sorted) {
      if (!seen.has(tx.unit_rid)) {
        seen.add(tx.unit_rid)
        units.push(tx.unit_rid)
      }
    }
    return units
  }, [entry?.transmissions])

  // Build colored words if we have word-level data and transmissions
  const coloredWords = useMemo(() => {
    if (!entry?.words || !entry?.transmissions || uniqueUnits.length === 0) {
      return null
    }
    return buildColoredWords(entry.words, entry.transmissions)
  }, [entry?.words, entry?.transmissions, uniqueUnits])

  // Show nothing while loading or if no transcription
  if (!entry || entry.status !== 'loaded' || !entry.text) {
    return null
  }

  const maxLength = compact ? 80 : 150

  // If we have colored words, render them
  if (coloredWords && coloredWords.length > 0) {
    // Truncate to approximate character limit
    let charCount = 0
    const truncatedWords: ColoredWord[] = []
    let truncated = false

    for (const cw of coloredWords) {
      if (charCount + cw.word.length + 1 > maxLength) {
        truncated = true
        break
      }
      truncatedWords.push(cw)
      charCount += cw.word.length + 1 // +1 for space
    }

    return (
      <p className="text-sm text-muted-foreground italic">
        {truncatedWords.map((cw, i) => {
          const color = cw.unitRid !== null
            ? getUnitColorByRid(cw.unitRid, uniqueUnits)
            : null
          return (
            <span key={i}>
              {i > 0 && ' '}
              <span className={color?.text}>
                {cw.word}
              </span>
            </span>
          )
        })}
        {truncated && '...'}
      </p>
    )
  }

  // Fallback to plain text display
  const text = entry.text.length > maxLength
    ? entry.text.slice(0, maxLength).trim() + '...'
    : entry.text

  return (
    <p className="text-sm text-muted-foreground italic truncate">
      {text}
    </p>
  )
}
