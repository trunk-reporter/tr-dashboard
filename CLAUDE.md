# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. Prefer AGENTS.md for active agent instructions when both exist; keep them in sync.


## Project Overview

**tr-dashboard** is a modern, responsive frontend for the tr-engine radio scanning backend. The application serves users monitoring trunk-recorder radio systems, providing both real-time monitoring and historical data analysis.

### Core Goals

1. **Real-time monitoring** - Live call activity, active talkgroups, unit events, system health
2. **Historical analysis** - Searchable call history, playback, filtering, and data exploration
3. **Beautiful UX** - Modern, responsive design that works across devices
4. **API feedback** - Identify gaps in tr-engine API during development

### Backend

tr-engine aggregates data from trunk-recorder radio systems. Source of truth for the API is `../tr-engine/openapi.yaml` (Swagger UI on the engine at `/docs.html`).

## Development Commands

```bash
npm install           # Install dependencies
npm run dev           # Start dev server on 0.0.0.0:5173
npm run build         # Type-check (tsc -b) then build with Vite
npm run lint          # Type-check only (tsc --noEmit)
npm run api:generate  # Regenerate TypeScript types from OpenAPI spec
```

There is no automated unit-test suite yet (`TODO.md` tracks vitest). `npm run lint` / `npm run build` are the primary quality checks. See `docs/quality-gates.md`.

Dev proxy: set `TR_ENGINE_URL` in `.env` (e.g. `http://localhost:8080`). Vite then proxies `/api` and `/health` to that origin. Optional `TR_API_KEY` is added as `Authorization: Bearer` only to proxied requests that carry no `Authorization` header (dev only; never inject keys in a deployment).

## Tech Stack

- **React 19 + TypeScript** (strict mode, `noUnusedLocals`, `noUnusedParameters`)
- **Vite 7** - Build tool
- **Tailwind CSS v4** (via `@tailwindcss/vite` plugin, theme defined in `src/index.css`)
- **shadcn/ui** - Component primitives (Radix-based), in `src/components/ui/`
- **Zustand v5** - State management with persist middleware
- **React Router v7** - Routing
- **react-hotkeys-hook + cmdk** - Keyboard shortcuts and command palette
- **openapi-typescript** - Auto-generated types from backend OpenAPI spec

## Design

Full design plan with UI mockups: `docs/DESIGN_PLAN.md`

Selected design: **Option C "Hybrid Scanner"** - Dense information display with modern aesthetics, collapsible sidebar, split-pane layout, transmission timeline in audio player.

## Architecture

### Path Aliases

All imports use `@/` alias mapped to `src/`. Example: `import { cn } from '@/lib/utils'`

### Source Structure

```
src/
├── api/
│   ├── client.ts         # REST API client (fetch wrapper with typed functions)
│   ├── auth.ts            # GET /whoami, auth status decisions, key connect/forget
│   ├── tickets.ts         # Ticket cache for EventSource / <audio> URLs
│   ├── types.ts           # TypeScript types (REST + SSE events)
│   ├── generated.ts       # Auto-generated OpenAPI types (don't edit)
│   └── eventsource.ts     # SSE event source manager singleton
├── stores/                # Zustand state stores
├── components/
│   ├── auth/              # AuthGate, ConnectKey (key screen + KeyForm), ApiKeyCard, RestrictionEditor
│   ├── layout/            # MainLayout, Header, Sidebar
│   ├── audio/             # AudioPlayer, TransmissionTimeline
│   ├── calls/             # CallCard, CallList, TranscriptionPreview
│   ├── command/           # CommandPalette, GoToMenu
│   └── ui/                # shadcn/ui primitives (Button, Card, Badge, etc.)
├── pages/                 # Route page components
├── lib/
│   ├── access.ts          # Nav visibility by scope / restriction (useNavVisible)
│   ├── constants.ts       # Keyboard shortcuts, refresh intervals, colors
│   └── utils.ts           # Formatters and display helpers (cn, formatFrequency, etc.)
├── App.tsx                # React Router route definitions
├── main.tsx               # Entry point
└── index.css              # Tailwind theme (@theme block with custom colors)
```

### Routing

React Router v7. Every route sits under `AuthGate` + `MainLayout` (sidebar, header, audio player); `AuthGate` shows the key screen, the engine-too-old notice or an error screen instead when `/whoami` says so. Lazy-loaded pages are wrapped in `Suspense`. `App` keys the `QueryProvider` on the API key, so setting, replacing or forgetting the key remounts the pages with an empty cache.

```
/                    → Dashboard (live monitoring + recent calls)
/calls               → Call history browser
/calls/:id           → Call detail with transmissions/audio
/transcriptions      → Transcription search
/talkgroups          → Talkgroup list
/talkgroups/:id      → Talkgroup detail
/talkgroups/:id/analytics → Talkgroup analytics
/units               → Unit list
/units/suggestions   → Unit tag suggestion review queue (approve / edit / dismiss)
/units/:id           → Unit detail
/systems             → Recorders / systems overview
/systems/:id         → System detail
/affiliations        → Live unit-talkgroup affiliation status
/directory           → Reference talkgroup directory browser
/call-groups         → Call groups browser
/call-groups/:id     → Call group detail
/investigate         → Investigate timeline
/settings            → API key card, colors, favorites, display prefs
/admin               → System merge, maintenance, CSV import (admin scope)
/access              → API keys, anonymous access policy, audit log (admin scope)
/login, /users       → Removed; redirect to / and /access
```

### API Layer (`src/api/`)

- `client.ts`: Typed REST functions + `request<T>()` wrapper. Base URL `API_BASE` (`/api/v1`, or `VITE_API_BASE`). Sends `Authorization: Bearer <apiKey>` when a key is stored and nothing otherwise (no cookies, no refresh). A 401 `invalid_key` (or `key_required` without a key) re-runs `/whoami` via the `onAuthFailure` hook; 401/403 auth errors get user-facing messages (`describeError`: "Your key can't do this (needs edit)"). Functions for `x-restricted: deny` endpoints (units, affiliations, unit tag suggestions, stats, recorders, encryption stats, talkgroup units, P25 systems, transcription queue) return `Promise<T | Unavailable>`: while `whoami.restricted` is true they short-circuit to `UNAVAILABLE` without a request, and a 403 `restricted_credential` also becomes `UNAVAILABLE`. Check with `isUnavailable()`. `callAudioUrl(id)` builds `${API_BASE}/calls/{id}/audio` (never from the root-relative `audio_url`).
- `auth.ts`: `GET /whoami` (`fetchWhoami`), `initAuth`/`recheckAuth` (decide `useAuthStore.status`), `connectKey` (validate + store; rejects upload-only keys and the retired public token), `forgetKey`, `continueWithoutKey`.
- `tickets.ts`: `getTicket({minRemaining, fresh})` caches one ticket per key (`POST /tickets`, 600 s); `mediaUrl(url)` appends one with ≥5 min left, the SSE manager asks for ≥60 s. Tickets are only added right before use (EventSource URL, `<audio src>`).
- `types.ts`: Hand-written types for API responses and SSE events.
- `generated.ts`: Auto-generated from OpenAPI via `npm run api:generate`.
- `eventsource.ts`: Singleton `SSEManager` → `GET /api/v1/events/stream`. With a key it mints a ticket right before every (re)connect (`?ticket=`). On `error` it closes and reconnects itself with a fresh ticket, `last_event_id` and backoff (1 s → 30 s); after 3 failures without an open it re-checks `/whoami`. `event: auth` → reconnect only for `ticket_expired`, otherwise stop and re-run `/whoami`. It subscribes to `apiKey` and reconnects when the key changes. Handlers for `call_start`, `call_end`, `unit_event`, `recorder_update`, `rate_update`, `console` (only admin keys receive it), etc. (`call_update` remains typed for compatibility but tr-engine currently does not emit it.)

### Auth (`useAuthStore`)

tr-engine authenticates client software with API keys (scopes `listen` < `edit` < `admin`, plus `upload`); there are no users or logins. State: `{ apiKey, candidateKey, whoami, status, error, restricted }`, persisted as `tr-dashboard-auth` v3 (`apiKey`, `candidateKey` only; the v2 `writeToken` migrates to a *candidate* key that is kept only if `/whoami` accepts it with `listen`).

`status` (decided by `AuthGate` from `GET /whoami`):

- **loading** — whoami in flight
- **ready** — with the key, or anonymously when `whoami.anonymous.access` is `listen`
- **needs-key** — no key and anonymous access `off` → full-page "Connect to tr-engine" key screen
- **invalid-key** — 401 `invalid_key`, an upload-only key, or a value the engine ignored → key screen explaining why, plus "Continue without a key" when anonymous access is `listen`
- **engine-too-old** — `/whoami` 404, or a 401 without an API-key error code → "upgrade tr-engine", never the key screen
- **error** — network/unexpected response, with Retry

Gating: `hasScope(scope)`, `canEdit()`, `isAdmin()` and reactive `useHasScope`/`useCanEdit`/`useIsAdmin`/`useRestricted`. Edit buttons (talkgroup/unit tags, unit tag suggestions) need `edit`; Admin and Access need `admin`. When `restricted`, Deny-endpoint data is skipped (`Unavailable`), its polling stops, and `lib/access.ts` (`useNavVisible`) hides Units, Affiliations, Systems (recorders) and unit suggestions from the sidebar, palette, Go To menu and shortcuts. Pages that mix Enforced and Deny calls load them separately (`Promise.allSettled`, or split) so Enforced data still renders.

### State Management (Zustand Stores)

| Store | File | Purpose | Persisted |
|-------|------|---------|-----------|
| `useAuthStore` | `stores/useAuthStore.ts` | API key, `/whoami`, auth status, restricted | apiKey, candidateKey |
| `useRealtimeStore` | `stores/useRealtimeStore.ts` | SSE events, active calls, decode rates, recorders | No |
| `useAudioStore` | `stores/useAudioStore.ts` | Playback state machine, queue, transmissions | No |
| `useMonitorStore` | `stores/useMonitorStore.ts` | Monitored talkgroups, monitoring toggle | localStorage |
| `useTalkgroupColors` | `stores/useTalkgroupColors.ts` | Color rules, overrides, hide/highlight | localStorage |
| `useFilterStore` | `stores/useFilterStore.ts` | Systems, favorites, search, time range | localStorage |
| `useThemeStore` / alerts / toasts / etc. | `stores/*` | UI chrome and secondary features | varies |

### Key Architectural Patterns

**Composite Keys**: Talkgroups/Units use `"system_id:tgid"` or `"system_id:unit_id"` strings as map keys throughout stores and components. `system_id` is a `number` (the logical system ID from the backend). Helper functions `talkgroupKey(systemId, tgid)` and `parseTalkgroupKey(key)` in `lib/utils.ts`.

**SSE → Store Binding**: `initializeRealtimeConnection()` (called in `MainLayout`) connects the SSE event source and wires typed events to store actions. Events flow: `SSEManager` → event handler → `useRealtimeStore` actions.

**Embedded Context**: API responses embed display names directly (e.g., `tg_alpha_tag`, `system_name`, `unit_alpha_tag`). No client-side talkgroup cache needed — display names come from the API.

**Audio Playback State Machine**: `useAudioStore` uses explicit states: `'idle' | 'loading' | 'playing' | 'paused' | 'blocked' | 'error'`. The HTML audio element's event handlers (`onPlay`, `onPause`, `onEnded`) are the source of truth — UI reads state from store, never manipulates audio element directly.

**Persisted Stores**: `useMonitorStore` serializes `Set` ↔ `Array` for JSON/localStorage. Key: `'tr-dashboard-monitor'`.

**Talkgroup Color Rules**: `useTalkgroupColors` matches keywords against talkgroup fields with wildcard support (`*osp*` = substring, `osp*` = starts-with, `osp` = whole word). First matching rule wins. Modes: `'color' | 'hide' | 'highlight'`.

**Data Fetching**: Pages use `useEffect` + API client functions. Polling intervals defined in `lib/constants.ts` (`REFRESH_INTERVALS`).

### Styling

Tailwind v4 with custom theme in `src/index.css` `@theme` block. Dark theme (slate-900 background, amber-500 primary). Uses `cn()` utility (clsx + tailwind-merge) for conditional classes. Custom CSS classes for scrollbar styling.

## Radio System Domain Model

Understanding the P25 trunked radio hierarchy is essential for this codebase:

```
┌─────────────────────────────────────────────────────────────┐
│ P25 System (sysid)                                          │
│ Example: Ohio MARCS = sysid 348                             │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │ Site/Instance   │  │ Site/Instance   │  ...             │
│  │ butco (Butler)  │  │ warco (Warren)  │                  │
│  │ system_id=1     │  │ system_id=17    │                  │
│  └────────┬────────┘  └────────┬────────┘                  │
│           │                    │                            │
│           └────────┬───────────┘                            │
│                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Shared Talkgroups & Units (statewide)               │   │
│  │ - Talkgroup 9178 "09-8L Main" exists once           │   │
│  │ - Unit 943001 "09 8COM1" can affiliate anywhere     │   │
│  │ - Composite key: system_id:tgid (e.g., "1:9178")   │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Key Concepts:**
- **system_id** = Logical system identifier in the backend (integer)
- **sysid** (e.g., "348") = The statewide P25 system identifier (Ohio MARCS)
- **wacn** (e.g., "BEE00") = Wide Area Communication Network ID (shared statewide)
- **nac** = Network Access Code - **unique per site** (340=butco, 34D=warco)
- **short_name** (butco, warco) = User-defined name for the trunk-recorder instance
- **Talkgroups/Units** = Shared across all sites in the system; same radio IDs work statewide
- **Calls** = Tagged with `system_id` and reference talkgroups by `tgid`

**Current Sites:**
| short_name | NAC | RFSS | site_id | system_id |
|------------|-----|------|---------|-----------|
| butco | 340 | 4 | 1 | 1 |
| warco | 34D | 1 | 13 | 17 |

## API Conventions (tr-engine)

**REST + SSE:**
- REST under `/api/v1` for CRUD and queries
- SSE at `/api/v1/events/stream` (not `/api/events`)

**Auth discovery:** `GET /api/v1/whoami` (public) → `{ credential: key|anonymous, key, scopes (expanded), restricted, anonymous: {access: off|listen, restricted}, version }`; 401 `invalid_key` for a bad key. Keys go only in `Authorization: Bearer`; `?ticket=` (from `POST /tickets`) only on `/events/stream`, `/audio/live`, `/calls/{id}/audio`. Each operation's `x-scope`/`x-restricted` in `openapi.yaml` says what it needs. Admin endpoints: `/keys`, `/anonymous-access`, `/admin/audit-log`.

**Key endpoints (non-exhaustive):**
- `GET /api/v1/systems`, `/talkgroups`, `/units`, `/calls`, `/affiliations`
- `GET /api/v1/calls/:id` — call with inline `src_list` / `freq_list` when available
- `GET /api/v1/transcriptions/search` — full-text transcription search
- `GET /api/v1/talkgroup-directory`
- `PATCH /api/v1/talkgroups/:id`, `PATCH /api/v1/units/:id`
- `POST /api/v1/admin/systems/merge`, maintenance endpoints under `/api/v1/admin/*`

Regenerate client types after engine OpenAPI changes: `npm run api:generate` (expects `../tr-engine/openapi.yaml`).

**Data conventions:**
- Frequencies in Hz (not MHz)
- Timestamps ISO 8601 RFC3339 UTC
- Composite keys `"system_id:tgid"` / `"system_id:unit_id"` in the UI
- Pagination: `limit` (max 1000, default 50) + `offset`, response uses `total` field
- Composite keys: `system_id:tgid` format (integer system_id)
- Calls include inline `src_list` (transmissions), `freq_list` (frequencies), `units` (participating units)
- API responses embed display names: `tg_alpha_tag`, `system_name`, `unit_alpha_tag`, etc.
- Signal/noise values of 999 are sentinel for "unknown" — display as "—"
- Decode rates are 0-1 ratio (display as percentage)

**SSE Event Types:** `call_start`, `call_update`, `call_end`, `transcription`, `unit_event`, `rate_update`, `recorder_update`, `trunking_message`, `console` (admin keys only), plus the `auth` control event (`{code}`) sent before tr-engine closes a stream for auth reasons. Restricted credentials only get call/transcription/unit events for allowed talkgroups.

**System Types:** `p25`, `smartnet`, `conventional`, `conventionalP25`, `conventionalDMR`, `conventionalSIGMF`

**Unit Event Types:** `on`, `off`, `join`, `call`, `end`, `data`, `ans_req`, `location`, `ackresp`, `signal`
- Signal events (`event_type: "signal"`) carry `signaling_type` (MDC1200, FLEETSYNC, STAR) and `signal_type` (normal, emergency, radio_check, etc.) — identifies transmitting radios on analog/conventional systems via in-band signaling

## Remaining Feature Work

See `docs/ROADMAP.md` for the full roadmap. Key near-term items:

- Call groups browser UI (types exist, no page yet)
- Signal quality (SNR) trends per talkgroup for analog channel tuning
- Emergency signal alerts (MDC1200 emergency activation)
- Code splitting for bundle size reduction
