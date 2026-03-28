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

Then configure your proxy to route `/api/*`, `/audio/*`, and `/health/*` to tr-engine and everything else to `tr-dashboard:3000`. The key requirement is that `/api/events` (SSE) must have `flush_interval -1` or equivalent to avoid buffering.

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

The dev server proxies API requests to tr-engine. If your backend requires authentication, create a `.env` file:

```bash
# .env
TR_AUTH_TOKEN=your-auth-token-here
```

The proxy target is configured in `vite.config.ts` (default: `https://tr-engine.luxprimatech.com`). Change this to point at your own tr-engine instance.

### Run

```bash
npm run dev
```

Runs on `http://localhost:5173` with API proxy to the tr-engine backend.

### Build

```bash
npm run build        # Type-check + build
npm run lint         # Type-check only
npm run api:generate # Regenerate API types from OpenAPI spec
```

## Write Access

tr-dashboard supports inline editing of talkgroup metadata (name, group, tag, priority, description) and unit names directly from their detail pages.

### How it works

- If your tr-engine has no `WRITE_TOKEN` configured, editing works for everyone automatically.
- If `WRITE_TOKEN` is set, users need to enter it in **Settings → Write Access** to enable editing. The token is stored in the browser's localStorage.
- Without a valid write token, the Edit button still appears but saves will show an error message directing users to Settings.

### Reverse proxy setup

If you run tr-dashboard behind a reverse proxy that injects an auth token, make sure it **doesn't overwrite** the `Authorization` header when the browser sends one. The dashboard sends the write token as `Authorization: Bearer <token>` on write requests (PATCH/POST/PUT/DELETE).

**Caddy example** — use conditional injection so the read token is only added when the browser doesn't send its own:

```caddyfile
handle /api/* {
    @no_auth not header Authorization *
    request_header @no_auth Authorization "Bearer {$TR_AUTH_TOKEN}"
    reverse_proxy tr-engine:8000
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
    proxy_pass http://tr-engine:8000;
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
