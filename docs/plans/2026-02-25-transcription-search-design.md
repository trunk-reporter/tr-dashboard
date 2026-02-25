# Transcription Search Page

## Goal

Add a full-text search page for transcriptions at `/transcriptions`. The API endpoint (`GET /transcriptions/search`) and client function (`searchTranscriptions()`) already exist. This is purely a frontend feature — no backend changes needed.

## Route & Navigation

- **Route:** `/transcriptions`
- **Sidebar:** New nav item between "Calls" and "Talkgroups" with a text/search icon
- **Router:** Add route in `App.tsx` under `MainLayout`

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/pages/Transcriptions.tsx` | Create — new page component |
| `src/App.tsx` | Modify — add route |
| `src/components/layout/Sidebar.tsx` | Modify — add nav item |

## Page Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ Transcriptions                                                       │
├──────────────────────────────────────────────────────────────────────┤
│ [Search transcriptions...                                  ] [Search]│
│                                                                      │
│ [1h] [6h] [24h] [7d] [All]  | System ▼ | Talkgroup ▼ | 42 results │
├──────────────────────────────────────────────────────────────────────┤
│ ▶ │ 09-8L Main          │ "...requesting backup at the..."│ 3m ago │
│   │ butco · Call #12345  │                                 │  0:23  │
├──────────────────────────────────────────────────────────────────────┤
│ ▶ │ FD Main Dispatch    │ "...engine 4 respond to..."     │ 12m ago│
│   │ butco · Call #12340  │                                 │  0:45  │
└──────────────────────────────────────────────────────────────────────┘
```

## Search Behavior

- Search triggered on Enter key or Search button click (not on every keystroke)
- All filter state stored in URL search params for bookmarkable/shareable URLs
- Empty state shows a prompt to enter a search query
- No results state shows "No transcriptions match your search"

## Filters

- **Time range presets:** 1h, 6h, 24h, 7d, All — sends `start_time` as ISO 8601
- **System dropdown:** Fetched from `getSystems()`, sends `system_id` param
- **Talkgroup input:** Text field for talkgroup ID, sends `tgid` param
- **Result count** displayed right-aligned in filter bar

## Result Row

Each result is a compact row containing:

1. **Play button** (left) — loads parent call into global audio player via `useAudioStore.loadCall()`
2. **Talkgroup name** — linked to `/talkgroups/:system_id::tgid`
3. **System name + Call ID** — Call ID linked to `/calls/:call_id`
4. **Transcription text snippet** — truncated with search terms highlighted (bold + primary color)
5. **Relative timestamp** + call duration (right)

## Query Term Highlighting

Split the search query into individual words. In the transcription text, wrap matching substrings in `<mark className="bg-primary/20 text-primary font-semibold">`. Case-insensitive matching.

## Interactions

- Play button loads call audio without navigating away from search results
- Talkgroup name links to `/talkgroups/:id` detail page
- Call ID links to `/calls/:id` detail page
- Standard pagination component (default 25 per page)

## Data Flow

```
User types query + selects filters
  → searchTranscriptions(q, { system_id, tgid, start_time, limit, offset })
  → TranscriptionSearchResponse { results: TranscriptionSearchHit[], total }
  → Render result rows with highlight + play/link actions
```

## Existing Infrastructure Used

- `searchTranscriptions()` in `src/api/client.ts`
- `TranscriptionSearchHit` / `TranscriptionSearchResponse` types
- `useAudioStore.loadCall()` for play button (needs call_id → fetch call → load)
- `getSystems()` for system dropdown
- `Pagination` component
- `formatRelativeTime()`, `formatDuration()` from `lib/utils`
- `SkeletonRow` for loading state
- URL search params pattern (same as Calls, Units pages)

## Verification

1. `npm run lint` passes
2. `npm run build` passes
3. Sidebar shows new "Transcriptions" link
4. Search returns results with highlighted terms
5. Play button loads audio into global player
6. Links navigate to correct talkgroup/call detail pages
7. Time range presets filter results correctly
8. URL params persist across page loads
