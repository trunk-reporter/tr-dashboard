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
cp examples/.env.example .env        # edit with your values
docker compose -f examples/docker-compose.caddy.yml up -d
```

This starts Caddy, tr-engine, PostgreSQL, and tr-dashboard together. See [`examples/docker-compose.caddy.yml`](examples/docker-compose.caddy.yml) and [`examples/Caddyfile`](examples/Caddyfile).

### Option B: Full Stack with Traefik

If you already run Traefik:

```bash
cp examples/.env.example .env        # edit with your values
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
| `TR_AUTH_TOKEN` injected by Caddy | JWT auth via login page, or proxy-injected header |
| `SITE_ADDRESS` for auto-HTTPS | Configured in your proxy (Caddy/Traefik) |

**To migrate:** Use one of the full-stack examples above (`examples/docker-compose.caddy.yml` for the closest equivalent to the old setup) or add tr-dashboard to your existing proxy config. If you were using `TR_AUTH_TOKEN`, configure your Caddy/nginx to inject the header — see [Reverse proxy setup](#reverse-proxy-setup).

### Build from Source

```bash
git clone https://github.com/trunk-reporter/tr-dashboard.git
cd tr-dashboard
docker build -t tr-dashboard .
```

## Development Setup

For contributing or local development.

### Prerequisites

- Node.js 18+
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
# TR_AUTH_TOKEN=...                   # optional: inject bearer for token-mode backends
```

Without `TR_ENGINE_URL`, the dev server does **not** proxy API calls (you will get 404s on `/api/*`).

In **full** auth mode (engine has `ADMIN_PASSWORD`), leave `TR_AUTH_TOKEN` unset and use the dashboard login page. In **token** mode, either set `TR_AUTH_TOKEN` for the proxy or enter the token via the UI/Settings flow your engine expects. In **open** mode, no token is needed.

### Run

```bash
npm run dev
```

Runs on `http://localhost:5173` with `/api` and `/health` proxied to `TR_ENGINE_URL`.

### Build

```bash
npm run build        # Type-check + build
npm run lint         # Type-check only
npm run api:generate # Regenerate API types from OpenAPI spec
```

`npm run api:generate` expects `tr-dashboard` and `tr-engine` to be checked out as sibling directories and reads the backend spec from `../tr-engine/openapi.yaml`.

Before marking implementation work complete, follow the project quality gates in [`docs/quality-gates.md`](docs/quality-gates.md).

## Authentication & Write Access

The dashboard discovers auth requirements from tr-engine's `GET /api/v1/auth-init` (no Caddy token injection required).

| Engine config | Mode | Dashboard behavior |
|---------------|------|--------------------|
| Neither `AUTH_TOKEN` nor `ADMIN_PASSWORD` | **open** | No login; all users can write |
| `AUTH_TOKEN` only | **token** | Shared bearer token; configure proxy and/or Settings |
| `ADMIN_PASSWORD` set | **full** | Login page for JWT (roles: viewer/editor/admin). Optional `AUTH_TOKEN` becomes a guest **read** token from auth-init |

### Write access

- **open** — edits allowed without credentials.
- **full** — editors and admins can write after login. Viewers are read-only unless they still have a legacy write token saved in Settings.
- **Legacy `WRITE_TOKEN`** — still accepted by tr-engine during deprecation. Users can store it under **Settings → Write Access** (localStorage). Prefer JWT roles or `tre_...` API keys for new deployments.

### Reverse proxy setup

If your proxy injects a public read token, **do not overwrite** a browser-sent `Authorization` header (JWT login, user-entered token, or API key). Prefer conditional injection.

**Caddy example** (tr-engine listens on **8080**):

```caddyfile
handle /api/* {
    @no_auth not header Authorization *
    request_header @no_auth Authorization "Bearer {$TR_AUTH_TOKEN}"
    reverse_proxy tr-engine:8080 {
        flush_interval -1
    }
}
```

**Nginx example:**

```nginx
location /api/ {
    # Only set auth header if not provided by the browser
    set $auth "Bearer your-read-token";
    if ($http_authorization) {
        set $auth $http_authorization;
    }
    proxy_set_header Authorization $auth;
    proxy_pass http://tr-engine:8080;
    proxy_buffering off;  # required for SSE /api/v1/events/stream
}
```

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
