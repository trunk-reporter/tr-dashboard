# tr-engine API/Auth Contract Audit for Dashboard MVP

Date: 2026-05-07
Issue: AUG-15
Repos audited:

- `tr-dashboard` branch `agent/gptd/a1f3cb1f`
- `tr-engine` branch `agent/gptd/a1f3cb1f`

## Summary

The dashboard MVP is mostly covered by the current `tr-engine` REST/SSE contract. Core read flows for systems, calls, talkgroups, units, affiliations, transcriptions, call groups, recorders, and stats all have matching OpenAPI paths. The main blockers before larger UI work are contract hygiene and auth-mode edge cases, not missing CRUD endpoints.

The highest-priority gaps are:

- Dashboard type generation is not reproducible from the repo as-is: `package.json` expects `./openapi.yaml`, but the dashboard repo does not include that file.
- `tr-engine` OpenAPI omits `GET /auth/setup`, which the dashboard calls to decide whether to show first-run setup.
- `/auth-init` derives `mode` and `jwt_enabled` from `ADMIN_PASSWORD`, while the server registers JWT routes from `JWT_SECRET`. Deployments with `JWT_SECRET` but no `ADMIN_PASSWORD` can be misreported to the dashboard.
- Token-mode UX is incomplete in the dashboard: `/auth-init` intentionally does not return the shared token in `token` mode, but `RequireAuth` allows the app through before the user enters a token, so initial API calls fail with 401 until the user discovers Settings.

## Dashboard Capability Map

| Dashboard capability | Dashboard client/page | Engine/OpenAPI support | Status |
| --- | --- | --- | --- |
| Auth mode bootstrap | `detectAuthMode`, `RequireAuth` | `GET /auth-init` | Supported, but JWT detection bug in engine |
| First admin setup | `Login`, `checkNeedsSetup`, `setupFirstUser` | `POST /auth/setup`; actual `GET /auth/setup` exists in server | Spec gap: GET missing |
| User login/session refresh/logout | `login`, `refreshAuth`, `logoutApi` | `/auth/login`, `/auth/refresh`, `/auth/logout` | Supported |
| Current user/profile | Not currently wrapped except auth store response | `GET /auth/me` | Available, optional for MVP |
| User admin | `Users.tsx` | `/users`, `/users/{id}` | Supported |
| API key management | Not yet surfaced in dashboard | `/auth/keys`, `/auth/keys/all`, `/auth/keys/service` | Not needed for current MVP UI, useful future settings/admin work |
| Systems/sites metadata | `SystemDetail`, admin merge/settings | `/systems`, `/systems/{id}`, `/sites/{id}`, `/p25-systems`, `/admin/systems/merge` | Supported |
| Talkgroup browse/search/edit | `Talkgroups`, details, directory | `/talkgroups`, `/talkgroups/{id}`, `/talkgroup-directory`, directory import | Supported |
| Unit browse/search/edit | `Units`, detail pages | `/units`, `/units/{id}`, `/units/{id}/calls`, `/units/{id}/events`, `/unit-events` | Supported |
| Live affiliations | `Affiliations` | `/unit-affiliations` | Supported |
| Call history/detail/audio | `Dashboard`, `Calls`, `CallDetail` | `/calls`, `/calls/active`, `/calls/{id}`, `/calls/{id}/audio`, transmissions/frequencies | Supported |
| Transcription browse/search/actions | `Transcriptions`, call pages | call transcription endpoints, `/transcriptions/search`, `/transcriptions/queue` | Supported; dashboard does not yet use batch endpoint |
| Call groups | `CallGroups`, detail page | `/call-groups`, `/call-groups/{id}` | Supported |
| Realtime events | `eventsource.ts`, dashboard live feed | `/events/stream` | Supported via query token; requires proxy help for legacy read token |
| Recorders | `Recorders` | `/recorders` | Supported |
| Stats/analytics | `Dashboard`, `TalkgroupAnalytics` | `/stats`, `/stats/rates`, `/stats/talkgroup-activity`; additional stats endpoints exist | Supported; dashboard can add richer analytics from existing endpoints |
| Maintenance/admin | `Admin.tsx` | `/admin/maintenance`, `/admin/systems/merge` | Supported; newer storage/maintenance config endpoints not yet surfaced |

## Auth Behavior

### Open/local mode

When `AUTH_ENABLED=false`, or when no auth token and no JWT secret are configured, authenticated API middleware passes through. `/auth-init` returns `mode: "open"` and the dashboard enters the app without prompting. Writes are allowed because `WriteAuth` treats no-token/no-JWT as open mode.

This is appropriate for local/private deployments.

### Shared token mode

When `AUTH_TOKEN` is configured without JWT auth, `/auth-init` returns `mode: "token"` and intentionally does not return the token. Read and write behavior then depends on the user supplying a token. In the current dashboard, `authState: "token"` is treated as allowed by `RequireAuth`, but no token prompt is shown before API calls begin. The dashboard should either route token mode to a token-entry screen or treat missing token as login-required for token mode.

Writes with the shared token are effectively admin-capable in `tr-engine` because `JWTOrTokenAuth` checks write token first, then auth token as viewer, and `WriteAuth` falls back to `WRITE_TOKEN` only when there is no role. If `WRITE_TOKEN` is empty, upload uses `AUTH_TOKEN` as a write fallback. Dashboard copy should avoid implying a read-only shared token unless `WRITE_TOKEN` is configured separately.

### Full JWT/public-facing mode

When JWT auth is configured, the server exposes `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`, `/auth/setup`, `/users`, and API key routes. The dashboard stores only a short-lived access token and relies on an HTTP-only refresh cookie.

Viewer users can read but cannot write via JWT. Editor/admin users can write. Legacy `WRITE_TOKEN` can still grant writes and the dashboard currently prefers it for viewer writes when present.

The contract issue is that `/auth-init` currently reports JWT availability using `ADMIN_PASSWORD`, while route registration and middleware use `JWT_SECRET`. `JWT_SECRET`-only deployments are therefore likely to be misclassified as open or token mode even though JWT endpoints exist.

## Pagination and Filtering

Most list endpoints needed for the MVP expose `limit`/`offset` and the dashboard already uses them:

- `/calls`
- `/talkgroups`
- `/units`
- `/unit-events`
- `/unit-affiliations`
- `/call-groups`
- `/transcriptions/search`
- talkgroup/unit nested history endpoints

Notable follow-ups:

- `getActiveCalls` and `getRecorders` are intentionally unpaginated live snapshots.
- `getSystems` is unpaginated, which is acceptable for MVP.
- The dashboard over-fetches transcriptions individually in call lists. `/transcriptions/batch` exists and should be adopted dashboard-side to reduce N+1 calls, but this is an optimization rather than a contract blocker.

## Write Semantics

Dashboard writes map to existing PATCH/POST/PUT/DELETE endpoints:

- `PATCH /systems/{id}`
- `PATCH /sites/{id}`
- `PATCH /talkgroups/{id}`
- `PATCH /units/{id}`
- `POST /talkgroup-directory/import`
- transcription submit/verify/reject/exclude endpoints
- `POST /admin/systems/merge`
- `POST /admin/maintenance`
- user create/update/delete endpoints

Engine-side `WriteAuth` consistently gates mutating methods with editor/admin role, legacy write token, or open mode. The dashboard should keep `canWrite()` aligned with that model and make token-mode entry explicit.

## Type Generation

`tr-dashboard` has:

```json
"api:generate": "openapi-typescript ./openapi.yaml -o src/api/generated.ts"
```

but the repo does not contain `openapi.yaml`. In a fresh checkout without dependencies, the command also fails because `openapi-typescript` is not installed until `npm ci` runs. After dependencies are installed, generation will still fail until the OpenAPI source path is fixed or the spec is copied/symlinked into the dashboard repo.

Recommended dashboard fix:

- Add a script that generates from the checked-out engine spec, for example `../tr-engine/openapi.yaml`, or document/copy the spec into dashboard CI before running `npm run api:generate`.
- Gradually replace `src/api/types.ts` hand-written interfaces with aliases from `src/api/generated.ts`, starting with auth/user schemas and list responses.

## Follow-up Issues

Backend:

- Document `GET /auth/setup` in `tr-engine` OpenAPI.
- Fix `/auth-init` to derive `mode` and `jwt_enabled` from the same auth configuration that registers JWT routes (`JWT_SECRET`/effective JWT availability), not only `ADMIN_PASSWORD`.

Dashboard:

- Make `npm run api:generate` reproducible from a clean checkout by providing or fetching `openapi.yaml`.
- Add an explicit token-mode entry flow before protected routes make API calls.
- Optional optimization: use `/transcriptions/batch` for call-list transcription hydration.

