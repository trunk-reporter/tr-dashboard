# v0.7.3 API Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate tr-dashboard from tr-engine v0.3.1 to v0.7.3, replacing WebSocket with SSE, updating all data types, and adding unit affiliations, talkgroup directory, and admin pages.

**Architecture:** Targeted rewrite of data-touching layers. Keep project shell (routing, UI primitives, theme, audio playback logic). Rewrite API types, client, transport (WebSocket→SSE), stores, and page components from scratch against the new OpenAPI spec at `/openapi.yaml`.

**Tech Stack:** React 19, TypeScript (strict), Vite 7, Tailwind v4, Zustand v5, React Router v7, openapi-typescript

**Design doc:** `docs/plans/2026-02-24-v073-api-migration-design.md`

**Verification:** This project has no test infrastructure. Use `npm run lint` (TypeScript type-check via `tsc --noEmit`) as the verification step. Also do manual browser verification at key milestones.

---

## Task 1: Regenerate OpenAPI types

**Files:**
- Modify: `package.json` (update api:generate script)
- Regenerate: `src/api/generated.ts`

**Step 1: Update the api:generate script to use local spec**

In `package.json`, change:
```json
"api:generate": "openapi-typescript https://tr-api.luxprimatech.com/openapi.json -o src/api/generated.ts"
```
To:
```json
"api:generate": "openapi-typescript ./openapi.yaml -o src/api/generated.ts"
```

**Step 2: Run the generator**

Run: `npm run api:generate`
Expected: New `src/api/generated.ts` with v0.7.3 schemas (System, Site, Call, SSEEventType, etc.)

**Step 3: Verify generated file has new schemas**

Spot-check that `generated.ts` contains: `SystemListResponse` with `systems` array (not `sites`), `ActiveCallListResponse`, `AffiliationListResponse`, `SSEEventType`, `TranscriptionStatus`.

**Step 4: Commit**

```bash
git add package.json src/api/generated.ts
git commit -m "chore: regenerate OpenAPI types from v0.7.3 spec"
```

---

## Task 2: Rewrite types.ts

**Files:**
- Rewrite: `src/api/types.ts`

This is the foundation everything else builds on. Write all types from scratch to match the v0.7.3 OpenAPI spec. Reference `openapi.yaml` schemas section (lines 2193+) and `src/api/generated.ts` for exact field names.

**Step 1: Write the new types.ts**

The file should contain these sections in order:

1. **Import generated types** for complex schemas we don't need to hand-write
2. **Enums**: `SystemType`, `TalkgroupMode`, `EventType`, `CallState`, `MonState`, `RecState`, `TranscriptionStatus`, `TranscriptionSource`, `SSEEventType`
3. **Core models**: `System`, `Site`, `P25System`, `Talkgroup`, `Unit`, `UnitEvent`, `Call`, `CallUnit`, `CallTransmission`, `CallFrequency`, `CallGroup`, `Transcription`, `AttributedWord`, `TranscriptionSegment`, `Recorder`, `Affiliation`, `TalkgroupDirectoryEntry`
4. **Response wrappers**: `SystemListResponse`, `P25SystemListResponse`, `TalkgroupListResponse`, `UnitListResponse`, `UnitEventListResponse`, `CallListResponse`, `ActiveCallListResponse`, `CallGroupListResponse`, `CallGroupDetailResponse`, `CallFrequencyListResponse`, `CallTransmissionListResponse`, `AffiliationListResponse`, `TranscriptionSearchHit`, `TranscriptionSearchResponse`, `TranscriptionQueueStats`
5. **Stats types**: `StatsResponse`, `SystemActivity`, `DecodeRate`, `DecodeRatesResponse`, `TalkgroupActivity`, `TalkgroupEncryptionStat`, `EncryptionStatsResponse`
6. **Health**: `HealthResponse`
7. **Admin**: `SystemMergeRequest`, `SystemMergeResponse`, `QueryRequest`, `QueryResponse`
8. **Error types**: `ErrorResponse`, `AmbiguousError`

Key changes from old types.ts:
- `System` is now the logical network (was aliased to `Site`). Has `system_id`, `name`, `system_type`, `sysid`, `wacn`, `sites[]`
- `Site` is the recording point. Has `site_id`, `system_id`, `short_name`, `nac`, `rfss`, `p25_site_id`
- `Call.call_id` is `number` (was string). Embeds `system_id`, `system_name`, `sysid`, `site_id`, `site_short_name`, `tg_alpha_tag`, `tg_description`, `tg_tag`, `tg_group`, `src_list[]`, `freq_list[]`, `unit_ids[]`, `call_state`, `mon_state`, `transcription_status`
- `CallUnit` has `system_id`, `unit_id`, `alpha_tag` (was `unit_rid`, `alpha_tag`)
- `CallTransmission` (new inline shape): `src`, `tag`, `time`, `pos`, `duration`, `emergency`, `signal_system`
- `CallFrequency` (new inline shape): `freq`, `time`, `pos`, `len`, `error_count`, `spike_count`
- `Talkgroup` and `Unit` have `system_id` (int) + `system_name` + `sysid`
- `UnitEvent` embeds `system_name`, `unit_alpha_tag`, `tg_alpha_tag`, `tg_description`
- `Recorder` has composite `id` string, `src_num`, `rec_num`, `type`, `rec_state`, embedded tg/unit context
- All list responses use `total` (not `count`)
- `StatsResponse` has `systems`, `talkgroups`, `units`, `total_calls`, `calls_24h`, `calls_1h`, `total_duration_hours`, `system_activity[]`
- No WebSocket types — SSE events use the same model types as REST responses
- Remove: `RecentCallInfo`, `RecentCallsResponse`, `System = Site` alias, all old WS event types

**Step 2: Verify types compile in isolation**

The file will have broken imports elsewhere, but types.ts itself should parse cleanly. No lint check yet (downstream files will break).

**Step 3: Commit**

```bash
git add src/api/types.ts
git commit -m "feat: rewrite types.ts for v0.7.3 API schema"
```

---

## Task 3: Rewrite API client

**Files:**
- Rewrite: `src/api/client.ts`

**Step 1: Write the new client.ts**

Keep the `ApiError` class, `request<T>()` function, and `buildQueryString()` helper unchanged. Rewrite all exported API functions.

Sections:
1. **Systems**: `getSystems()`, `getSystem(id)`, `updateSystem(id, patch)`, `getP25Systems()`, `getSite(id)`, `updateSite(id, patch)`
2. **Talkgroups**: `getTalkgroups(params)`, `getTalkgroup(id)`, `updateTalkgroup(id, patch)`, `getTalkgroupCalls(id, params)`, `getTalkgroupUnits(id, params)`, `getEncryptionStats(params)`, `getTalkgroupDirectory(params)`, `importTalkgroupDirectory(systemIdOrName, file)`
3. **Units**: `getUnits(params)`, `getUnit(id)`, `updateUnit(id, patch)`, `getUnitCalls(id, params)`, `getUnitEvents(id, params)`, `getGlobalUnitEvents(params)`, `getUnitAffiliations(params)`
4. **Calls**: `getCalls(params)`, `getActiveCalls(params)`, `getCall(id)`, `getCallAudioUrl(id)`, `getCallTransmissions(id)`, `getCallFrequencies(id)`
5. **Transcriptions**: `getCallTranscription(id)`, `listCallTranscriptions(id)`, `submitTranscription(id, data)`, `transcribeCall(id)`, `verifyTranscription(id)`, `rejectTranscription(id)`, `excludeFromDataset(id)`, `searchTranscriptions(q, params)`, `getTranscriptionQueueStatus()`
6. **Call Groups**: `getCallGroups(params)`, `getCallGroup(id)`
7. **Recorders**: `getRecorders()`
8. **Stats**: `getStats()`, `getDecodeRates(params)`, `getTalkgroupActivity(params)`
9. **Admin**: `mergeSystems(req)`, `executeQuery(sql, params, limit)`
10. **Health**: `getHealth()`

Key changes:
- `getCalls()` params: `CallQueryParams` with `sysid?`, `system_id?`, `site_id?`, `tgid?`, `unit_id?`, `emergency?`, `encrypted?`, `deduplicate?`, `sort?`, `start_time?`, `end_time?`, `limit?`, `offset?`
- Remove `getRecentCalls()` — callers use `getCalls({sort: '-stop_time', deduplicate: true})`
- Remove `getActiveCallsRealtime()` — only `getActiveCalls()` remains
- Remove `getActivity()` — replaced by `getTalkgroupActivity()`
- Remove `getSystemTalkgroups()` — use `getTalkgroups({system_id: ...})`
- `getTranscriptionQueueStatus()` hits `/transcriptions/queue` (was `/transcription/status`)
- All PATCH/PUT/POST functions use appropriate HTTP methods
- `importTalkgroupDirectory()` uses `multipart/form-data` for file upload

**Step 2: Commit**

```bash
git add src/api/client.ts
git commit -m "feat: rewrite API client for v0.7.3 endpoints"
```

---

## Task 4: Create SSE layer (replace WebSocket)

**Files:**
- Create: `src/api/eventsource.ts`
- Delete: `src/api/websocket.ts` (after stores are updated in Task 5)

**Step 1: Write eventsource.ts**

Create an `SSEManager` class:

```typescript
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export type SSEEventType = 'call_start' | 'call_update' | 'call_end'
  | 'unit_event' | 'recorder_update' | 'rate_update'
  | 'trunking_message' | 'console'

export interface SSEFilters {
  systems?: string
  sites?: string
  tgids?: string
  units?: string
  types?: string
  emergency_only?: boolean
}
```

Implementation details:
- Constructor takes optional `SSEFilters`
- `connect()`: builds URL `/api/v1/events/stream?...` from filters, creates `new EventSource(url)`
- Register listeners with `es.addEventListener(eventType, handler)` for each SSE event type — the server sends typed `event:` fields so each event type gets its own listener
- `on<E>(event, handler)`: typed handler registration, returns unsubscribe function
- `onStatusChange(handler)`: connection status tracking
- `disconnect()`: close EventSource
- `reconnect(newFilters?)`: disconnect + connect with new filters
- Connection status: `'connecting'` on construction, `'connected'` on `onopen`, `'error'` on `onerror`. EventSource auto-reconnects on error (browser behavior), so after `onerror` it goes back to `'connecting'`
- Parse event data: `JSON.parse(event.data)` for each message
- Singleton `getSSEManager()` export

Key simplifications vs old WebSocket:
- No manual reconnect logic (EventSource handles it)
- No health check interval (server sends keepalive comments)
- No pending subscription queue (filters are URL params)
- No newline-delimited JSON parsing (SSE frames are atomic)
- `Last-Event-ID` gap recovery is automatic

**Step 2: Commit**

```bash
git add src/api/eventsource.ts
git commit -m "feat: add SSE event source manager (replaces WebSocket)"
```

---

## Task 5: Rewrite stores

**Files:**
- Delete: `src/stores/useTalkgroupCache.ts`
- Rewrite: `src/stores/useRealtimeStore.ts`
- Modify: `src/stores/useMonitorStore.ts`
- Modify: `src/stores/useAudioStore.ts`
- Modify: `src/stores/useFilterStore.ts`
- Modify: `src/stores/useTalkgroupColors.ts`
- Modify: `src/stores/useTranscriptionCache.ts`

This is the largest task. Break into sub-steps.

**Step 1: Delete useTalkgroupCache.ts**

Delete the file. The API now embeds all display names in responses — no client-side lookup needed.

**Step 2: Create composite key helpers**

Since `useTalkgroupCache.ts` exported `talkgroupKey()` and `parseTalkgroupKey()` which are imported by other stores, create these as standalone utilities. Add to `src/lib/utils.ts`:

```typescript
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
```

**Step 3: Rewrite useRealtimeStore.ts**

Complete rewrite. New state shape:

```typescript
interface RealtimeState {
  connectionStatus: ConnectionStatus
  activeCalls: Map<number, Call>           // keyed by call_id (integer)
  unitEvents: UnitEvent[]                  // rolling buffer, max 200
  decodeRates: Map<number, DecodeRate>     // keyed by system_id
  recorders: Recorder[]

  // Actions
  setConnectionStatus: (status: ConnectionStatus) => void
  handleCallStart: (call: Call) => void
  handleCallUpdate: (call: Partial<Call> & { call_id: number }) => void
  handleCallEnd: (call: Call) => void
  handleUnitEvent: (event: UnitEvent) => void
  handleRateUpdate: (rate: DecodeRate) => void
  handleRecorderUpdate: (recorder: Recorder) => void
  clearActiveCalls: () => void
}
```

Key changes:
- SSE events push full/partial `Call` objects (same schema as REST), not custom event types
- `call_start` → add Call to `activeCalls` map
- `call_update` → merge partial Call into existing (new transmission, freq change)
- `call_end` → full Call with `audio_url`. Check monitor store, queue for audio if monitored. Remove from activeCalls.
- No more `recentCalls` array in store — pages fetch via `getCalls()` API
- No more `handleAudioAvailable` — `call_end` includes `audio_url`
- No more `handleCallActive` — `call_update` replaces it
- `decodeRates` keyed by `system_id` (number) not `system` (string)
- `recorders` is a flat array (keyed by `recorder.id` string when looking up)

New `initializeRealtimeConnection()`:
- Creates SSEManager, subscribes to events
- `call_end` handler checks `useMonitorStore.isMonitored(call.system_id, call.tgid)` and queues to `useAudioStore.addToQueue(call)` if monitored
- No transcription fetch delay — `has_transcription` and `transcription_text` are in the Call object
- Returns cleanup function that disconnects SSE

**Step 4: Update useMonitorStore.ts**

- Change imports: `talkgroupKey`/`parseTalkgroupKey` from `@/lib/utils` (not from deleted cache store)
- Change function signatures: `(sysid: string, tgid: number)` → `(systemId: number, tgid: number)`
- Key format: `"1:9178"` (system_id) instead of `"348:9178"` (P25 sysid)
- Add localStorage migration in the persist storage `getItem`: detect old-format keys (where first part isn't a small integer), and skip/clear them. This is a one-time migration — old monitor data uses P25 sysid strings that can't be reliably mapped to system_id integers, so clear the stale data.

**Step 5: Update useAudioStore.ts**

- Change `Call` import to new type
- The store accepts calls for playback via `addToQueue(call: Call)` — update the Call type usage. `call.call_id` is now `number`, `call.audio_url` is always present for completed calls
- `getCallAudioUrl(call.call_id)` generates the audio URL
- Update any internal types that referenced old `RecentCallInfo` to use `Call`
- No functional logic changes to the playback state machine

**Step 6: Update useFilterStore.ts**

- Change imports: `talkgroupKey`/`parseTalkgroupKey` from `@/lib/utils`
- Change `selectedSystems: string[]` to `selectedSystems: number[]` (system database IDs)
- Change `toggleSystem` to accept `number`
- Change `toggleFavoriteTalkgroup(sysid, tgid)` → `toggleFavoriteTalkgroup(systemId: number, tgid: number)`
- Change `isFavorite(sysid, tgid)` → `isFavorite(systemId: number, tgid: number)`
- Update `isFavoriteByTgid` to use new `parseTalkgroupKey` return type

**Step 7: Update useTalkgroupColors.ts**

- Change imports: `talkgroupKey`/`parseTalkgroupKey` from `@/lib/utils`
- Key format update: `system_id:tgid` instead of `sysid:tgid`
- Same localStorage migration approach as monitor store (clear stale data on format mismatch)

**Step 8: Simplify useTranscriptionCache.ts**

- Remove auto-fetch-after-delay logic
- Simplify to: `cache: Map<number, Transcription>` keyed by `call_id` (integer)
- `fetchTranscription(callId: number)` — fetches full transcription with word-level data from `getCallTranscription(callId)`
- Used only by CallDetail page for full word timing display — list views use embedded `call.transcription_text`

**Step 9: Delete websocket.ts**

Now that no store imports it, delete `src/api/websocket.ts`.

**Step 10: Verify type-check compiles**

Run: `npm run lint`
Expected: Errors only in page/component files that haven't been updated yet. The API + store layer should be clean.

**Step 11: Commit**

```bash
git add -A
git commit -m "feat: rewrite stores for v0.7.3 — SSE, delete talkgroup cache, update key formats"
```

---

## Task 6: Update layout components

**Files:**
- Modify: `src/components/layout/MainLayout.tsx`
- Modify: `src/components/layout/Header.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

**Step 1: Update MainLayout.tsx**

- Change `initializeRealtimeConnection` import from new `useRealtimeStore`
- Remove talkgroup cache warming (`getTalkgroups({limit: 500})` call on startup) — no longer needed
- Everything else stays (sidebar, header, outlet, audio player)

**Step 2: Update Header.tsx**

- Connection status from `useRealtimeStore` (same API, different underlying transport)
- Stats display: update field names (`total_calls` vs `total_calls`, `calls_1h` vs `calls_last_hour`, etc.)
- Decode rate display: `decodeRates` map now keyed by `number` (system_id), values are `DecodeRate` type with `decode_rate` (0-1 ratio, not X/40 count) and `total_messages`

**Step 3: Update Sidebar.tsx**

- Add navigation items for new pages: Affiliations, Directory, Admin
- Add keyboard shortcut hints for new pages in the GoToMenu

**Step 4: Commit**

```bash
git add src/components/layout/
git commit -m "feat: update layout components for v0.7.3"
```

---

## Task 7: Update call components

**Files:**
- Modify: `src/components/calls/CallCard.tsx`
- Modify: `src/components/calls/CallList.tsx`
- Modify: `src/components/calls/ActiveCallBadge.tsx`
- Modify: `src/components/calls/TranscriptionPreview.tsx`
- Modify: `src/components/audio/AudioPlayer.tsx`
- Modify: `src/components/audio/TransmissionTimeline.tsx`

**Step 1: Update CallCard.tsx**

- Remove all `useTalkgroupCache` imports and lookups
- Use `call.tg_alpha_tag` directly for talkgroup name
- Use `call.system_name` / `call.site_short_name` for system/site display
- Use `call.transcription_text` for preview (was fetched separately)
- `call.call_id` is `number` — update link: `/calls/${call.call_id}`
- Talkgroup link: `/talkgroups/${call.system_id}:${call.tgid}`
- Color lookup: `useTalkgroupColors` with `system_id:tgid` key

**Step 2: Update CallList.tsx**

- Accepts `Call[]` (same type but new shape)
- Pagination uses `total` field

**Step 3: Update ActiveCallBadge.tsx**

- Was using custom `ActiveCall` type — now uses `Call` type directly
- Display names from `call.tg_alpha_tag`, `call.system_name`
- Duration: `call.duration` (elapsed-so-far for active calls)

**Step 4: Update TranscriptionPreview.tsx**

- Use `call.transcription_text` / `call.has_transcription` embedded fields
- Remove fetches from transcription cache for list display
- Keep detail-level fetch for word timing in hover preview

**Step 5: Update AudioPlayer.tsx**

- Call type changes: `call_id` is `number`, `audio_url` always present
- Transmission timeline data from `call.src_list[]` (new `CallTransmission` shape)
- Unit display: `transmission.tag` (was `unit_alpha_tag`)
- Position: `transmission.pos` (was `position`)
- Duration: `transmission.duration` (was computed)

**Step 6: Update TransmissionTimeline.tsx**

- `CallTransmission` shape: `src` (unit ID), `tag` (unit name), `pos` (seconds), `duration` (seconds), `emergency` (0/1 int)
- Adapt rendering to new field names

**Step 7: Commit**

```bash
git add src/components/calls/ src/components/audio/
git commit -m "feat: update call and audio components for v0.7.3"
```

---

## Task 8: Update command palette and GoTo menu

**Files:**
- Modify: `src/components/command/CommandPalette.tsx`
- Modify: `src/components/command/GoToMenu.tsx`

**Step 1: Update CommandPalette.tsx**

- Remove talkgroup cache usage for search results
- Search talkgroups via API (`getTalkgroups({search: query})`) instead of cache lookup
- Add new navigation targets: Affiliations, Directory, Admin

**Step 2: Update GoToMenu.tsx**

- Add new keyboard shortcuts: `g>a` (Affiliations), `g>r` (Directory), `g>x` (Admin)
- Update `src/lib/constants.ts` with new shortcuts

**Step 3: Commit**

```bash
git add src/components/command/ src/lib/constants.ts
git commit -m "feat: update command palette and navigation for new pages"
```

---

## Task 9: Update Dashboard page

**Files:**
- Rewrite: `src/pages/Dashboard.tsx`

This is the largest page (887 lines). Major changes needed.

**Step 1: Rewrite Dashboard.tsx**

Key changes:
- **Active calls section**: Read `activeCalls` from `useRealtimeStore` — these are now `Call` objects keyed by `call_id`. Display `call.tg_alpha_tag`, `call.system_name`, `call.site_short_name` directly. No talkgroup cache lookups.
- **Recent calls section**: Fetch via `getCalls({sort: '-stop_time', deduplicate: true, limit: 50})` instead of reading `recentCalls` from realtime store. Poll on interval.
- **Recorder grid**: `recorders` from store is now `Recorder[]` with new shape. Use `recorder.id` (composite string), `recorder.rec_state` (string enum), `recorder.tg_alpha_tag`, `recorder.unit_alpha_tag`.
- **Stats panel**: `getStats()` returns new shape — `stats.systems`, `stats.calls_1h`, `stats.calls_24h`, `stats.total_duration_hours`, `stats.system_activity[]` for per-system breakdown.
- **Decode rates**: `decodeRates` map keyed by `system_id` (number). `rate.decode_rate` is a 0-1 ratio (not X/40).
- **Unit events sidebar**: Read from `useRealtimeStore.unitEvents` — now `UnitEvent` type with embedded `unit_alpha_tag`, `tg_alpha_tag`.
- **Remove**: All `useTalkgroupCache` imports/usage, `getRecentCalls()` calls, `getActiveCallsRealtime()` calls.
- **Monitor integration**: Check `useMonitorStore.isMonitored(call.system_id, call.tgid)`.

**Step 2: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat: rewrite Dashboard for v0.7.3 SSE and embedded context"
```

---

## Task 10: Update Calls page

**Files:**
- Modify: `src/pages/Calls.tsx`

**Step 1: Update Calls.tsx**

- Update `CallQueryParams` usage: new fields `sysid`, `system_id`, `site_id`, `tgid`, `unit_id`, `deduplicate`, `sort`
- Use `sort: '-start_time'` format (prefix with `-` for descending)
- Pagination: `response.total` (was `response.count`)
- Remove `getRecentCalls()` usage if any — use `getCalls()` with appropriate params
- Calls have embedded display names — no cache lookups

**Step 2: Commit**

```bash
git add src/pages/Calls.tsx
git commit -m "feat: update Calls page for v0.7.3 query params"
```

---

## Task 11: Update CallDetail page

**Files:**
- Modify: `src/pages/CallDetail.tsx`

**Step 1: Update CallDetail.tsx**

- `call_id` from URL param is `number` — `parseInt(params.id)`
- Transmissions: use `call.src_list[]` inline data (new `CallTransmission` shape with `src`, `tag`, `pos`, `duration`). Fall back to `getCallTransmissions()` if not present.
- Frequencies: use `call.freq_list[]` inline data. Fall back to `getCallFrequencies()`.
- New fields to display: `call.site_short_name`, `call.tg_group`, `call.tg_tag`, `call.tg_description`, `call.call_state`, `call.transcription_status`
- Transcription: embedded `call.transcription_text` for quick display, `getCallTranscription()` for full word timing
- Remove talkgroup cache lookups
- Remove separate transmission/frequency fetch calls if inline data is present

**Step 2: Commit**

```bash
git add src/pages/CallDetail.tsx
git commit -m "feat: update CallDetail for v0.7.3 inline data and embedded context"
```

---

## Task 12: Update Talkgroups pages

**Files:**
- Modify: `src/pages/Talkgroups.tsx`
- Modify: `src/pages/TalkgroupDetail.tsx`

**Step 1: Update Talkgroups.tsx**

- `Talkgroup` type now has `system_id` (int), `system_name`, `sysid`
- Display `talkgroup.system_name` alongside alpha_tag
- Sort param: `-last_seen` format (prefix with `-`)
- Talkgroup link: `/talkgroups/${tg.system_id}:${tg.tgid}`
- Pagination: `response.total`
- Filter by `system_id` param (was `sysid`)
- Color/monitor lookups use `system_id:tgid` key

**Step 2: Update TalkgroupDetail.tsx**

- Parse composite ID from URL: `system_id:tgid`
- `getTalkgroup(id)` accepts composite key
- `getTalkgroupCalls(id, params)` for call history
- New: `getTalkgroupUnits(id, params)` for affiliated units
- Display: `tg.system_name`, `tg.group`, `tg.tag`, `tg.description`, `tg.mode`
- Monitor/color operations use `system_id` (number)

**Step 3: Commit**

```bash
git add src/pages/Talkgroups.tsx src/pages/TalkgroupDetail.tsx
git commit -m "feat: update Talkgroup pages for v0.7.3"
```

---

## Task 13: Update Units pages

**Files:**
- Modify: `src/pages/Units.tsx`
- Modify: `src/pages/UnitDetail.tsx`

**Step 1: Update Units.tsx**

- `Unit` type now has `system_id`, `system_name`, `sysid`
- Display `unit.system_name`
- Sort param format: `-last_seen`
- Unit link: `/units/${unit.system_id}:${unit.unit_id}`
- Pagination: `response.total`

**Step 2: Update UnitDetail.tsx**

- Parse composite ID from URL
- `UnitEvent` type has embedded `unit_alpha_tag`, `tg_alpha_tag`, `tg_description`, `system_name`
- No talkgroup cache lookups needed for event display
- New `getUnitCalls()` params

**Step 3: Commit**

```bash
git add src/pages/Units.tsx src/pages/UnitDetail.tsx
git commit -m "feat: update Unit pages for v0.7.3"
```

---

## Task 14: Update Settings page

**Files:**
- Modify: `src/pages/Settings.tsx`

**Step 1: Update Settings.tsx**

- Color rules: key format display shows `system_id:tgid`
- Monitor list: shows `system_id:tgid` keys
- Favorite talkgroups: `system_id:tgid` format
- Any talkgroup lookups for display use API instead of cache

**Step 2: Commit**

```bash
git add src/pages/Settings.tsx
git commit -m "feat: update Settings page for v0.7.3 key formats"
```

---

## Task 15: Update App.tsx routes and lib

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/lib/utils.ts`
- Modify: `src/lib/constants.ts`

**Step 1: Add new routes to App.tsx**

```tsx
import Affiliations from '@/pages/Affiliations'
import TalkgroupDirectory from '@/pages/TalkgroupDirectory'
import Admin from '@/pages/Admin'

// Inside Routes:
<Route path="/affiliations" element={<Affiliations />} />
<Route path="/directory" element={<TalkgroupDirectory />} />
<Route path="/admin" element={<Admin />} />
```

**Step 2: Update lib/utils.ts**

- Add `talkgroupKey()` and `parseTalkgroupKey()` (moved from deleted cache store)
- Update `formatDecodeRate()` if needed — decode rate is now 0-1 ratio, not X/40
- Update any formatter that referenced old field names

**Step 3: Update lib/constants.ts**

- Add new keyboard shortcuts: `GO_TO_AFFILIATIONS: 'g>a'`, `GO_TO_DIRECTORY: 'g>r'`, `GO_TO_ADMIN: 'g>x'`
- Add new navigation items

**Step 4: Commit**

```bash
git add src/App.tsx src/lib/utils.ts src/lib/constants.ts
git commit -m "feat: add new routes and update utilities for v0.7.3"
```

---

## Task 16: Type-check milestone

**Step 1: Run full type-check**

Run: `npm run lint`
Expected: Clean compile (no errors) for all existing updated files. New pages don't exist yet but are imported in App.tsx — temporarily comment them out or create stub files.

**Step 2: Create stub pages for new routes**

Create minimal placeholder pages that compile:
- `src/pages/Affiliations.tsx` — `export default function Affiliations() { return <div>Affiliations</div> }`
- `src/pages/TalkgroupDirectory.tsx` — same pattern
- `src/pages/Admin.tsx` — same pattern

**Step 3: Run type-check again**

Run: `npm run lint`
Expected: Clean compile, zero errors.

**Step 4: Manual browser verification**

Run: `npm run dev`
Verify: App loads, SSE connects, Dashboard shows active calls, recent calls load from API, navigation works.

**Step 5: Commit**

```bash
git add -A
git commit -m "milestone: v0.7.3 migration complete for existing features"
```

---

## Task 17: Build Affiliations page

**Files:**
- Rewrite: `src/pages/Affiliations.tsx`

**Step 1: Implement Affiliations page**

Features:
- Fetch from `getUnitAffiliations(params)` with polling (every 10s)
- Filter controls: system selector, talkgroup filter, status toggle (affiliated/off)
- Table display: unit_id, unit_alpha_tag, tgid, tg_alpha_tag, tg_group, affiliated_since, status
- Summary section: `response.summary.talkgroup_counts` — per-TG unit counts
- Color-code: affiliated (green), off (gray)
- Click unit → `/units/{system_id}:{unit_id}`
- Click talkgroup → `/talkgroups/{system_id}:{tgid}`
- `stale_threshold` param to hide very old entries

**Step 2: Commit**

```bash
git add src/pages/Affiliations.tsx
git commit -m "feat: add Affiliations page — live unit-talkgroup affiliation view"
```

---

## Task 18: Build Talkgroup Directory page

**Files:**
- Rewrite: `src/pages/TalkgroupDirectory.tsx`

**Step 1: Implement TalkgroupDirectory page**

Features:
- Fetch from `getTalkgroupDirectory(params)` with search, category, mode filters
- Search input with debounce
- Filter dropdowns: system, category, mode (D/A/E/M/T)
- Table: tgid, alpha_tag, mode, description, tag, category, system_name
- Pagination with `total`
- Visual indicator for talkgroups that have been heard on-air (cross-reference with `getTalkgroups()` data)
- Link to talkgroup detail page for heard talkgroups

**Step 2: Commit**

```bash
git add src/pages/TalkgroupDirectory.tsx
git commit -m "feat: add Talkgroup Directory page — reference talkgroup browser"
```

---

## Task 19: Build Admin page

**Files:**
- Rewrite: `src/pages/Admin.tsx`

**Step 1: Implement Admin page**

Sections:

**System Merge:**
- Dropdown to select source and target systems (from `getSystems()`)
- Preview showing what will happen
- Execute button calling `mergeSystems(req)`
- Display result (calls_moved, talkgroups_merged, etc.)

**Talkgroup Metadata Editing:**
- Search/browse talkgroups
- Inline edit: alpha_tag, description, group, tag, priority
- Save via `updateTalkgroup(id, patch)`
- Show success/error feedback

**Unit Metadata Editing:**
- Search/browse units
- Inline edit: alpha_tag
- Save via `updateUnit(id, patch)`

**CSV Import:**
- System selector
- File upload input
- Submit via `importTalkgroupDirectory(systemId, file)`
- Show import results (imported count, total rows)

**Step 2: Commit**

```bash
git add src/pages/Admin.tsx
git commit -m "feat: add Admin page — system merge, metadata editing, CSV import"
```

---

## Task 20: Final cleanup and CLAUDE.md update

**Files:**
- Verify deleted: `src/api/websocket.ts`, `src/stores/useTalkgroupCache.ts`
- Modify: `CLAUDE.md`

**Step 1: Verify no dead imports**

Run: `npm run lint`
Expected: Zero errors. If any remain, fix them.

**Step 2: Run dev server and manual verification**

Run: `npm run dev`
Verify:
- Dashboard: SSE connection indicator, active calls update in real-time, recent calls load, recorder grid works, stats display correctly
- Calls: pagination, filtering, deduplication toggle
- Call Detail: inline transmissions and frequencies, transcription display
- Talkgroups: search, sort, system filter
- Units: search, event history
- Affiliations: live data, filters
- Directory: search, category filter
- Admin: system merge form, metadata editing, CSV upload
- Audio player: playback works, transmission timeline renders
- Monitor: auto-play monitored talkgroups on call_end
- Command palette: search works, new navigation targets

**Step 3: Update CLAUDE.md**

Update these sections:
- API Architecture: v0.7.3 with SSE instead of WebSocket
- Stores table: remove useTalkgroupCache, update descriptions
- Key patterns: SSE→Store binding, embedded context (no cache), `system_id:tgid` key format
- New pages: Affiliations, Directory, Admin
- WebSocket section → SSE section with event types
- Remove completed migration status

**Step 4: Build check**

Run: `npm run build`
Expected: Clean build with no errors.

**Step 5: Final commit**

```bash
git add -A
git commit -m "chore: v0.7.3 migration complete — cleanup and update CLAUDE.md"
```

---

## Task Summary

| # | Task | Key Files | Estimated Scope |
|---|------|-----------|----------------|
| 1 | Regenerate OpenAPI types | `generated.ts`, `package.json` | Small |
| 2 | Rewrite types.ts | `types.ts` | Medium |
| 3 | Rewrite API client | `client.ts` | Medium |
| 4 | Create SSE layer | `eventsource.ts` | Medium |
| 5 | Rewrite stores | 7 store files, delete 2 files | Large |
| 6 | Update layout components | 3 layout files | Small |
| 7 | Update call components | 6 component files | Medium |
| 8 | Update command palette | 2 files + constants | Small |
| 9 | Rewrite Dashboard | `Dashboard.tsx` (887 lines) | Large |
| 10 | Update Calls page | `Calls.tsx` | Small |
| 11 | Update CallDetail page | `CallDetail.tsx` | Medium |
| 12 | Update Talkgroup pages | 2 page files | Medium |
| 13 | Update Unit pages | 2 page files | Small |
| 14 | Update Settings page | `Settings.tsx` | Small |
| 15 | Add routes and update lib | `App.tsx`, utils, constants | Small |
| 16 | Type-check milestone | All files | Verification |
| 17 | Build Affiliations page | New page | Medium |
| 18 | Build Directory page | New page | Medium |
| 19 | Build Admin page | New page | Large |
| 20 | Final cleanup | CLAUDE.md, verification | Small |
