import { useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAudioStore, selectIsPlaying } from '@/stores/useAudioStore'
import { getCall, getCallTransmissions, getCallFrequencies, getCallTranscription } from '@/api/client'
import type { Call, CallTransmission, CallFrequency, Transcription } from '@/api/types'
import {
  formatDuration,
  formatDateTime,
  formatFrequency,
  getTalkgroupDisplayName,
  getUnitDisplayName,
  getUnitColorByRid,
  cn,
} from '@/lib/utils'
import { useSignalThresholds, getSignalColor } from '@/stores/useSignalThresholds'
import { CopyableId } from '@/components/ui/copyable-id'
import { TRANSMISSION_COLORS } from '@/components/audio/TransmissionTimeline'

export default function CallDetail() {
  const { id } = useParams<{ id: string }>()
  const [call, setCall] = useState<Call | null>(null)
  const [transmissions, setTransmissions] = useState<CallTransmission[]>([])
  const [frequencies, setFrequencies] = useState<CallFrequency[]>([])
  const [transcription, setTranscription] = useState<Transcription | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadCall = useAudioStore((s) => s.loadCall)
  const currentCall = useAudioStore((s) => s.currentCall)
  const isPlaying = useAudioStore(selectIsPlaying)

  const callId = id ? parseInt(id, 10) : NaN

  useEffect(() => {
    if (isNaN(callId)) return

    setLoading(true)
    setError(null)

    getCall(callId)
      .then(async (callRes) => {
        setCall(callRes)

        // Use inline src_list if present, otherwise fetch
        if (callRes.src_list && callRes.src_list.length > 0) {
          setTransmissions(callRes.src_list)
        } else {
          try {
            const txRes = await getCallTransmissions(callId)
            setTransmissions(txRes.transmissions || [])
          } catch {
            // No transmissions available
          }
        }

        // Use inline freq_list if present, otherwise fetch
        if (callRes.freq_list && callRes.freq_list.length > 0) {
          setFrequencies(callRes.freq_list)
        } else {
          try {
            const freqRes = await getCallFrequencies(callId)
            setFrequencies(freqRes.frequencies || [])
          } catch {
            // No frequencies available
          }
        }

        // Fetch transcription
        try {
          const tx = await getCallTranscription(callId)
          setTranscription(tx)
        } catch {
          // Transcription not available
        }
      })
      .catch((err) => {
        console.error(err)
        setError('Failed to load call details')
      })
      .finally(() => setLoading(false))
  }, [callId])

  const tgid = call?.tgid ?? 0
  const tgAlphaTag = call?.tg_alpha_tag

  const isCurrentlyPlaying = currentCall?.callId === callId

  // Get unique unit src IDs in order of appearance for color-coding
  const uniqueUnits = useMemo(() => {
    if (transmissions.length === 0) return []
    const seen = new Set<number>()
    const units: number[] = []
    const sorted = [...transmissions].sort((a, b) => a.pos - b.pos)
    for (const tx of sorted) {
      if (!seen.has(tx.src)) {
        seen.add(tx.src)
        units.push(tx.src)
      }
    }
    return units
  }, [transmissions])

  const thresholds = useSignalThresholds()

  const hasUnits = uniqueUnits.length > 0

  const handlePlay = () => {
    if (!call || !call.audio_url) return
    loadCall(call)
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Loading...
      </div>
    )
  }

  if (error || !call) {
    return (
      <div className="space-y-4">
        <div className="flex h-64 items-center justify-center text-destructive">
          {error || 'Call not found'}
        </div>
        <div className="text-center">
          <Link to="/calls" className="text-primary hover:underline">
            ← Back to calls
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="mb-2">
            <Link to="/calls" className="text-sm text-muted-foreground hover:underline">
              ← Back to calls
            </Link>
          </div>
          <h1 className="text-2xl font-bold">
            <Link to={`/talkgroups/${call.system_id}:${tgid}`} className="hover:underline">
              {getTalkgroupDisplayName(tgid, tgAlphaTag)}
            </Link>
          </h1>
          <p className="text-muted-foreground">
            {formatDateTime(call.start_time)}
            {call.system_name && ` • ${call.system_name}`}
            {call.site_short_name && ` (${call.site_short_name})`}
          </p>
        </div>

        <Button
          size="lg"
          onClick={handlePlay}
          disabled={!call.audio_url}
        >
          {isCurrentlyPlaying && isPlaying ? (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="mr-2">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
              Playing
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="mr-2">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Play Audio
            </>
          )}
        </Button>
      </div>

      {/* Status badges */}
      <div className="flex flex-wrap gap-2">
        {call.emergency && <Badge variant="destructive">EMERGENCY</Badge>}
        {call.encrypted && <Badge variant="secondary">ENCRYPTED</Badge>}
        {call.analog && <Badge variant="outline">Analog</Badge>}
        {call.phase2_tdma && <Badge variant="outline">Phase 2 TDMA</Badge>}
        {call.call_state && <Badge variant="outline">{call.call_state}</Badge>}
      </div>

      {/* Call info */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Call Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Duration</p>
                <p className="font-mono text-lg">{formatDuration(call.duration ?? 0)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Frequency</p>
                <p className="font-mono">{call.freq ? formatFrequency(call.freq) : '—'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Start Time</p>
                <p>{formatDateTime(call.start_time)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">End Time</p>
                <p>{call.stop_time ? formatDateTime(call.stop_time) : 'Active'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Audio Type</p>
                <p className="capitalize">{call.audio_type || '—'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Talkgroup ID</p>
                <p className="font-mono">{tgid || '—'}</p>
              </div>
              {call.tg_group && (
                <div>
                  <p className="text-sm text-muted-foreground">Group</p>
                  <p>{call.tg_group}</p>
                </div>
              )}
              {call.tg_tag && (
                <div>
                  <p className="text-sm text-muted-foreground">Tag</p>
                  <p>{call.tg_tag}</p>
                </div>
              )}
            </div>

            <div>
              <p className="text-sm text-muted-foreground">Call ID</p>
              <CopyableId value={String(call.call_id)} className="text-xs" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Signal Quality</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Signal</p>
                <p className={cn("font-mono", getSignalColor(call.signal_db, thresholds.signalGood, thresholds.signalPoor, true))}>
                  {call.signal_db != null && call.signal_db < 900 ? `${call.signal_db.toFixed(1)} dB` : '—'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Noise</p>
                <p className={cn("font-mono", getSignalColor(call.noise_db, thresholds.noiseGood, thresholds.noisePoor, false))}>
                  {call.noise_db != null && call.noise_db < 900 ? `${call.noise_db.toFixed(1)} dB` : '—'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Errors</p>
                <p className={cn("font-mono", getSignalColor(call.error_count, thresholds.errorsGood, thresholds.errorsPoor, false))}>{call.error_count ?? 0}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Spikes</p>
                <p className={cn("font-mono", getSignalColor(call.spike_count, thresholds.spikesGood, thresholds.spikesPoor, false))}>{call.spike_count ?? 0}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Freq Error</p>
                <p className="font-mono">{call.freq_error ?? 0} Hz</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Audio Size</p>
                <p className="font-mono">{call.audio_size ? (call.audio_size / 1024).toFixed(1) : '—'} KB</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Visual Timelines */}
      {transmissions.length > 0 && (call.duration ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Transmission timeline */}
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">Transmissions</p>
              <div className="relative h-6 rounded bg-muted/30 overflow-hidden">
                {transmissions
                  .filter((tx) => tx.duration > 0)
                  .map((tx, i) => {
                    const unitIndex = uniqueUnits.indexOf(tx.src)
                    const color = TRANSMISSION_COLORS[unitIndex % TRANSMISSION_COLORS.length] || 'bg-muted'
                    const left = (tx.pos / (call.duration ?? 1)) * 100
                    const width = (tx.duration / (call.duration ?? 1)) * 100
                    const unitName = tx.tag || getUnitDisplayName(tx.src)
                    return (
                      <div
                        key={i}
                        className={cn('absolute top-0 h-full rounded-sm', color)}
                        style={{
                          left: `${left}%`,
                          width: `${Math.max(width, 0.5)}%`,
                        }}
                        title={`${unitName} — ${tx.duration.toFixed(1)}s at ${tx.pos.toFixed(1)}s`}
                      />
                    )
                  })}
              </div>
              {/* Legend */}
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {uniqueUnits.map((src, i) => {
                  const color = TRANSMISSION_COLORS[i % TRANSMISSION_COLORS.length]
                  const tx = transmissions.find((t) => t.src === src)
                  const name = tx?.tag || getUnitDisplayName(src)
                  return (
                    <span key={src} className="inline-flex items-center gap-1.5">
                      <span className={cn('inline-block h-2 w-2 rounded-full', color)} />
                      <span>{name}</span>
                    </span>
                  )
                })}
              </div>
            </div>

            {/* Frequency hops - only when multiple distinct frequencies */}
            {new Set(frequencies.map(f => f.freq)).size > 1 && (
              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">Frequency Changes</p>
                <div className="relative h-6 rounded bg-muted/30 overflow-hidden">
                  {frequencies.map((f, i) => {
                    const left = (f.pos / (call.duration ?? 1)) * 100
                    const width = (f.len / (call.duration ?? 1)) * 100
                    const label = formatFrequency(f.freq)
                    const showLabel = width > 8
                    const errorInfo = [
                      f.error_count ? `${f.error_count} errors` : '',
                      f.spike_count ? `${f.spike_count} spikes` : '',
                    ].filter(Boolean).join(', ')
                    const tooltip = `${label} — ${f.len.toFixed(1)}s${errorInfo ? ` (${errorInfo})` : ''}`
                    return (
                      <div
                        key={i}
                        className="absolute top-0 h-full rounded-sm bg-cyan-500/60 flex items-center justify-center overflow-hidden"
                        style={{
                          left: `${left}%`,
                          width: `${Math.max(width, 0.5)}%`,
                        }}
                        title={tooltip}
                      >
                        {showLabel && (
                          <span className="truncate px-1 text-[9px] font-semibold text-slate-900">
                            {label}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Transcription */}
      {transcription && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>Transcription</span>
              {transcription.confidence != null && (
                <Badge variant="outline" className="text-xs font-normal">
                  {(transcription.confidence * 100).toFixed(0)}% confidence
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Full text with color-coding via attributed words */}
              <div className="rounded-lg bg-muted/50 p-4">
                {hasUnits && transcription.words?.words && transcription.words.words.length > 0 ? (
                  <TranscriptionWithSpeakers
                    words={transcription.words.words}
                    fullText={transcription.text}
                    uniqueUnits={uniqueUnits}
                  />
                ) : (
                  <p className="text-lg leading-relaxed">{transcription.text}</p>
                )}
              </div>

              {/* Word timeline */}
              {transcription.words?.words && transcription.words.words.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-medium text-muted-foreground">
                    Word Timeline
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {transcription.words.words.map((word, i) => {
                      const color = hasUnits && word.src ? getUnitColorByRid(word.src, uniqueUnits) : null
                      return (
                        <button
                          key={i}
                          className={cn(
                            "group relative rounded px-1.5 py-0.5 text-sm transition-colors hover:bg-primary hover:text-primary-foreground",
                            color ? `${color.bg} ${color.text}` : "bg-secondary"
                          )}
                          title={`${word.start.toFixed(2)}s - ${word.end.toFixed(2)}s`}
                        >
                          {word.word}
                          <span className="absolute -top-6 left-1/2 -translate-x-1/2 rounded bg-popover px-1.5 py-0.5 text-xs text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100">
                            {word.start.toFixed(1)}s
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Metadata */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{transcription.word_count} words</span>
                {transcription.language && <span>Language: {transcription.language}</span>}
                {transcription.model && <span>Model: {transcription.model}</span>}
                {transcription.duration_ms != null && (
                  <span>Processed in {(transcription.duration_ms / 1000).toFixed(1)}s</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transmissions */}
      <Card>
        <CardHeader>
          <CardTitle>Transmissions ({transmissions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {transmissions.length === 0 ? (
            <p className="text-muted-foreground">No transmission data available</p>
          ) : (
            <div className="space-y-2">
              {transmissions.map((tx, i) => {
                const unitColor = hasUnits ? getUnitColorByRid(tx.src, uniqueUnits) : null
                const unitName = tx.tag || getUnitDisplayName(tx.src)

                // Find frequency active during this transmission
                const freq = frequencies.find(f => {
                  const fEnd = f.pos + f.len
                  return tx.pos >= f.pos && tx.pos < fEnd
                })

                return (
                  <div
                    key={i}
                    className={cn(
                      "flex items-center justify-between rounded-lg border bg-card p-3",
                      unitColor?.border
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium",
                        unitColor ? `${unitColor.bg} ${unitColor.text}` : "bg-primary/20 text-primary"
                      )}>
                        {i + 1}
                      </div>
                      <div>
                        <p className={cn("font-medium", unitColor?.text)}>
                          <Link
                            to={`/units/${call.system_id}:${tx.src}`}
                            className="hover:underline"
                          >
                            {unitName}
                          </Link>
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {freq?.freq ? formatFrequency(freq.freq) : ''}{freq?.freq ? ' • ' : ''}{tx.pos.toFixed(1)}s{tx.duration > 0 ? ` • ${formatDuration(tx.duration)}` : ''}
                          {(freq?.error_count ?? 0) > 0 || (freq?.spike_count ?? 0) > 0 ? (
                            <span className="text-yellow-400/80">
                              {' • '}
                              {[
                                freq?.error_count ? `${freq.error_count} err` : '',
                                freq?.spike_count ? `${freq.spike_count} spike${freq.spike_count > 1 ? 's' : ''}` : '',
                              ].filter(Boolean).join(', ')}
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {tx.emergency === 1 && (
                        <Badge variant="destructive">EMERG</Badge>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// Transcription display with speaker attribution from AttributedWord
function TranscriptionWithSpeakers({
  words,
  fullText,
  uniqueUnits,
}: {
  words: { word: string; start: number; end: number; src: number; src_tag?: string }[]
  fullText?: string
  uniqueUnits: number[]
}) {
  // Use punctuated words from full text when available (word objects strip punctuation)
  const punctuatedWords = fullText ? fullText.split(/\s+/) : null
  const usePunctuated = punctuatedWords && punctuatedWords.length === words.length

  // Group consecutive words by speaker
  const segments: { src: number | null; srcTag?: string; words: string[] }[] = []
  let current: { src: number | null; srcTag?: string; words: string[] } | null = null

  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    if (!current || current.src !== (w.src ?? null)) {
      current = { src: w.src ?? null, srcTag: w.src_tag, words: [] }
      segments.push(current)
    }
    current.words.push(usePunctuated ? punctuatedWords[i] : w.word)
  }

  return (
    <div className="text-lg leading-relaxed space-y-1">
      {segments.map((seg, i) => {
        const color = seg.src !== null ? getUnitColorByRid(seg.src, uniqueUnits) : null
        const name = seg.srcTag || (seg.src !== null ? `Unit ${seg.src}` : 'Unknown')
        return (
          <p key={i}>
            <span className={cn("font-medium text-sm", color?.text)}>{name}:</span>{' '}
            {seg.words.join(' ')}
          </p>
        )
      })}
    </div>
  )
}
