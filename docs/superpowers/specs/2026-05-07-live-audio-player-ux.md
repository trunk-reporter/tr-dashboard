# Live Audio / Player UX — Design Spec

## Problem

The player bar is a global fixture used in three distinct contexts: live talkgroup monitoring (SSE-driven, calls arrive automatically), historical call browsing (user-initiated from Calls / CallDetail / Investigate), and investigation workflows (clicking a block on the timeline). Each context has different trust, interruptibility, and recoverability requirements, but currently the player presents identical affordances regardless of source. The user cannot tell whether audio is live or from history, cannot predict what happens when they click a different call, and has no structured path out of error conditions.

## Audio Source Model

All playback runs through `useAudioStore`. The store itself is source-agnostic; the distinction is tracked by a new `source` field on `QueuedCall`:

```ts
type AudioSource = 'live' | 'history' | 'investigate'
```

| Source | Who enqueues | Interruptible by live? | Queue cleared on live start? |
|--------|-------------|----------------------|------------------------------|
| `live` | `useRealtimeStore` via `addToQueue` when a monitored TG call ends | — | — |
| `history` | User action (CallCard, CallDetail, Calls page) | Yes, with prompt | Yes, on confirm |
| `investigate` | User click on Investigate timeline block | Yes, with prompt | Yes, on confirm |

Live calls enqueue only when `isMonitoring` is true in `useMonitorStore`. They auto-advance through the queue. Historical and investigate calls are also queued and auto-advance, but carry the `history` / `investigate` source tag so the player can render the correct label.

## Player States

Every state must be visible to the user through a distinct visual treatment.

| State | `playbackState` value | Label shown | Indicator style |
|-------|-----------------------|-------------|-----------------|
| Idle | `'idle'` | "Select a call to begin playback" | Muted icon, no controls |
| Live — loading | `'loading'` + source `'live'` | "● LIVE — Loading…" | Amber pulsing dot |
| Live — playing | `'playing'` + source `'live'` | "● LIVE" + talkgroup name | Amber pulsing dot + animated bars |
| History — loading | `'loading'` + source `'history'` | "Loading…" | Spinner |
| History — playing | `'playing'` + source `'history'` | Talkgroup name (no dot) | Animated bars, amber |
| History — paused | `'paused'` + source `'history'` | Talkgroup name | Static play icon |
| Investigate — playing | `'playing'` + source `'investigate'` | "🔍 " + talkgroup name | Animated bars |
| Muted | any non-idle + muted | Muted icon overlaid on speaker | Volume icon crossed out |
| Blocked | `'blocked'` | "Enable Audio" CTA | Full-width prompt, no other controls |
| Disconnected | *(SSE lost, `isMonitoring` was true)* | "● Reconnecting…" in player | Amber dot replaced by spinning reconnect icon |
| Error | `'error'` | "Audio unavailable — retry or skip" | Error icon, retry button |

"Live" and "History/Investigate" states must be **visually distinct at a glance** — the amber dot (●) is reserved exclusively for live source calls. Historical calls render no dot.

## Player Layout

The player bar is always mounted at the bottom of `MainLayout`, above the viewport edge. It has a single layout; there is no collapsed/mini mode. On mobile the bar stacks vertically (existing behavior preserved).

### Desktop layout (left → right)

```
[Play/Pause] [Talkgroup + source label]  [Prev] [──timeline──] [Next]  [Mute] [Vol──]  [Queue N] [History N]
```

- **Source label**: rendered immediately below the talkgroup name link in smaller muted text.  
  - Live: `● LIVE · System Name`  
  - History: `History · System Name`  
  - Investigate: `Investigation · System Name`
- **Queue badge**: `N queued` pill; clicking opens an inline dropdown listing queued calls (talkgroup, duration). From there the user can reorder by drag or remove individual items.
- **History button**: clock icon + count; clicking toggles the history panel (existing behavior).
- **Keyboard hint strip** (xl+ screens): `Space J K M H L` shown as `<kbd>` chips.

### Mobile layout

Single-row: [Play/Pause] [Talkgroup + status] [Skip Next]. Volume and history controls hidden behind a `…` overflow menu accessible via long-press or secondary tap on the player bar.

## Queue Semantics

- The queue is a FIFO list of `QueuedCall` objects.  
- Live calls from monitored talkgroups append to the queue automatically when `isMonitoring` is true.  
- Historical / investigate calls can be added manually via "Add to queue" or "Play next" from any call card.  
- **Live interruption rule**: if a live call arrives while a historical call is playing, the live call is prepended to the queue with a brief toast: *"Live call from [TG] — queued next"*. The current historical call continues uninterrupted. The user is never forcibly interrupted mid-playback.  
- **Queue conflict on history load**: if the user explicitly clicks Play on a historical call while live calls are queued, a confirmation toast appears: *"Replace queue with this call? (Live monitoring paused)"*. Confirming clears the queue, disables `isMonitoring`, and loads the selected call. Dismissing leaves the queue unchanged.
- Auto-advance is controlled by `autoPlay` (default `true`). When false, playback stops at the end of each call and the user must press Next or Play.

## Segment / Transmission Timeline

The `TransmissionTimeline` overlay on the progress slider remains unchanged in behavior. Documentation of its semantics:

- Each horizontal segment represents one `CallTransmission` (a `src_list` entry from the API).  
- Segments are color-coded by unit ID using `useTalkgroupColors` hue rotation.  
- Clicking a segment seeks to its start time.  
- Hovering shows a tooltip: *"Unit 943001 · 09 8COM1 · 0:04–0:11"*.  
- The `TransmissionLegend` below the timeline lists unit IDs / alpha tags with matching colors.  
- On mobile the timeline is hidden to preserve space; the legend is also hidden.

## Metadata Exposure

The player must expose enough context for the user to understand what they are hearing without navigating away.

**Always visible (non-idle states):**
- Talkgroup alpha tag (linked to `/talkgroups/:system_id::tgid`)
- System name (or "System N" fallback)
- Source label (Live / History / Investigation)
- Elapsed time + total duration (`0:14 / 1:32` format)
- Queue depth badge

**Visible on hover / in detail area (desktop):**
- Unit list from `TransmissionLegend` (unit IDs + alpha tags)
- Current segment label (unit speaking now, derived from `transmissions` + `currentTime`)
- Call ID (monospaced, for copy)

**In history panel:**
- Each past call chip shows talkgroup alpha tag + duration (existing behavior).

## Keyboard Shortcuts

All shortcuts are global (active when player has a call loaded) and match the existing implementation:

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `J` | Skip to next call |
| `K` | Skip to previous call (or restart if >3 s elapsed) |
| `M` | Toggle mute |
| `↑` / `↓` | Volume up / down (10% step) |
| `L` | Seek forward 5 s |
| `H` | Seek backward 5 s |
| `R` | Replay from beginning |

Shortcuts are disabled when `isBlocked` is true (no user gesture context yet). All shortcuts are documented in the keyboard hint strip and in the command palette (`Ctrl+K`).

## Autoplay / Browser Permission Recovery

When `playbackState === 'blocked'` the entire player bar is replaced with a single-CTA layout:

```
[▶ Enable Audio]   "[TG Name]" is ready   (+N queued)
```

- The **Enable Audio** button is the only interactive element in this state.
- Clicking it calls `handleUnlockClick`, which unlocks iOS audio via `AudioContext`, then calls `audio.play()` within the user gesture.
- On iOS, `unlockIOSAudio()` must be called in the same synchronous gesture handler (existing implementation satisfies this).
- After successful unlock, the state transitions to `'playing'` and the full player UI renders.
- If the unlock fails (second `NotAllowedError`), the blocked state persists and a subtext appears: *"Your browser requires interaction. Try clicking Enable Audio again."*
- The blocked prompt is also shown if the tab is backgrounded and autoplay is blocked on return (existing visibilitychange handler attempts auto-resume before falling back to the prompt).

## Connection / Disconnection Recovery

Live monitoring depends on the SSE connection managed by `SSEManager` (auto-reconnect with exponential backoff is already implemented). The player surface reflects SSE health:

- **SSE connected**: no indication (normal state).
- **SSE disconnected** (first 10 s): player label shows a spinning reconnect icon next to the source label: `↻ Reconnecting…`. No user action required.
- **SSE disconnected > 10 s**: player shows a persistent toast bar above the player: *"Live monitoring disconnected. [Retry now]"*. Clicking "Retry now" calls `SSEManager.reconnect()`.
- When SSE reconnects, the label returns to normal and any missed calls that ended while disconnected are silently dropped (no backfill; the user is notified via the reconnect banner that some calls may have been missed).

## Missing Audio File Recovery

When `onError` fires after all 3 retry attempts (existing exponential backoff: 500 ms, 1 s, 2 s):

- If the queue has more calls: auto-skip to next, showing a brief toast *"Audio unavailable, skipped"*.
- If the queue is empty: `playbackState` stays `'error'` and the player shows:

```
⚠ Audio unavailable   [Retry]  [Skip]
```

  - **Retry** resets `retryCount` and re-triggers the load cycle.
  - **Skip** transitions to `idle`.

## Auth / Permission Failures

If an audio URL returns 401 or 403 (network fetch error, MEDIA_ERR_NETWORK):

- Same error UI as missing file (`⚠ Audio unavailable`).
- Additionally: a sub-line of text *"Sign in may be required"* with a link to the auth page if `useAuthStore` detects the user is not authenticated.
- If `useAuthStore` shows the user is authenticated and a 403 occurs anyway, the error is treated as a missing file (the audio file may be restricted by talkgroup ACL on the backend).

## Mobile / Touch Constraints

- The player bar height on mobile is fixed at `56px` (single row).
- Touch target for Play/Pause is `44×44px` minimum.
- Skip Next is shown on mobile; Skip Previous is hidden (accessible via long-press on the progress bar area, which seeks to 0).
- Volume control is hidden; system volume is used.
- Transmission timeline is hidden on mobile (`hidden md:block`).
- The `…` overflow menu (tap → sheet) exposes: Mute toggle, History, Queue list, Keyboard shortcuts (greyed out with note "keyboard shortcuts require a keyboard").
- Autoplay blocking is more common on mobile Safari. The Enable Audio CTA is displayed more prominently on mobile: full-width button, centered, with the talkgroup name below in smaller text.

## Implementation Notes

The existing `useAudioStore` state machine covers `idle | loading | playing | paused | blocked | error`. To implement this spec:

1. **Add `source` to `QueuedCall`** (`'live' | 'history' | 'investigate'`, optional, defaults to `'history'`).  
   This is a non-breaking additive change — existing `toQueuedCall` continues to work; callers that don't set `source` get `'history'` by default.

2. **SSE disconnect state** is already tracked via `SSEManager`; expose a `connectionState` field from `useRealtimeStore` and subscribe to it in `AudioPlayer` to show the reconnect indicator.

3. **Queue conflict confirmation** can be implemented as a Zustand action `loadCallWithConflictCheck` that reads `isMonitoring` and queue length before calling `loadCall`.

4. **Mobile overflow menu** is a new `<Sheet>` component triggered by a `…` button on the player bar narrow layout.

5. The `TransmissionLegend` "unit speaking now" highlight requires computing which `CallTransmission` overlaps `currentTime` — a simple interval lookup on `transmissions` array by `start_time` / end derived from `start_time + length`.
