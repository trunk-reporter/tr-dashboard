# Changelog

## 0.8.8 (2026-03-01)

### Features

- **Write token authentication:** Editing talkgroups and units now requires a write token when the backend has `WRITE_TOKEN` configured. Enter the token in Settings → Write Access. If the backend has no write token, edits work for everyone without configuration.

### Bug Fixes

- **Transcription fetch rate limiting:** Transcription requests are now throttled (max 6 concurrent) to avoid hitting the backend's rate limiter (429 errors) when loading pages with many transcribed calls.
- **Edit error feedback:** PATCH requests that fail with 403 now show a clear inline error directing users to configure their write token in Settings, instead of failing silently.

## 0.8.7 (2026-03-01)

### Features

- **Inline metadata editing:** Edit talkgroup metadata (name, group, tag, priority, description) directly from the talkgroup detail page. Edit unit names from the unit detail page. No need to navigate to a separate admin page.
- **Page title updates:** Browser tab title now shows the currently playing talkgroup and queue count, so you can see activity even when the tab is in the background.

### Bug Fixes

- **Live monitoring audio continuity:** Fixed a bug where monitored calls would silently queue up without auto-playing. When a call ended with an empty queue, the player entered a "paused" state that prevented new SSE calls from auto-loading. Now correctly auto-plays new calls when the previous one finishes.
- **Background tab audio resume:** Added tab visibility listener that auto-resumes playback when the browser tab regains focus after being in the background (where browsers block autoplay).

## 0.8.6 (2026-02-28)

### Bug Fixes

- **Transcriptions page browse mode:** The Transcriptions page now shows recent transcribed calls by default instead of requiring a search query. Users can browse recent transcriptions immediately, with search available for filtering. Fixes reports of "no transcriptions visible in the Transcriptions tab."

## 0.8.5 (2026-02-28)

### Features

- **Multi-talkgroup filtering:** Replace the single talkgroup dropdown on the Calls page with a chip-based multi-select component. Search-as-you-type to find talkgroups, selected ones shown as removable chips. URL supports comma-separated composite keys (`?talkgroup=3:9178,3:5344`).
- **Cross-linking improvements:** Added clickable navigation links throughout the app for better discoverability:
  - Talkgroup names on CallCard now link to the talkgroup detail page (previously linked to call detail)
  - Call timestamps and transcription previews on CallCard link to call detail
  - TalkgroupDetail: "View all calls" link, clickable unit tags and call timestamps in inline call cards
  - CallDetail: clickable unit names in timeline legend and transcription speaker labels
  - UnitDetail: clickable last-event talkgroup tag
  - Dashboard: 24h calls stat links to /calls, hover card unit badges link to unit pages
  - Affiliations: top talkgroup badges link to talkgroup detail pages

### Bug Fixes

- **Highlight auto-page navigation:** When navigating to a time-centered call view, the highlighted call now correctly auto-navigates to the page containing it instead of always showing page 1.
- **Active call filtering:** Active (in-progress) calls from the realtime store are now properly filtered by talkgroup and system filters on the Calls page.

## 0.8.4 (2026-02-26)

### Bug Fixes

- **Audio retry backoff bypass:** Exponential backoff delays (500ms, 1s, 2s) were dead code — retries fired immediately. Fixed by deferring `retryCount` increment and `playbackState: 'loading'` to the timeout callback.
- **Render-phase store mutation:** `getCachedColor` called Zustand `set()` during React render on cache miss, causing extra render passes and warnings. Moved color cache to a module-level Map outside reactive state.
- **CallDetail race condition:** Navigating between calls while async fetches (transmissions, transcription) were in-flight could overwrite the new call's data with stale responses. Added cancellation guard.
- **TalkgroupDirectory infinite fetch loop:** `availableCategories.length` in the useEffect dependency array caused an extra fetch on every load, and an infinite loop when no categories existed. Replaced with a one-time ref flag.
- **TalkgroupDirectory debounce leak:** Debounce timeout was not cleared on unmount, firing `updateParam` on a dead route after navigation.
- **Calls talkgroup filter cross-system collision:** Filter used bare `tgid` instead of composite `system_id:tgid`, returning calls from all systems sharing that TGID. Now scopes to the correct system.
