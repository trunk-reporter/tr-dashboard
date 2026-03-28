# Changelog

## 1.0.0-pre4 (2026-03-27)

### Features

- **Sequential talkgroup playback** — Clicking a call on the investigate timeline now queues remaining calls from that talkgroup chronologically. Next/previous player buttons navigate the sequence, and earlier calls are seeded into history for backward navigation.
- **Timeline mouse interactions** — Scroll to zoom and drag to pan on the investigate timeline, with keyboard shortcut hints displayed below.

### Bug Fixes

- **Timeline 'now' positioning** — The investigate timeline no longer shows empty future time. When viewing near the current time, the window shifts so 'now' sits at the right edge.
- **Users page admin access** — Removed client-side role guard that blocked access in legacy token mode. The page now lets the API determine authorization, showing "Admin access required" only on a 403/401 response.
- **Timeline drag/click conflict** — Added missing `data-call-block` attribute so drag-to-pan doesn't fire when clicking a call block.

## 1.0.0-pre3 (2026-03-23)

### Features

- **First-time setup flow** — Login page auto-detects when no users exist and shows a "First-Time Setup" form to create the initial admin account. Calls the `POST /auth/setup` endpoint, validates password length and confirmation, and auto-logs in on success. Gracefully switches to login mode if setup is already completed.

## 1.0.0-pre2 (2026-03-22)

### Bug Fixes

- **Transmission timeline blank on playback** — The audio store was discarding inline `src_list` data from the call object and re-fetching it via a separate API call. If that fetch failed, the timeline stayed blank even though the data was already available. Now uses inline data directly and only fetches separately as a fallback.

## 1.0.0-pre1 (2026-03-22)

### Breaking Changes

- **Docker image: Caddy replaced with `serve`** — The container now serves static files only on port 3000. You must provide your own reverse proxy (Caddy, Traefik, nginx) to route `/api/*`, `/audio/*`, `/health/*` to tr-engine. `TR_ENGINE_URL`, `TR_AUTH_TOKEN`, and `SITE_ADDRESS` env vars are removed. See README for migration guide and full-stack example configs in `examples/`.

### Features

- **PWA support** — Installable as a Progressive Web App with custom service worker, offline banner, update prompt, and Media Session API for lock screen controls.
- **JWT auth UI** — Login page, `RequireAuth` route guard with silent token refresh, user management page (admin only), role-based UI.
- **Updated API types** — Regenerated from latest tr-engine OpenAPI spec. New endpoints: auth, API keys, users, stats/analytics, live audio, transcription backfill, admin maintenance.

### Bug Fixes

- **Auth store hardening** — Access token and user are memory-only (not persisted to localStorage). Stale role window on page reload eliminated. Migration from old store versions discards expired tokens.
- **SSE disconnect on logout** — SSE manager disconnects cleanly when auth token is cleared instead of reconnecting with empty credentials.
- **Service worker offline handling** — Fetch handlers include error fallbacks instead of crashing on network failure.

## 0.9.2 (2026-03-21)

### Chores

- **Org migration:** Moved repository from `lumenprima` to `trunk-reporter` GitHub org. Updated all references in README, docker-compose, LICENSE, and git remote.
- **CI/CD:** Added step to set GHCR package visibility to public after Docker image push, preventing new org packages from defaulting to private.

## 0.9.1 (2026-03-02)

### Features

- **Systems page:** New masonry-tiled Systems view replaces the old Recorders page. Recorders are grouped by radio system (MARCS, LuzerneP25, ScrantonPD, etc.) with per-system decode rate bars, sparklines, and call stats. Trunked P25 systems sharing a recorder pool (e.g., butco/warco) are grouped together under their parent system name.
- **Hex unit ID toggle:** New display setting to show unit radio IDs as hexadecimal instead of decimal, useful for MDC-1200 and FleetSync systems where techs work with hex codes. Toggle in Settings → Display.
- **Analog idle color:** Conventional/analog recorders in idle state now show neutral blue instead of amber, distinguishing them from trunked idle recorders.
- **Squelch badge by system type:** SQ badge only appears for analog/conventional recorder types where squelch is meaningful, hidden for P25 and DMR.

### Bug Fixes

- **Recorder duplication:** Fixed recorders multiplying on the Systems page when multiple trunk-recorder instances report recorders with the same ID format. Now uses instance-scoped compound keys for deduplication.

## 0.9.0 (2026-03-02)

### Features

- **Analog/conventional system support:** System type badges (P25, Analog, SmartNet, DMR, etc.) now display on talkgroup detail, call detail, and system filter dropdowns. Open-ended — automatically handles new system types as tr-engine adds them.
- **Signal event display:** MDC-1200, FleetSync, and STAR in-band signaling events from analog systems now render in the unit detail event list with signaling type badges and signal type labels. Emergency signal activations get red highlighting.

### Bug Fixes

- **CallCard pause button:** Clicking the pause button on a call card now actually pauses playback instead of reloading the call.
- **Multi-architecture Docker images:** Docker images are now built for both `linux/amd64` and `linux/arm64`, fixing "platform mismatch" errors on ARM hosts (e.g., Raspberry Pi, Apple Silicon).

### Cleanup

- Removed deprecated `/query` endpoint client code.

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
