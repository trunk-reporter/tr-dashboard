# Quality Gates

This baseline applies to every `tr-dashboard` implementation issue. An issue is not complete until it names the commands or manual checks it used, or documents why a gate could not run.

## Required Local Gates

Run these before opening review for dashboard changes:

```bash
npm run lint
npm run build
npm test
```

`npm test` runs the auth smoke checks, the auth state tests (`scripts/test-auth-state.mjs`; extend it when changing auth, key or credential-bound state) and the dev proxy tests (`scripts/test-dev-proxy.mjs`: `TR_API_KEY` only for this machine's own tab, never for `vite preview`). `npm run lint` is the type-only gate (`tsc --noEmit`). `npm run build` runs the TypeScript project build and Vite production build.

When API shapes are touched or copied from `tr-engine`, also run:

```bash
npm run api:generate
git diff -- src/api/generated.ts
```

Commit generated type changes when the source OpenAPI contract changed. If `src/api/generated.ts` changes unexpectedly, reconcile the dashboard code with the API contract before marking the issue complete.

## Component And Hook Coverage

The dashboard has no general unit-test runner yet; `npm test` runs the Node-based auth scripts in `scripts/` (Node 20.19+ or 22.12+, no browser). For new non-trivial component, store, or hook logic, either add focused tests (extend those scripts, or an agreed runner with its command documented), or keep the logic small enough to verify through `npm run lint`, `npm run build`, `npm test`, and the manual checklist below.

Tests are expected when code introduces parsing, filtering, sorting, state-machine transitions, retry behavior, auth branching, or SSE/audio event handling that is difficult to verify visually.

## Manual Verification Checklist

Use the smallest checklist that covers the changed behavior. Include the checked items in the issue or PR.

- Auth: verify the `/whoami` paths relevant to the change: anonymous access `off` (key screen), `listen` and restricted (browse; Deny-endpoint features hidden, no errors), a valid `listen`/`edit`/`admin` key, a rejected key, an upload-only key (refused), and an engine without `/whoami` (upgrade notice). Whoami failures must show a visible user-facing error instead of a blank screen.
- SSE: verify `/api/v1/events/stream` connects through the configured proxy (with `?ticket=` when a key is stored, never the key itself), reconnects after interruption with a fresh ticket and `last_event_id`, and exposes connection loss in the UI where live state depends on it.
- Live audio: verify playback start (audio URL from `API_BASE`, ticket added right before `src` when a key is stored), blocked-autoplay recovery, stream or file load errors, the one-time ticket re-mint on a media error, retry behavior, and visible failure messaging.
- Reverse proxy: verify `/api/*`, `/audio/*`, and `/health/*` route to `tr-engine` and that the proxy adds no `Authorization` header; verify SSE proxy buffering is disabled for the event stream.
- Generated API types: verify frontend request/response code uses `src/api/generated.ts` types rather than hand-written copies when a generated type exists.
- Responsive UI: verify the affected route at mobile and desktop widths, with no clipped button text, overlapping controls, or unusable fixed panels.

## Observability Baseline

Realtime, audio, and auth failures must be visible to users and debuggable by maintainers. New work in those areas should provide:

- Visible connection state for live data or audio when the page depends on it.
- Actionable error surfaces for whoami, key entry, SSE, API fetch, and audio playback failures.
- Console logs only as supplemental diagnostics, not as the only error signal.
- Version/build metadata where a maintainer can find it, using existing version surfaces before adding new ones.
- A path to collect a debug report or enough IDs, timestamps, and URLs for a maintainer to correlate with `tr-engine` logs.

## Completion Rule

Every implementation issue should end with a verification block like:

```text
Verification:
- npm run lint
- npm run build
- Manual: whoami failure shows an error screen; SSE reconnect indicator tested through Caddy.
```

If a gate cannot run, record the blocker, the risk, and the narrower check that was run instead.
