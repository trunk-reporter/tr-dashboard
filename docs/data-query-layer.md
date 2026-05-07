# Dashboard Data Query Layer

Server data flows through three layers:

1. `src/api/client.ts` owns HTTP transport, auth headers, refresh handling, and typed endpoint functions.
2. `src/api/services.ts` defines domain services and stable `queryKeys` for pages and components.
3. `src/api/query.ts` provides `QueryProvider`, `useApiQuery`, `useApiMutation`, cache invalidation, request de-duplication, stale-time handling, and normalized loading/error flags.

Pages should call domain services through `useApiQuery` instead of keeping their own fetch/cache effects. Use page state, URL params, and Zustand only for client state.

## Reads

Use a domain query key plus a service function:

```tsx
const callsQuery = useApiQuery(
  queryKeys.calls.list(params),
  () => callService.list(params),
  { staleTime: 10_000 }
)
```

The returned state is the standard shape for server reads:

- `data`: last successful response, if any
- `isLoading`: first load with no cached data
- `isFetching`: any in-flight request, including refreshes
- `error` / `isError`: displayable error state
- `refetch`: forced refresh for manual reload actions

Use explicit empty states when `!isLoading && data` exists but the collection is empty. Keep loading skeletons for `isLoading`, and preserve old `data` during background refreshes.

## Pagination

Paginated params belong in the query key:

```tsx
const params = { limit: pageSize, offset, sort: '-start_time' }
useApiQuery(queryKeys.calls.list(params), () => callService.list(params))
```

List responses should use the backend `total` with the local `limit` and `offset`. Do not concatenate pages into a Zustand store unless the UX deliberately needs an infinite list cache; document that exception next to the store.

## Writes

Use `useApiMutation` for server writes and invalidate the affected domain keys:

```tsx
const updateTalkgroup = useApiMutation(
  ({ id, patch }) => talkgroupService.update(id, patch),
  { invalidate: [queryKeys.talkgroups.all] }
)
```

Mutation handlers should keep optimistic UI local and short-lived. After success, invalidation makes the server cache authoritative again.

## Refresh And Realtime

Use `refetch()` for explicit user refresh actions. Realtime stores may overlay live data on top of query results, as `Calls` does for active calls, but the REST query remains the source of truth for historical data and pagination totals.

## Zustand Boundary

Zustand is for UI/client state: auth/session tokens, audio playback, filters, theme, thresholds, PWA update flags, alert settings, and realtime overlays. It should not be the default cache for REST responses.

Existing exceptions:

- `useTranscriptionCache` caches per-call transcription previews for call cards while list pages migrate to the shared query layer.
- `useRealtimeStore` stores SSE state because it is event-stream state, not a REST snapshot.

New REST-backed stores should not be added without documenting why `useApiQuery` is insufficient.
