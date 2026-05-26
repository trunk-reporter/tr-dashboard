# ADR 0001: Next-generation dashboard foundation

- **Status:** Accepted
- **Date:** 2026-05-07
- **Decision owner:** snarglefluffer
- **Planning owner:** Orion (Planning Agent)
- **Implementation owners:** Dashboard/UI agent for frontend work, tr-engine/API agent for contract gaps
- **Issue:** AUG-14 / `5104d8a5-b950-4595-bd1a-e258342bc4b2`

## Context

`tr-dashboard` is already a functional React/Vite SPA for monitoring `tr-engine`: it has JWT/auth UI, a real-time SSE connection, call history, investigate timeline, audio playback, administration flows, and generated TypeScript types from OpenAPI. The roadmap still calls for significant next-generation work: alerting, better timeline and page performance, theme support, mobile views, global search, multi-instance support, and deeper operational intelligence.

The core architectural question is whether to continue evolving the existing `tr-dashboard` app or start a fresh app. A fresh app would reduce some legacy friction, but it would also discard working domain behavior that is hard to rediscover: radio-system composite keys, audio queue semantics, SSE event handling, JWT/legacy-token compatibility, admin flows, and UI patterns already validated through production-like use.

`tr-engine` remains the source of truth for systems, calls, talkgroups, units, auth, realtime events, audio availability, and operational metadata. The dashboard should not fork backend business rules into local caches or client-only models except for user-specific presentation preferences. OpenAPI is the frontend/backend contract and should drive generated API types.

## Decision

Evolve `tr-dashboard` incrementally rather than starting a fresh app.

Use the existing app as the production shell and carve it into clearer platform modules. The next-gen dashboard is a refactor-and-extend effort, not a rewrite. New feature work should move toward explicit boundaries while preserving current routes, deployment, and user workflows.

## Deployment shape

The accepted deployment shape is:

```text
Browser
  │
  ▼
Static SPA assets: tr-dashboard build output
  │
  ▼
User-managed reverse proxy: Caddy, Traefik, nginx, or equivalent
  │
  ├── /, /assets/*, service worker, manifest → static SPA host
  └── /api/*, /api/events, audio URLs          → tr-engine

tr-engine
  ├── REST API under /api/v1
  ├── SSE realtime stream under /api/events
  ├── auth and first-time setup source of truth
  ├── audio metadata and audio file/proxy serving
  └── OpenAPI spec consumed by tr-dashboard
```

`tr-dashboard` should stay a static SPA image/artifact. It should not embed a backend-for-frontend, write directly to the database, or become the owner of radio-domain persistence. Reverse proxy configuration remains deployment-owned so local, homelab, and hosted installations can choose their own TLS, auth edge, and routing strategy.

## Module boundaries

### API contract and generated types

**Purpose:** All REST calls to `tr-engine`.

- Generated OpenAPI types live in `src/api/generated.ts` and are never edited by hand.
- Hand-written request helpers and endpoint functions live in `src/api/client.ts` or domain-specific files under `src/api/` as the module grows.
- All API requests go through one request wrapper so auth retry, write-token fallback, error mapping, and base URL behavior are consistent.
- OpenAPI changes start in `tr-engine`; dashboard types are regenerated from the checked-in spec.

### Auth and session

**Purpose:** Login state, JWT refresh, first-time setup, legacy token compatibility, role/write capability checks.

- UI reads capability state from a single auth/session module or store.
- Components should not infer permissions from role names alone when the API can answer access control.
- Token transport must avoid leaking JWTs into URLs for future audio work.

### Realtime

**Purpose:** SSE lifecycle, event typing, reconnect/backoff, and normalization into state stores.

- `EventSource` management stays isolated from page components.
- SSE events update realtime stores through typed actions.
- REST queries remain authoritative for historical/canonical state; SSE is an incremental freshness layer.

### Audio

**Purpose:** Playback state machine, queueing, media session integration, audio URL/blob/proxy handling, and transmission timelines.

- The HTML audio element and its events remain the playback source of truth.
- Audio state is global because playback crosses route boundaries.
- Future secure audio work belongs here and in `tr-engine`; pages should not construct token-bearing audio URLs directly.

### Feature pages

**Purpose:** Route-level product workflows: dashboard, calls, investigate timeline, systems, talkgroups, units, affiliations, directory, transcriptions, admin, settings, users.

- Pages orchestrate data loading and compose domain components.
- Reusable behavior should move down into domain components, API modules, hooks, or stores.
- Heavy pages are candidates for route-level lazy loading.

### Shared UI and layout

**Purpose:** App shell, navigation, command palette, route loading states, shadcn/Radix primitives, theme tokens, responsive layout primitives.

- `src/components/ui/` remains primitive and reusable.
- Product/domain components should not be placed in `ui/`.
- The theme system should be token-driven via CSS custom properties rather than hard-coded page-level color choices.

### Local preferences and client-only state

**Purpose:** User-specific UI choices that do not belong in `tr-engine` yet.

- Persisted Zustand stores may hold local-only preferences: monitored talkgroups, color rules, display filters, theme, alert rules, and saved views.
- Persisted data must be versioned/migratable when shape changes.
- Domain data from `tr-engine` should not be copied into long-lived localStorage caches unless explicitly designed as offline support.

## Alternatives considered

### A. Start a fresh dashboard app

**Pros:** Clean boundaries from day one, easier to adopt new conventions, less time spent untangling old code.

**Cons:** High regression risk, duplicates already-solved domain behavior, delays near-term roadmap items, likely recreates auth/audio/SSE edge cases through trial and error. It also creates a migration burden for Docker images, reverse proxies, documentation, CI, and users.

**Rejected** because the existing app has enough working product and domain knowledge to justify incremental hardening.

### B. Keep adding features without architectural cleanup

**Pros:** Fastest short-term feature delivery.

**Cons:** Makes auth, realtime, audio, and persisted preference bugs more likely; worsens bundle size; spreads API and permission logic across pages; makes future multi-instance support much harder.

**Rejected** because next-gen features need clearer seams.

### C. Incremental modular evolution of `tr-dashboard`

**Pros:** Preserves working behavior, reduces user migration risk, allows continuous shipping, and creates explicit seams before major features land.

**Cons:** Requires discipline to pay down boundaries while delivering features. Some legacy patterns will coexist with target patterns during rollout.

**Accepted.**

## Consequences

- Existing routes and Docker/static deployment remain stable during the transition.
- Architectural cleanup is part of feature work, not a separate rewrite freeze.
- OpenAPI quality matters more: missing or inaccurate schemas block safe frontend work.
- Cross-cutting fixes should happen once in platform modules, not page-by-page.
- The dashboard continues to own presentation and local preferences, while `tr-engine` owns durable radio domain state and authorization decisions.

## Non-goals

- No fresh repository or separate next-gen app unless this ADR is superseded.
- No backend-for-frontend service in `tr-dashboard`.
- No direct database access from dashboard code.
- No replacement of `tr-engine` as the API, SSE, auth, or audio authority.
- No mandatory reverse proxy implementation; examples may be provided, but operators keep deployment choice.
- No attempt to solve multi-instance backend aggregation in this ADR; only keep module boundaries compatible with it.

## Rollout strategy

1. **Freeze the target seams.** Treat this ADR as the reference for where new code belongs.
2. **Normalize API access.** Ensure all REST writes and reads use the shared request/auth path; remove raw `fetch` exceptions.
3. **Harden auth and audio.** Close known token transport and permission edge cases before expanding audio-heavy features.
4. **Split heavy routes.** Add route-level lazy loading for large pages to reduce initial bundle cost without changing UX.
5. **Extract feature modules opportunistically.** As roadmap work touches alerts, themes, timeline, search, or analytics, move code into the target boundaries rather than adding page-local logic.
6. **Keep OpenAPI current.** Backend changes update `tr-engine/openapi.yaml`; dashboard regenerates `src/api/generated.ts` and adapts via typed client functions.
7. **Verify each slice.** Use `npm run lint` and `npm run build` for dashboard changes; use tr-engine API checks when backend contract changes.

## Follow-up implementation issues

These issues should be created or linked under the next-gen dashboard epic. Proposed owners assume agents, with snarglefluffer as final decision owner where product tradeoffs arise.

1. **API boundary cleanup: remove raw request paths**
   - **Owner:** Dashboard/UI agent
   - **Acceptance criteria:** All dashboard REST calls use the shared request wrapper; `importTalkgroupDirectory` and similar write paths preserve JWT refresh, write-token fallback, and consistent error handling; `npm run lint` passes.
   - **Depends on:** This ADR.

2. **Secure audio URL strategy**
   - **Owner:** tr-engine/API agent + Dashboard/UI agent
   - **Acceptance criteria:** JWTs are no longer placed in audio query strings; the chosen mechanism is documented; call playback and queue navigation still work for JWT and legacy token deployments.
   - **Depends on:** API boundary cleanup.

3. **Route-level code splitting**
   - **Owner:** Dashboard/UI agent
   - **Acceptance criteria:** Heavy routes such as Admin, Users, Investigate, TalkgroupAnalytics, Transcriptions, and timeline-related pages are lazy-loaded with a shared loading state; initial bundle size decreases measurably; `npm run build` passes.
   - **Depends on:** This ADR.

4. **Theme token system**
   - **Owner:** Dashboard/UI agent
   - **Acceptance criteria:** Theme choices are represented as CSS custom property token sets; current dark theme remains default; at least one alternate built-in theme is selectable and persisted locally.
   - **Depends on:** Shared UI/layout boundary.

5. **Realtime alert rules foundation**
   - **Owner:** Dashboard/UI agent
   - **Acceptance criteria:** Browser-local alert rules are evaluated against typed SSE events with cooldown support; rules and muted state persist locally; no backend persistence is assumed.
   - **Depends on:** Realtime boundary cleanup.

6. **OpenAPI contract hygiene pass**
   - **Owner:** tr-engine/API agent
   - **Acceptance criteria:** Current dashboard-used endpoints and SSE-adjacent response shapes are represented accurately in OpenAPI; dashboard generated types can be refreshed without manual patching.
   - **Depends on:** This ADR.

## Acceptance checklist

- [x] Decides incremental evolution vs. fresh app.
- [x] Documents static SPA + reverse proxy + `tr-engine` API/SSE/audio deployment shape.
- [x] Defines boundaries for API, auth, realtime, audio, feature pages, shared UI, and local preferences.
- [x] Captures alternatives, tradeoffs, consequences, non-goals, and rollout strategy.
- [x] References `tr-engine` as source of truth and OpenAPI as the frontend/backend contract.
- [x] Lists follow-up implementation issues with owners, sequencing, and acceptance criteria.
