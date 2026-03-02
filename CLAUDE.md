# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**tr-dashboard** is a modern, responsive frontend for the tr-engine radio scanning backend. The application serves users monitoring trunk-recorder radio systems, providing both real-time monitoring and historical data analysis.

### Core Goals

1. **Real-time monitoring** - Live call activity, active talkgroups, unit events, system health
2. **Historical analysis** - Searchable call history, playback, filtering, and data exploration
3. **Beautiful UX** - Modern, responsive design that works across devices
4. **API feedback** - Identify gaps in tr-engine API during development

### Backend

tr-engine aggregates data from trunk-recorder radio systems. API documentation lives in `../tr-engine/docs/` (swagger at `/swagger/`, markdown in `docs/api/`).

## Development Commands

```bash
npm install           # Install dependencies
npm run dev           # Start dev server on 0.0.0.0:5173
npm run build         # Type-check (tsc -b) then build with Vite
npm run lint          # Type-check only (tsc --noEmit)
npm run api:generate  # Regenerate TypeScript types from OpenAPI spec
```

There are no tests configured in this project. The `lint` command is the primary code quality check.

Vite proxies `/api` to `https://tr-api.luxprimatech.com` and `/api/events` to the SSE endpoint in dev mode.

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
│   ├── types.ts           # TypeScript types (REST + SSE events)
│   ├── generated.ts       # Auto-generated OpenAPI types (don't edit)
│   └── eventsource.ts     # SSE event source manager singleton
├── stores/                # Zustand state stores
├── components/
│   ├── layout/            # MainLayout, Header, Sidebar
│   ├── audio/             # AudioPlayer, TransmissionTimeline
│   ├── calls/             # CallCard, CallList, TranscriptionPreview
│   ├── command/           # CommandPalette, GoToMenu
│   └── ui/                # shadcn/ui primitives (Button, Card, Badge, etc.)
├── pages/                 # Route page components
├── lib/
│   ├── constants.ts       # Keyboard shortcuts, refresh intervals, colors
│   └── utils.ts           # Formatters and display helpers (cn, formatFrequency, etc.)
├── App.tsx                # React Router route definitions
├── main.tsx               # Entry point
└── index.css              # Tailwind theme (@theme block with custom colors)
```

### Routing

React Router v7 with all routes nested under `MainLayout` (provides sidebar, header, audio player):

```
/                    → Dashboard (live monitoring + recent calls)
/calls               → Call history browser
/calls/:id           → Call detail with transmissions/audio
/talkgroups          → Talkgroup list
/talkgroups/:id      → Talkgroup detail
/units               → Unit list
/units/:id           → Unit detail
/affiliations        → Live unit-talkgroup affiliation status
/directory           → Reference talkgroup directory browser
/settings            → Color rules, favorites, display preferences
/admin               → System merge, metadata editing, CSV import
```

### API Layer (`src/api/`)

- `client.ts`: Typed REST functions organized by domain (Systems, Talkgroups, Units, Calls, Affiliations, Admin). Base URL `/api/v1`. Uses `fetch` with a `request<T>()` wrapper.
- `types.ts`: Hand-written types for API responses and SSE events.
- `generated.ts`: Auto-generated from OpenAPI spec via `npm run api:generate`. Referenced by `types.ts`.
- `eventsource.ts`: Singleton `SSEManager` using the `EventSource` API. Connects to `/api/events`. Auto-reconnect with exponential backoff. Typed event handlers for `call_start`, `call_update`, `call_end`, `unit_event`, `recorder_update`, `rate_update`. Methods: `connect()`, `disconnect()`, `reconnect()`.

### State Management (Zustand Stores)

| Store | File | Purpose | Persisted |
|-------|------|---------|-----------|
| `useRealtimeStore` | `stores/useRealtimeStore.ts` | SSE events, active calls `Map<number, Call>`, decode rates, recorders | No |
| `useAudioStore` | `stores/useAudioStore.ts` | Playback state machine, queue, transmissions, history | No |
| `useMonitorStore` | `stores/useMonitorStore.ts` | Monitored talkgroups `Set<system_id:tgid>`, monitoring toggle | localStorage |
| `useTalkgroupColors` | `stores/useTalkgroupColors.ts` | Color rules, per-talkgroup overrides, hide/highlight modes | localStorage |
| `useFilterStore` | `stores/useFilterStore.ts` | Selected systems, favorite talkgroups, search, time range | localStorage |

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

## API Conventions (tr-engine v0.7.3)

**REST + SSE Pattern:**
- REST API (`/api/v1`) for CRUD operations and queries
- SSE API (`/api/events`) for real-time event streaming

**Key Endpoints:**
- `GET /api/v1/systems` → `{systems: [...], count}` — logical systems
- `GET /api/v1/talkgroups` → `{talkgroups: [...], total}`
- `GET /api/v1/units` → `{units: [...], total}`
- `GET /api/v1/calls` → `{calls: [...], total}`
- `GET /api/v1/calls/:id` → `Call` with inline `src_list`, `freq_list`, `units`
- `GET /api/v1/affiliations` → `{affiliations: [...], total, summary}`
- `GET /api/v1/talkgroup-directory` → `{talkgroups: [...], total}`
- `POST /api/v1/admin/merge-systems` → `SystemMergeResponse`
- `PATCH /api/v1/talkgroups/:id` → Update talkgroup metadata
- `PATCH /api/v1/units/:id` → Update unit metadata
- `POST /api/v1/systems/:id/import-directory` → CSV talkgroup import

**Data Conventions:**
- Frequencies stored in Hz (not MHz)
- Timestamps in ISO 8601 RFC3339 UTC format
- Pagination: `limit` (max 1000, default 50) + `offset`, response uses `total` field
- Composite keys: `system_id:tgid` format (integer system_id)
- Calls include inline `src_list` (transmissions), `freq_list` (frequencies), `units` (participating units)
- API responses embed display names: `tg_alpha_tag`, `system_name`, `unit_alpha_tag`, etc.
- Signal/noise values of 999 are sentinel for "unknown" — display as "—"
- Decode rates are 0-1 ratio (display as percentage)

**SSE Event Types:** `call_start`, `call_update`, `call_end`, `unit_event`, `rate_update`, `recorder_update`

## Remaining Feature Work

- Transcription search/browse UI (types exist, no page yet)
- Call groups browser UI (types exist, no page yet)
- Call heat map — plot geocoded addresses from transcriptions on a map (requires backend NLP/geocoding support first)
