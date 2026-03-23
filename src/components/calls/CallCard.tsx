import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAudioStore, selectIsPlaying } from '@/stores/useAudioStore'
import { useRealtimeStore } from '@/stores/useRealtimeStore'
import type { Call } from '@/api/types'
import {
  formatDuration,
  formatTime,
  formatFrequency,
  getTalkgroupDisplayName,
} from '@/lib/utils'
import { cn } from '@/lib/utils'
import { TranscriptionPreview } from './TranscriptionPreview'

interface CallCardProps {
  call: Call
  showSystem?: boolean
  compact?: boolean
}

export function CallCard({ call, showSystem = true, compact = false }: CallCardProps) {
  const loadCall = useAudioStore((s) => s.loadCall)
  const requestPause = useAudioStore((s) => s.requestPause)
  const currentCall = useAudioStore((s) => s.currentCall)
  const isPlaying = useAudioStore(selectIsPlaying)

  const activeCalls = useRealtimeStore((s) => s.activeCalls)

  const isCurrentlyPlaying = currentCall?.callId === call.call_id
  const hasAudio = !!call.audio_url
  const isActive = activeCalls.has(call.call_id) || call.call_state === 'recording' || call.call_state === 'monitoring'

  const handlePlay = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (isCurrentlyPlaying && isPlaying) {
      requestPause()
    } else if (hasAudio) {
      loadCall(call)
    }
  }

  if (compact) {
    return (
      <div
        className={cn(
          'flex items-center gap-3 rounded-lg border bg-card p-3 card-glass card-call-hover',
          isCurrentlyPlaying ? 'border-primary bg-primary/5 card-playing-glow' : ''
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={handlePlay}
          disabled={!hasAudio}
          className="shrink-0"
        >
          {isCurrentlyPlaying && isPlaying ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          )}
        </Button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              to={`/talkgroups/${call.system_id}:${call.tgid}`}
              className="truncate font-medium hover:underline"
            >
              {getTalkgroupDisplayName(call.tgid, call.tg_alpha_tag)}
            </Link>
            {isActive && (
              <Badge variant="live">LIVE</Badge>
            )}
            {call.emergency && <Badge variant="destructive">EMERG</Badge>}
            {call.encrypted && <Badge variant="secondary">ENC</Badge>}
          </div>
          {call.transcription_text ? (
            <Link to={`/calls/${call.call_id}`} className="block">
              <p className="text-sm text-muted-foreground italic truncate hover:text-foreground">
                {call.transcription_text.slice(0, 80)}{call.transcription_text.length > 80 ? '...' : ''}
              </p>
            </Link>
          ) : call.has_transcription ? (
            <TranscriptionPreview callId={call.call_id} compact />
          ) : null}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link to={`/calls/${call.call_id}`} className="hover:underline">
              {formatTime(call.start_time)}
            </Link>
            {showSystem && call.system_name && (
              <>
                <span>&bull;</span>
                <Link to={`/systems/${call.system_id}`} className="hover:underline">{call.system_name}</Link>
              </>
            )}
          </div>
        </div>

        <div className="text-right">
          <div className="font-mono text-sm">{formatDuration(call.duration ?? 0)}</div>
          {call.units && call.units.length > 0 && (
            <div className="text-xs text-muted-foreground">
              {call.units.length} unit{call.units.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border bg-card px-3 py-2 card-glass card-call-hover',
        isCurrentlyPlaying ? 'border-primary bg-primary/5 card-playing-glow' : '',
        isActive && !isCurrentlyPlaying && 'border-l-2 border-l-live'
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            to={`/talkgroups/${call.system_id}:${call.tgid}`}
            className="truncate font-medium hover:underline"
          >
            {getTalkgroupDisplayName(call.tgid, call.tg_alpha_tag)}
          </Link>
          {isActive && (
            <Badge variant="live" className="text-[10px] px-1 py-0">LIVE</Badge>
          )}
          {call.emergency && <Badge variant="destructive" className="text-[10px] px-1 py-0">EMERG</Badge>}
          {call.encrypted && <Badge variant="secondary" className="text-[10px] px-1 py-0">ENC</Badge>}
        </div>

        <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <Link to={`/calls/${call.call_id}`} className="hover:underline">
            {formatTime(call.start_time)}
          </Link>
          {showSystem && call.system_name && <span>{call.system_name}</span>}
          {call.freq != null && call.freq > 0 && (
            <span className="font-mono">{formatFrequency(call.freq)}</span>
          )}
        </div>

        {call.transcription_text ? (
          <Link to={`/calls/${call.call_id}`} className="block">
            <p className="text-sm text-muted-foreground italic truncate hover:text-foreground">
              {call.transcription_text.slice(0, 150)}{call.transcription_text.length > 150 ? '...' : ''}
            </p>
          </Link>
        ) : call.has_transcription ? (
          <TranscriptionPreview callId={call.call_id} />
        ) : null}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span className="font-mono text-sm tabular-nums">{formatDuration(call.duration ?? 0)}</span>
        <Button
          variant={isCurrentlyPlaying ? 'default' : 'secondary'}
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={handlePlay}
          disabled={!hasAudio}
        >
          {isCurrentlyPlaying && isPlaying ? (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="mr-1">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
              Pause
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="mr-1">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Play
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
