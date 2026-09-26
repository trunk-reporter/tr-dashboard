# tr-dashboard

Modern, responsive frontend for [tr-engine](https://github.com/trunk-reporter/tr-engine) radio scanning backend.

**[Live Demo](https://tr-dashboard.luxprimatech.com)** — connected to a live MARCS (Ohio) trunk-recorder system.

> Built with significant assistance from [Claude Code](https://claude.ai/code) (Anthropic). See commit history for details.

## Screenshots

### Dashboard — Live Monitoring
Real-time call activity with transcription previews, recorder status, decode rates, and active talkgroups.

![Dashboard](screenshots/dashboard.png)

### Call History
Browse the full call history with filters, transcription previews, and inline playback.

![Calls](screenshots/calls.png)

### Transcription Search
Full-text search across all radio transcriptions with keyword highlighting, time/talkgroup filtering, and relevance ranking.

![Transcription Search](screenshots/transcription-search.png)

### Talkgroup Analytics
30-day call activity charts, hourly breakdowns, top units with call counts, keyword extraction from transcriptions, and unit cross-reference.

![Talkgroup Analytics](screenshots/talkgroup-analytics.png)

### Talkgroups
Browse all talkgroups with call stats, tag-based filtering, monitor/favorite controls, and color customization.

![Talkgroups](screenshots/talkgroups.png)

### Units
All known radio units with real-time event tracking, talkgroup affiliations, and activity indicators.

![Units](screenshots/units.png)

### Call Detail
Full call metadata, signal quality, transcription with word-level timing, and transmission breakdown.

![Call Detail](screenshots/call-detail.png)

## Features

- **Real-time monitoring** — Live call activity, active talkgroups, unit events, recorder status, system health
- **Historical analysis** — Searchable call history, playback, filtering, and data exploration
- **Talkgroup Analytics** — 30-day call activity charts, top units, keyword extraction from transcriptions, unit cross-reference
- **Transcription search** — Full-text search across radio transcriptions with talkgroup/time filtering
- **Audio player** — Global player with transmission timeline and keyboard shortcuts
- **Command palette** — Quick navigation with Ctrl+K
- **Go To menu** — Press `G` for quick navigation with search
- **Live monitoring** — Auto-play calls from selected talkgroups
- **Talkgroup customization** — Configurable color rules with hide/highlight modes and wildcard matching
- **Transcription display** — View call transcriptions with word-level timing
- **API keys** — Connect with a tr-engine API key, or browse without one when the engine allows anonymous listening; admins manage keys, the anonymous access policy and the audit log on the Access page

## Tech Stack

- React 19 + TypeScript (strict mode)
- Vite 7
- Tailwind CSS v4
- shadcn/ui (Radix-based components)
- Zustand v5 (state management with persist middleware)
- React Router v7
- OpenAPI TypeScript (auto-generated API types)

## Quick Start (Docker)

The Docker image serves static files only (via [`serve`](https://github.com/vercel/serve) on port 3000). You need a reverse proxy (Caddy, Traefik, nginx) to route API requests to tr-engine. Full-stack example configs are in `examples/`.

### Architecture

```
Browser → Reverse Proxy (Caddy/Traefik/nginx)
              ├── /api/*, /audio/*, /health/*  →  tr-engine:8080
              └── everything else              →  tr-dashboard:3000
```

### Option A: Full Stack with Caddy (recommended)

The easiest way to get started. Caddy handles TLS automatically.

```bash
cp examples/.env.example examples/.env   # edit with your values
docker compose -f examples/docker-compose.caddy.yml up -d
```

Compose reads `.env` from the compose file's directory (`examples/`), not from where you run it, so the copy goes to `examples/.env`.

This starts Caddy, tr-engine, PostgreSQL, and tr-dashboard together. See [`examples/docker-compose.caddy.yml`](examples/docker-compose.caddy.yml) and [`examples/Caddyfile`](examples/Caddyfile).

### Option B: Full Stack with Traefik

If you already run Traefik:

```bash
cp examples/.env.example examples/.env   # edit with your values
docker compose -f examples/docker-compose.traefik.yml up -d
```

See [`examples/docker-compose.traefik.yml`](examples/docker-compose.traefik.yml).

### Option C: Dashboard Only

If tr-engine is already running and you have your own reverse proxy:

```yaml
services:
  tr-dashboard:
    image: ghcr.io/trunk-reporter/tr-dashboard:latest
    ports:
      - "3000:3000"
```

Then configure your proxy to route `/api/*`, `/audio/*`, and `/health/*` to tr-engine and everything else to `tr-dashboard:3000`. SSE is at `/api/v1/events/stream` — disable proxy buffering (`flush_interval -1` in Caddy, `proxy_buffering off` in nginx).

### Migrating from v0.9.x (Caddy-based image)

Previous versions bundled Caddy inside the Docker image and accepted `TR_ENGINE_URL`, `TR_AUTH_TOKEN`, and `SITE_ADDRESS` environment variables. Starting with v0.10.0:

| Before (v0.9.x) | After (v0.10.0+) |
|------------------|-------------------|
| Caddy bundled in image | Static-only image, bring your own proxy |
| Port 80/443 | Port 3000 |
| `TR_ENGINE_URL` env var | Proxy config routes `/api/*` to tr-engine |
| `TR_AUTH_TOKEN` injected by Caddy | API key pasted in the dashboard, or tr-engine's anonymous access policy (see [Authentication](#authentication)) |
| `SITE_ADDRESS` for auto-HTTPS | Configured in your proxy (Caddy/Traefik) |

**To migrate:** Use one of the full-stack examples above (`examples/docker-compose.caddy.yml` for the closest equivalent to the old setup) or add tr-dashboard to your existing proxy config. Your proxy only routes requests; it never adds credentials (see [Authentication](#authentication)).

### Build from Source

```bash
git clone https://github.com/trunk-reporter/tr-dashboard.git
cd tr-dashboard
docker build -t tr-dashboard .
```

## Development Setup

For contributing or local development.

### Prerequisites

- Node.js 20.19+ or 22.12+ (required by Vite 7)
- A running [tr-engine](https://github.com/trunk-reporter/tr-engine) backend

### Install

```bash
git clone https://github.com/trunk-reporter/tr-dashboard.git
cd tr-dashboard
npm install
```

### Configure

Create a `.env` so the Vite dev server can proxy API requests to tr-engine:

```bash
# .env
TR_ENGINE_URL=http://localhost:8080   # required for /api and /health proxy
# TR_API_KEY=tre_...                  # optional: a listen key the dev proxy adds for this machine's browser
```

Without `TR_ENGINE_URL`, the dev server does **not** proxy API calls (you will get 404s on `/api/*`).

`TR_API_KEY` is a development convenience: the Vite dev proxy adds it to requests that carry no `Authorization` header, so a key you paste into the dashboard always wins. Without it, the dashboard asks for a key (or browses anonymously if the engine allows that).

Use a `listen` key for it (`tr-engine keys create --name dev-dashboard --scopes listen`), never the bootstrap admin key: whoever gets a request through the proxy acts with that key. The dev server listens on all interfaces (other devices on your network can open it), so the proxy adds the key only to same-origin requests from this machine: other devices, and other sites open in your browser, get no key and see the key screen like any visitor. `npm run preview` never adds the key.

### Run

```bash
npm run dev
```

Runs on `http://localhost:5173` (and on this machine's network addresses) with `/api` and `/health` proxied to `TR_ENGINE_URL`.

### Build

```bash
npm run build        # Type-check + build
npm run lint         # Type-check only
npm test             # Auth smoke checks, auth state and dev proxy tests (no browser)
npm run api:generate # Regenerate API types from OpenAPI spec
```

`npm run api:generate` expects `tr-dashboard` and `tr-engine` to be checked out as sibling directories and reads the backend spec from `../tr-engine/openapi.yaml`.

Before marking implementation work complete, follow the project quality gates in [`docs/quality-gates.md`](docs/quality-gates.md).

## Authentication

tr-dashboard needs **tr-engine with API keys** (the engine version that has `GET /api/v1/whoami`). Against an older engine it shows "This tr-engine doesn't support API keys yet — upgrade tr-engine". Upgrade the engine and the dashboard together.

tr-engine authenticates client software, not people: there are no user accounts and no login page. On load, the dashboard asks `GET /api/v1/whoami` what it may do:

- **With an API key** (pasted on the "Connect to tr-engine" screen or in **Settings → API key**), it sends `Authorization: Bearer <key>` on every request. The key is stored in this browser's localStorage only.
- **Without a key**, it uses tr-engine's **anonymous access policy**. When the policy is `listen`, visitors browse read-only; when it is `off` (the default on a fresh install), the dashboard asks for a key.

What a key can do depends on its scope:

| Scope | In the dashboard |
|-------|------------------|
| `listen` | Browse, search, live events and audio |
| `edit` | Also edit talkgroup and unit tags, review unit tag suggestions |
| `admin` | Also the Admin page (maintenance, merges, CSV imports) and the **Access** page |
| `upload` only | Rejected: an upload key is for trunk-recorder, not a dashboard |

Keys and the anonymous policy can be **restricted** to some systems or talkgroups. The dashboard then hides what tr-engine can't serve under a restriction (units, affiliations, recorders, stats) and shows everything else, limited to the allowed talkgroups.

`EventSource` and `<audio>` can't send headers, so with a key the dashboard mints a short-lived, listen-only **ticket** (`POST /api/v1/tickets`) right before it opens the event stream or sets an audio `src`, and puts it in `?ticket=`. The key itself never appears in a URL.

### Getting a key

On the engine host:

```bash
tr-engine keys create --name "tr-dashboard at home" --scopes edit
# Docker: docker compose exec -T tr-engine tr-engine keys create --name "tr-dashboard at home" --scopes edit
```

The first start of a new tr-engine prints a `bootstrap admin` key to its log. Paste it into the dashboard, create a named admin key for yourself on the **Access** page, switch to it in Settings, and revoke `bootstrap admin`. Give your own admin key no expiry: tr-engine refuses (409) to revoke an admin key, or shorten its expiry, unless another active admin key lasts at least as long.

### Access page (admin keys)

`/access` lists, creates, edits and revokes API keys (the full key is shown once, when it is created), edits the anonymous access policy (off or listen, optionally limited to some systems or talkgroups, with talkgroups to exclude), and shows the audit log of changes made with keys.

### Public dashboards

To let anyone browse your dashboard, set tr-engine's anonymous access policy to `listen` (Access page, or `tr-engine access set --anonymous listen`), optionally restricted. **Don't** make a reverse proxy add a key to visitors' requests, and don't build a key into a page other people load: a key that reaches other people's browsers is public, and every visitor gets its access. Your proxy should only route `/api/*` to tr-engine.

### Upgrading from AUTH_TOKEN / WRITE_TOKEN / logins

- Remove any `Authorization` header injection from your Caddy/nginx config (older versions of this README suggested it).
- A write token saved in Settings by an older dashboard is tried once as an API key: tr-engine imports `WRITE_TOKEN` (and a token-mode `AUTH_TOKEN`) as legacy keys on its first start. If the engine doesn't accept it, it is dropped quietly. Replace legacy keys with named keys.
- The login page and the Users page are gone; give each person or client its own API key instead.

See tr-engine's [auth guide](https://github.com/trunk-reporter/tr-engine/blob/main/docs/auth.md) and [auth migration guide](https://github.com/trunk-reporter/tr-engine/blob/main/docs/migrating-auth.md) for the engine side.

## Keyboard Shortcuts

### Navigation

| Key | Action |
|-----|--------|
| `Ctrl+K` | Command palette |
| `G` | Open Go To menu |
| `G` then `D` | Go to Dashboard |
| `G` then `C` | Go to Calls |
| `G` then `T` | Go to Talkgroups |
| `G` then `U` | Go to Units |
| `G` then `S` | Go to Settings |
| `[` | Toggle sidebar |

### Audio Player

| Key | Action |
|-----|--------|
| `Space` | Play/pause |
| `J` | Next call |
| `K` | Previous call |
| `L` | Seek forward 5s |
| `H` | Seek backward 5s |
| `R` | Replay current call |
| `M` | Mute/unmute |

## Roadmap

See the [Trunk Reporter Roadmap](https://github.com/orgs/trunk-reporter/projects/1) for the cross-repo project tracker with priorities and phases.

## License

MIT
