# tr-dashboard

Modern, responsive frontend for [tr-engine](https://github.com/LumenPrima/tr-engine) radio scanning backend.

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

The easiest way to run tr-dashboard alongside [tr-engine](https://github.com/LumenPrima/tr-engine). The Docker image uses [Caddy](https://github.com/caddyserver/caddy) to serve static files, reverse proxy API requests to tr-engine, and optionally handle automatic HTTPS.

### 1. Add to your Docker Compose

Add this service to your existing `docker-compose.yml` (or use the included one):

```yaml
services:
  tr-dashboard:
    image: ghcr.io/lumenprima/tr-dashboard:latest
    ports:
      - "80:80"
    environment:
      - TR_ENGINE_URL=tr-engine:8000
      - TR_AUTH_TOKEN=your-token-here
```

### 2. Start it

```bash
docker compose up -d
```

Visit `http://your-server` and you're done.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TR_ENGINE_URL` | `tr-engine:8000` | Address of your tr-engine backend |
| `TR_AUTH_TOKEN` | *(empty)* | Bearer token for tr-engine API authentication (read access) |
| `TR_WRITE_TOKEN` | *(empty)* | Write token for editing talkgroups/units (see [Write Access](#write-access)) |
| `SITE_ADDRESS` | `:80` | Caddy site address — set to a domain for automatic HTTPS |

### Automatic HTTPS

To enable automatic Let's Encrypt certificates, set `SITE_ADDRESS` to your domain and expose port 443:

```yaml
services:
  tr-dashboard:
    image: ghcr.io/lumenprima/tr-dashboard:latest
    ports:
      - "80:80"
      - "443:443"
    environment:
      - SITE_ADDRESS=dashboard.example.com
      - TR_ENGINE_URL=tr-engine:8000
      - TR_AUTH_TOKEN=your-token-here
    volumes:
      - caddy_data:/data

volumes:
  caddy_data:
```

Caddy automatically provisions and renews TLS certificates. Ports 80 and 443 must be publicly accessible, and the domain must point to your server.

### Build from Source

```bash
git clone https://github.com/LumenPrima/tr-dashboard.git
cd tr-dashboard
docker build -t tr-dashboard .
```

## Development Setup

For contributing or local development.

### Prerequisites

- Node.js 18+
- A running [tr-engine](https://github.com/LumenPrima/tr-engine) backend

### Install

```bash
git clone https://github.com/LumenPrima/tr-dashboard.git
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

## License

MIT
