# Code Review — tr-dashboard (2026-02-26)

**Scope:** 16,312 lines across 55 files
**Reviewed:** API client, SSE, Zustand stores, React pages/components, hooks, utilities
**Categories:** Bugs, race conditions, security, performance, state management, CLAUDE.md compliance

---

## Critical — Bugs That Affect Correctness

### 1. Audio retry backoff is bypassed — retries fire immediately instead of with delay
- **File:** `src/stores/useAudioStore.ts:279-291`
- **Description:** Setting `playbackState: 'loading'` immediately in `onError` causes `handleCanPlay` to call `attemptPlay()` on the same failed audio element before the timeout fires. The exponential backoff delays (500ms, 1000ms, 2000ms) are dead code.
- **Fix:** Only set `playbackState: 'loading'` inside the timeout callback, not in the immediate `set`.

### 2. `getCachedColor` mutates Zustand store state during React render
- **File:** `src/stores/useTalkgroupColors.ts:226-244`, called from `Dashboard.tsx:586` and `Talkgroups.tsx:365`
- **Description:** On a cache miss, `getCachedColor` calls `set()` to populate the cache. This function is called during render (inside `.map()` in JSX), violating React's rule that renders must be pure. Triggers "Cannot update a component while rendering a different component" warnings and extra render passes.
- **Fix:** Pre-populate the cache in a `useEffect`, or separate the read path (pure) from the write path (side effect).

### 3. `CallDetail` race condition — stale data shown after navigation
- **File:** `src/pages/CallDetail.tsx:37-84`
- **Description:** Multiple sequential `await` calls with no abort guard. If the user navigates to a different call while inner fetches are in flight, state setters fire for the old call, overwriting the new call's data.
- **Fix:** Add `let cancelled = false` guard with cleanup return.

### 4. `TalkgroupDirectory` potential infinite fetch loop
- **File:** `src/pages/TalkgroupDirectory.tsx:78`
- **Description:** `availableCategories.length` is in the `useEffect` dependency array. On first load, categories are populated (length changes 0 -> N), re-triggering the effect. If the API returns no categories, the effect loops indefinitely.
- **Fix:** Remove `availableCategories.length` from deps; use a `useRef` flag for one-time category extraction.

### 5. `Calls.tsx` talkgroup filter ignores `system_id` — cross-system collision
- **File:** `src/pages/Calls.tsx:143-154`
- **Description:** The talkgroup filter `<select>` uses `value={tg.tgid}` (bare number) instead of the composite `system_id:tgid` key. The same TGID can exist across systems (butco system_id=1, warco system_id=17). Selecting a talkgroup returns calls from all systems sharing that TGID.
- **Fix:** Use composite `system_id:tgid` as the select value and pass both to the API filter.

---

## High — Performance & Unbounded Growth

### 6. Talkgroups page: expensive filter/sort runs on every SSE event, not memoized
- **File:** `src/pages/Talkgroups.tsx:127-197`
- **Description:** The filter/sort IIFE runs on every render. Each call to `shouldHideTalkgroup` iterates all color rules with regex construction. With 1000+ talkgroups and SSE events every few seconds, this produces ~7000+ regex evaluations per render.
- **Fix:** Wrap in `useMemo` with appropriate deps.

### 7. Transcription cache grows unboundedly
- **File:** `src/stores/useTranscriptionCache.ts`
- **Description:** The `cache: Map` has no eviction policy. The Dashboard fetches transcriptions for up to 500 calls per poll. On a busy system, the cache accumulates thousands of entries over a multi-hour session.
- **Fix:** Add a max-size cap (e.g., 500) with LRU eviction.

### 8. `CallCard` subscribes to entire `activeCalls` Map — 50 re-renders per SSE event
- **File:** `src/components/calls/CallCard.tsx:27-31`
- **Description:** Every `CallCard` instance subscribes to `activeCalls`, which is replaced with a new Map reference on every SSE event. With 50 cards on the Calls page, every `call_start`/`call_end` re-renders all 50.
- **Fix:** Use a targeted selector `(s) => s.activeCalls.has(call.call_id)`.

### 9. Audio queue has no size cap
- **File:** `src/stores/useAudioStore.ts` — `addToQueue`
- **Description:** When monitoring multiple busy talkgroups, the queue grows without limit.
- **Fix:** Add `.slice(0, 50)` or similar cap.

---

## Medium — Correctness & State Issues

### 10. `loadTransmissions` race condition — stale transmissions shown
- **File:** `src/stores/useAudioStore.ts:315-323`
- **Description:** No `callId` guard before `set({ transmissions })`. Rapidly skipping calls can overwrite the current call's transmissions with a slow response from a previous call.
- **Fix:** Check `currentCall.callId` still matches before updating.

### 11. `onEnded` transitions to `'paused'` instead of `'idle'`
- **File:** `src/stores/useAudioStore.ts:263-270`
- **Description:** When the last queued call finishes, the player stays in `'paused'` at `0:00` showing the finished call, instead of returning to `'idle'`. Looks like audio is paused rather than complete.
- **Fix:** Transition to `'idle'` instead of `'paused'` when queue is empty.

### 12. `Units.tsx` — `activeView` duplicated in state + URL, desyncs on browser back
- **File:** `src/pages/Units.tsx:22-118`
- **Description:** `activeView` is maintained in both `useState` and URL params. Browser back/forward changes the URL but not the local state, causing the fetch to use stale filter values.
- **Fix:** Derive `activeView` exclusively from `searchParams`.

### 13. Dashboard `isFavorite`/`isMonitored` stable refs break `useMemo`
- **File:** `src/pages/Dashboard.tsx:229-243`
- **Description:** `isFavorite` and `isMonitored` are stable Zustand function references. When the underlying `favoriteTalkgroups` Set changes, `filteredCalls` memo does not re-evaluate.
- **Fix:** Add `favoriteTalkgroups` and `monitoredTalkgroups` to the dependency array.

### 14. Module-level mutable Maps in Dashboard — leak across navigations
- **File:** `src/pages/Dashboard.tsx:55-56`
- **Description:** `recordingStartMap` and `lastCallDurationMap` at module scope never reset. They're also mutated inside `useMemo` (a side-effect violation).
- **Fix:** Use `useRef` inside the component.

### 15. `TalkgroupAnalytics` Phase 2 effect — no cleanup, 8 concurrent calls fire on re-render
- **File:** `src/pages/TalkgroupAnalytics.tsx:179-219`
- **Description:** No `AbortController` or cancelled guard. Navigating away mid-fetch causes state updates on unmounted component. The `talkgroup` object dependency causes unnecessary refires.
- **Fix:** Add cancelled guard and use `talkgroup.tgid` (stable primitive) as dep.

### 16. `getCachedColor(0, ...)` hardcodes `system_id=0` for recorders
- **File:** `src/pages/Dashboard.tsx:367-372`
- **Description:** The `Recorder` type lacks a `system_id` field, so `0` is used as a sentinel. Per-talkgroup color overrides (keyed by `"system_id:tgid"`) will never match `"0:tgid"`.
- **Fix:** Use `getRuleForTalkgroup` directly (field matching only) or expose `system_id` on Recorder.

### 17. Transcription cache allows duplicate concurrent fetches
- **File:** `src/stores/useTranscriptionCache.ts:24-28`
- **Description:** The guard `existing && existing.status !== 'idle'` doesn't prevent duplicate requests because initial entries don't exist in the Map. Two components mounting simultaneously both fire `getCallTranscription(callId)`.
- **Fix:** Change guard to `if (existing) return`.

### 18. Debounce timeout not cleaned on unmount
- **File:** `src/pages/TalkgroupDirectory.tsx:37-43`
- **Description:** `debounceRef.current` is never cleared in a `useEffect` cleanup. Navigating away mid-type fires `updateParam` 300ms later on the dead route.
- **Fix:** Add `useEffect(() => () => clearTimeout(debounceRef.current), [])`.

### 19. Talkgroups fetch loop has no abort on unmount
- **File:** `src/pages/Talkgroups.tsx:86-124`
- **Description:** The `while (hasMore)` loop fetching all talkgroups in batches of 1000 has no `AbortController`. Navigating away mid-fetch causes multiple state updates on unmounted component.
- **Fix:** Add `AbortController` and `cancelled` flag in effect cleanup.

---

## Medium — Security

### 20. Unvalidated `updateUrl` used as `<a href>` — open redirect
- **File:** `src/components/layout/Header.tsx:89-93`, `src/stores/useUpdateStore.ts:48-50`
- **Description:** `data.url` from the update server is stored in Zustand (persisted to localStorage) and rendered as a clickable link with no validation. If the update server is compromised, an attacker can inject malicious URLs.
- **Fix:** Validate that `updateUrl` is an `https://` URL from an expected domain before storing.

### 21. Unvalidated `audio_url` from API
- **File:** `src/stores/useAudioStore.ts:106`, `src/components/audio/AudioPlayer.tsx:103`
- **Description:** `call.audio_url` from the API is assigned directly to `HTMLAudioElement.src` without validation. A compromised backend could inject external URLs.
- **Fix:** Validate URLs start with `/api/` or a known backend host.

### 22. `executeQuery` sends raw SQL to backend
- **File:** `src/api/client.ts:503-515`
- **Description:** An exported function that sends arbitrary SQL to `/query`. Currently unused, but its existence as an unauthenticated API surface is a risk.
- **Fix:** Remove if unused, or gate behind explicit admin authorization.

### 23. `useMonitorStore` localStorage deserialization has no `try/catch`
- **File:** `src/stores/useMonitorStore.ts:88-102`
- **Description:** `JSON.parse(str)` without error handling. Tampered localStorage crashes the entire store initialization.
- **Fix:** Wrap in `try/catch`, return `null` on parse failure.

---

## Low — Style & Minor

### 24. Relative `./` imports violate CLAUDE.md `@/` convention
- **Files:** ~10 files including `MainLayout.tsx`, `useRealtimeStore.ts`, `client.ts`, `main.tsx`
- **Description:** CLAUDE.md says "All imports use `@/` alias" with no exception for same-directory imports.

### 25. Signal sentinel check uses `< 900` instead of `=== 999`
- **Files:** `CallDetail.tsx:255,261`, `useSignalThresholds.ts:59`
- **Description:** Functionally safe (radio dB values are always negative), but contradicts CLAUDE.md spec of 999 as sentinel.

### 26. `normalizeDecodeRate` heuristic is ambiguous
- **File:** `src/lib/utils.ts:87-91`
- **Description:** The `<= 1` threshold can't distinguish between "1 msg/sec raw" and "100% ratio". CLAUDE.md says rates are 0-1 ratios but the function comment says "API returns messages/sec (0-40)".

### 27. Duplicate `getHealth()` on mount
- **Files:** `Header.tsx:37-41`, `MainLayout.tsx:33-36`
- **Description:** Both call `getHealth()` independently. Two identical requests on every page load.

### 28. Index-as-key in dynamic lists
- **Files:** `Dashboard.tsx:747` (units), `TransmissionTimeline.tsx:98` (transmissions), `Affiliations.tsx:208` (redundant `:${i}`)
- **Description:** Risk of incorrect DOM reconciliation when data updates via SSE.
