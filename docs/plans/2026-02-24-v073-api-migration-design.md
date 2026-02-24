# tr-dashboard v0.7.3 API Migration Design

**Date:** 2026-02-24
**Scope:** Targeted rewrite of data-touching layers + unit affiliations + talkgroup directory + admin tools

## Context

tr-engine has moved from v0.3.1 to v0.7.3 with breaking changes across the API surface:
- WebSocket replaced by Server-Sent Events (SSE)
- API responses embed all display names (system_name, tg_alpha_tag, etc.)
- System/Site model split (System = logical network, Site = recording point)
- Call IDs are database integers, not composite strings
- Composite key format: `system_id:tgid` (database int) instead of `sysid:tgid` (P25 hex)
- Pagination field renamed: `total` replaces `count`
- Several endpoints removed/replaced, many new endpoints added
- New features: unit affiliations, talkgroup directory, admin tools

## Approach: Targeted Rewrite

Keep the project shell (routing, UI primitives, theme, audio logic, color/monitor stores). Rewrite the API layer, SSE transport, stores, and page components from scratch against the new spec.

### What We Keep As-Is
- `src/components/ui/` — shadcn primitives
- `src/index.css` — theme and Tailwind config
- `src/lib/utils.ts` — `cn()` and formatters (update field names as needed)
- `src/lib/constants.ts` — keyboard shortcuts, intervals, colors
- `src/App.tsx` — route structure (add new routes)
- `src/components/layout/` — MainLayout, Header, Sidebar (update data bindings)
- `src/components/command/` — CommandPalette, GoToMenu
- `vite.config.ts`, `package.json`, `tsconfig.json`

### What Gets Rewritten
- `src/api/types.ts` — all data types
- `src/api/generated.ts` — regenerated from new OpenAPI spec
- `src/api/client.ts` — all API functions
- `src/api/websocket.ts` → `src/api/eventsource.ts` — SSE replaces WebSocket
- `src/stores/useRealtimeStore.ts` — SSE-driven, different events and data shapes
- `src/stores/useTranscriptionCache.ts` — simplified
- Every page component in `src/pages/`
- `src/components/calls/` — CallCard, CallList, TranscriptionPreview
- `src/components/audio/` — AudioPlayer, TransmissionTimeline

### What Gets Deleted
- `src/api/websocket.ts` — replaced by eventsource.ts
- `src/stores/useTalkgroupCache.ts` — API embeds all display names now

### What Gets Updated (Not Rewritten)
- `src/stores/useMonitorStore.ts` — key format change + localStorage migration
- `src/stores/useAudioStore.ts` — call_id type change, audio_url from call object
- `src/stores/useFilterStore.ts` — filter param updates
- `src/stores/useTalkgroupColors.ts` — key format change + localStorage migration

---

## Layer 1: Types (`src/api/types.ts`)

### Regenerate OpenAPI types
Run `npm run api:generate` against the v0.7.3 spec to produce new `generated.ts`.

### Rewrite types.ts

**Remove:**
- `RecentCallInfo`, `RecentCallsResponse` — use `CallListResponse` with `deduplicate=true`
- `System = Site` legacy alias
- Old `CallUnit` shape (had `unit_rid`)
- `ActivityResponse`, `RatesResponse` — replaced by new response types
- All WebSocket types (`WebSocketMessage`, `SubscriptionMessage`, `SubscribedData`, `CallStartData`, `CallEndData`, `CallActiveData`, `AudioAvailableData`, `UnitEventData`, `RateUpdateData`, `RecorderUpdateData`, `WebSocketEventType`)

**Rewrite to match v0.7.3 spec:**
- `System` — logical network with `system_id`, `name`, `system_type`, `sysid`, `wacn`, `sites[]`
- `Site` — recording point with `site_id`, `system_id`, `short_name`, `instance_id`, `nac`, `rfss`, `p25_site_id`
- `Call` — integer `call_id`, embedded context (`system_id`, `system_name`, `sysid`, `site_id`, `site_short_name`, `tg_alpha_tag`, `tg_description`, `tg_tag`, `tg_group`), inline `src_list[]`, `freq_list[]`, `unit_ids[]`, `call_state`, `mon_state`, `transcription_status`
- `Talkgroup` — `system_id` (int) + `system_name` + `sysid`
- `Unit` — `system_id` (int) + `system_name` + `sysid`, embedded last event context
- `UnitEvent` — embedded `system_name`, `unit_alpha_tag`, `tg_alpha_tag`, `tg_description`
- `CallUnit` — now has `system_id`, `unit_id`, `alpha_tag`
- `CallGroup` — enriched with embedded display names
- `Transcription` — `source`, `is_primary`, `words.segments[]`
- `Recorder` — composite `id`, `src_num`, `rec_num`, `type`, `rec_state`, embedded TG/unit context
- `StatsResponse` — `systems`, `talkgroups`, `units`, `total_calls`, `calls_24h`, `calls_1h`, `total_duration_hours`, `system_activity[]`
- `HealthResponse` — `status` enum, `uptime_seconds`, `checks{}`, `trunk_recorders[]`
- All list responses: use `total` instead of `count`

**Add new types:**
- Enums: `SystemType`, `TalkgroupMode`, `EventType`, `CallState`, `MonState`, `RecState`, `TranscriptionStatus`, `TranscriptionSource`
- `Affiliation` + `AffiliationListResponse`
- `TalkgroupDirectoryEntry`
- `TalkgroupActivity`
- `CallTransmission` (inline srcList shape: `src`, `tag`, `time`, `pos`, `duration`, `emergency`)
- `CallFrequency` (inline freqList shape: `freq`, `time`, `pos`, `len`, `error_count`, `spike_count`)
- `DecodeRate` + `DecodeRatesResponse`
- `SystemActivity`
- `ActiveCallListResponse`
- `TranscriptionSearchHit` + `TranscriptionSearchResponse`
- `TalkgroupEncryptionStat` + `EncryptionStatsResponse`
- `SSEEventType` enum: `call_start | call_update | call_end | unit_event | recorder_update | rate_update | trunking_message | console`

---

## Layer 2: API Client (`src/api/client.ts`)

### Changed endpoints
| Old | New | Changes |
|-----|-----|---------|
| `getSystems()` | `getSystems()` | Returns `{systems: System[], total}` not `{sites: [], count}` |
| `getP25Systems()` | `getP25Systems()` | Returns `{systems: P25System[], total}` not `{p25_systems: [], count}` |
| `getCalls(params)` | `getCalls(params)` | New params: `sysid`, `system_id`, `site_id`, `tgid`, `unit_id` (comma-sep), `deduplicate`, `sort` with `-` prefix |
| `getActiveCalls(params)` | `getActiveCalls(params)` | Returns `ActiveCallListResponse` (`{calls, total}` without pagination) |
| `getStats()` | `getStats()` | New response with `system_activity[]`, renamed fields |
| `getDecodeRates(params)` | `getDecodeRates(params)` | Returns `DecodeRatesResponse` with `DecodeRate[]` |
| `getRecorders()` | `getRecorders()` | Returns `{recorders: Recorder[], total}` with new Recorder shape |
| `getCallTransmissions(id)` | `getCallTransmissions(id)` | Returns `{transmissions: CallTransmission[], total}` (new shape) |
| `getCallFrequencies(id)` | `getCallFrequencies(id)` | Returns `{frequencies: CallFrequency[], total}` (new shape) |
| `searchTranscriptions(q, params)` | `searchTranscriptions(q, params)` | New response with `TranscriptionSearchHit[]`, new filter params |
| `getTranscriptionStatus()` | `getTranscriptionQueueStatus()` | Endpoint moved to `/transcriptions/queue` |
| `getEncryptionStats(hours)` | `getEncryptionStats(params)` | New response shape with `TalkgroupEncryptionStat[]` |

### Removed
| Function | Replacement |
|----------|-------------|
| `getRecentCalls(limit, deduplicate)` | `getCalls({sort: '-stop_time', deduplicate: true, limit})` |
| `getActiveCallsRealtime()` | `getActiveCalls()` (single endpoint now) |
| `getActivity()` | `getTalkgroupActivity(params)` |
| `getSystemTalkgroups(id, params)` | `getTalkgroups({system_id: id, ...params})` |

### New endpoints
| Function | Endpoint | Purpose |
|----------|----------|---------|
| `getSystem(id)` | `GET /systems/{id}` | Single system with sites |
| `updateSystem(id, patch)` | `PATCH /systems/{id}` | Update system metadata |
| `getSite(id)` | `GET /sites/{id}` | Single recording site |
| `updateSite(id, patch)` | `PATCH /sites/{id}` | Update site metadata |
| `updateTalkgroup(id, patch)` | `PATCH /talkgroups/{id}` | Update talkgroup metadata |
| `getTalkgroupUnits(id, params)` | `GET /talkgroups/{id}/units` | Units on a talkgroup |
| `updateUnit(id, patch)` | `PATCH /units/{id}` | Update unit metadata |
| `getUnitAffiliations(params)` | `GET /unit-affiliations` | Live affiliation state |
| `getGlobalUnitEvents(params)` | `GET /unit-events` | System-wide unit events |
| `getTalkgroupDirectory(params)` | `GET /talkgroup-directory` | Reference directory search |
| `importTalkgroupDirectory(systemId, file)` | `POST /talkgroup-directory/import` | CSV upload |
| `getTalkgroupActivity(params)` | `GET /stats/talkgroup-activity` | Activity summary |
| `listCallTranscriptions(callId)` | `GET /calls/{id}/transcriptions` | All variants |
| `submitTranscription(callId, data)` | `PUT /calls/{id}/transcription` | Submit correction |
| `verifyTranscription(callId)` | `POST /calls/{id}/transcription/verify` | Verify |
| `rejectTranscription(callId)` | `POST /calls/{id}/transcription/reject` | Reject |
| `excludeFromDataset(callId)` | `POST /calls/{id}/transcription/exclude` | Exclude |
| `mergeSystems(req)` | `POST /admin/systems/merge` | Merge systems |
| `executeQuery(sql, params, limit)` | `POST /query` | Ad-hoc SQL |

---

## Layer 3: SSE Layer (`src/api/eventsource.ts`)

**Delete** `src/api/websocket.ts`. **Create** `src/api/eventsource.ts`.

### SSEManager class

```typescript
type SSEEventType = 'call_start' | 'call_update' | 'call_end' | 'unit_event'
  | 'recorder_update' | 'rate_update' | 'trunking_message' | 'console'

interface SSEFilters {
  systems?: string    // comma-separated system IDs
  sites?: string      // comma-separated site IDs
  tgids?: string      // comma-separated talkgroup IDs
  units?: string      // comma-separated unit RIDs
  types?: string      // comma-separated event types
  emergency_only?: boolean
}
```

**Key differences from WebSocket:**
- Filter via URL query params (not subscription messages)
- Browser `EventSource` handles auto-reconnect natively
- `Last-Event-ID` sent automatically on reconnect for gapless recovery
- Server sends keepalive comments every 15s (not client-side health check)
- To change filters: close EventSource, open new one with updated URL
- Events have typed `event:` field — listen with `es.addEventListener('call_start', ...)`

**Connection status:** Track via `EventSource.readyState` (CONNECTING=0, OPEN=1, CLOSED=2) plus `onerror` handler.

**No health check needed** — SSE keepalive handled by server, browser reconnects automatically.

---

## Layer 4: Stores

### Delete: `useTalkgroupCache.ts`
API embeds `tg_alpha_tag`, `system_name`, `unit_alpha_tag` in all responses. No client-side lookup table needed.

### Rewrite: `useRealtimeStore.ts`
- SSE-driven instead of WebSocket
- `activeCalls: Map<number, Call>` — keyed by integer `call_id`
- `call_start` → add Call to map
- `call_update` → merge partial Call into existing entry
- `call_end` → full Call with `audio_url`, trigger monitor/audio queue, remove from active
- `decodeRates: Map<number, DecodeRate>` — keyed by `system_id`
- `recorders: Recorder[]`
- `recentUnitEvents: UnitEvent[]` — capped rolling buffer from SSE
- `connectionStatus: ConnectionStatus`
- Remove `recentCalls` from store — pages fetch via API

### Update: `useMonitorStore.ts`
- Key format: `${system_id}:${tgid}` (was `${sysid}:${tgid}`)
- One-time localStorage migration on startup: read old keys, convert, write new
- `isMonitored(systemId: number, tgid: number): boolean`

### Update: `useAudioStore.ts`
- `currentCall.call_id` is `number` (was `string`)
- Audio URL from `call.audio_url` field (always embedded)
- Auto-queue triggered by `call_end` SSE event (replaces `audio_available` WS event)
- Remove `AUDIO_QUEUE_DELAY_MS` — `call_end` fires when audio is written
- Playback state machine unchanged

### Simplify: `useTranscriptionCache.ts`
- `transcription_text` and `has_transcription` are embedded in Call objects
- Cache only stores full `Transcription` objects (with word-level data) for detail views
- Remove auto-fetch-after-delay pattern

### Update: `useFilterStore.ts`
- `selectedSystems: number[]` (was string-based)
- Filter params match new API (`system_id`, `tgid`, `site_id`, etc.)

### Update: `useTalkgroupColors.ts`
- Key format: `${system_id}:${tgid}`
- One-time localStorage migration on startup

---

## Layer 5: Pages & Components

### Update existing pages

**Dashboard.tsx:**
- Active calls from SSE store (Call objects, not custom ActiveCall type)
- Display names from `call.tg_alpha_tag`, `call.system_name`, `call.site_short_name` — no cache lookups
- Stats from `getStats()` with new `system_activity[]` for per-system breakdown
- Recorder grid from SSE store with new Recorder shape

**Calls.tsx:**
- New query params (`sysid`, `tgid`, `unit_id`, `deduplicate`, `sort=-start_time`)
- Pagination uses `total` field
- Each call has embedded context for display

**CallDetail.tsx:**
- `call_id` is integer in URL param
- Transmissions from inline `call.src_list[]` (no separate fetch needed for display)
- Frequencies from inline `call.freq_list[]`
- Transcription from embedded `call.transcription_text` + fetch full on demand
- Show `call_state`, `site_short_name`, `tg_group`

**Talkgroups.tsx / TalkgroupDetail.tsx:**
- `system_id` field, `system_name` for display
- New sort format with `-` prefix

**Units.tsx / UnitDetail.tsx:**
- `system_id` field, embedded last event context
- Unit events have embedded display names

**Settings.tsx:**
- Update key format references in color rule display

### New pages

**Affiliations.tsx:**
- Polls `/unit-affiliations` or uses SSE `unit_event` data
- Shows live unit-talkgroup affiliation state
- Filter by system, talkgroup, status (affiliated/off)
- Summary: `talkgroup_counts` from response

**TalkgroupDirectory.tsx:**
- `/talkgroup-directory` with search, category, mode filters
- Browse all known talkgroups (including unheard ones)
- Compare with active talkgroups
- CSV import (admin feature)

**Admin.tsx:**
- System merge tool: select source/target, preview, execute
- Talkgroup metadata editing: inline edit alpha_tag, description, group, tag, priority
- Unit metadata editing: inline edit alpha_tag
- Talkgroup CSV import: file upload with system selection

### Update components

**CallCard.tsx:**
- Use `call.tg_alpha_tag`, `call.system_name`, `call.site_short_name` directly
- Remove all talkgroup cache lookups
- Show `call.transcription_text` preview when available

**AudioPlayer.tsx / TransmissionTimeline.tsx:**
- `CallTransmission` has new shape: `src`, `tag`, `pos`, `duration`
- Audio URL from `call.audio_url`

**Header.tsx:**
- SSE connection status (from store)
- Updated stats display

**Sidebar.tsx:**
- Add navigation items: Affiliations, Directory, Admin

### New routes in App.tsx
```
/affiliations         → Affiliations
/directory            → TalkgroupDirectory
/admin                → Admin
```

---

## Layer 6: Cleanup

- Delete `src/api/websocket.ts`
- Delete `src/stores/useTalkgroupCache.ts`
- Remove all imports of deleted modules
- Update `CLAUDE.md` with new architecture (SSE, no talkgroup cache, new stores, new pages)
- Verify vite proxy works for SSE (`/api/v1/events/stream` — same `/api` proxy should work)
- Update `api:generate` script in `package.json` if OpenAPI spec URL changed

---

## Migration Order

1. Types + regenerate OpenAPI
2. API client
3. SSE layer
4. Stores (delete talkgroup cache, rewrite realtime, update others)
5. Pages and components (existing pages first, then new pages)
6. Cleanup and CLAUDE.md update

Each layer is a potential commit point. The app will have type errors between layers but the direction of work is always forward.
