# Quality Gates

This baseline applies to every `tr-dashboard` implementation issue. An issue is not complete until it names the commands or manual checks it used, or documents why a gate could not run.

## Required Local Gates

Run these before opening review for dashboard changes:

```bash
npm run lint
npm run build
```

`npm run lint` is the type-only gate (`tsc --noEmit`). `npm run build` runs the TypeScript project build and Vite production build.

When API shapes are touched or copied from `tr-engine`, also run:

```bash
npm run api:generate
git diff -- src/api/generated.ts
```

Commit generated type changes when the source OpenAPI contract changed. If `src/api/generated.ts` changes unexpectedly, reconcile the dashboard code with the API contract before marking the issue complete.

## Component And Hook Coverage

The current dashboard does not have a committed test runner. For new non-trivial component, store, or hook logic, either add focused tests with an agreed runner and document the command, or keep the logic small enough to verify through `npm run lint`, `npm run build`, and the manual checklist below.

Tests are expected when code introduces parsing, filtering, sorting, state-machine transitions, retry behavior, auth branching, or SSE/audio event handling that is difficult to verify visually.

## Manual Verification Checklist

Use the smallest checklist that covers the changed behavior. Include the checked items in the issue or PR.

- Auth: verify open, token, and full-login paths relevant to the change; auth-init failures must show a visible user-facing error instead of a blank screen.
- SSE: verify `/api/v1/events/stream` connects through the configured proxy, reconnects after interruption, and exposes connection loss in the UI where live state depends on it.
- Live audio: verify playback start, blocked-autoplay recovery, stream or file load errors, retry behavior, and visible failure messaging.
- Reverse proxy: verify `/api/*`, `/audio/*`, and `/health/*` route to `tr-engine`; verify SSE proxy buffering is disabled for the event stream.
- Generated API types: verify frontend request/response code uses `src/api/generated.ts` types rather than hand-written copies when a generated type exists.
- Responsive UI: verify the affected route at mobile and desktop widths, with no clipped button text, overlapping controls, or unusable fixed panels.

## Observability Baseline

Realtime, audio, and auth failures must be visible to users and debuggable by maintainers. New work in those areas should provide:

- Visible connection state for live data or audio when the page depends on it.
- Actionable error surfaces for auth-init, login, SSE, API fetch, and audio playback failures.
- Console logs only as supplemental diagnostics, not as the only error signal.
- Version/build metadata where a maintainer can find it, using existing version surfaces before adding new ones.
- A path to collect a debug report or enough IDs, timestamps, and URLs for a maintainer to correlate with `tr-engine` logs.

## Completion Rule

Every implementation issue should end with a verification block like:

```text
Verification:
- npm run lint
- npm run build
- Manual: auth-init failure shows an error banner; SSE reconnect indicator tested through Caddy.
```

If a gate cannot run, record the blocker, the risk, and the narrower check that was run instead.
