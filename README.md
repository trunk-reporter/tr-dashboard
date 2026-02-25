# tr-dashboard

Modern, responsive frontend for [tr-engine](https://github.com/LumenPrima/tr-engine) radio scanning backend.

**[Live Demo](https://tr-dashboard.luxprimatech.com)** — connected to a live MARCS (Ohio) trunk-recorder system.

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

## Getting Started

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

The dashboard proxies API requests to tr-engine in development. If your backend requires authentication, create a `.env` file:

```bash
# .env
TR_AUTH_TOKEN=your-auth-token-here
```

The token is injected as a `Bearer` token in the `Authorization` header on all proxied API requests during development.

The proxy target is configured in `vite.config.ts` (default: `https://tr-engine.luxprimatech.com`). Change this to point at your own tr-engine instance.

### Development

```bash
npm run dev
```

Runs on `http://localhost:5173` with API proxy to the tr-engine backend.

### Production Build

```bash
npm run build
```

Outputs static files to `dist/`. Deploy these behind a reverse proxy (Caddy, nginx, etc.) that:

1. Serves the static files from `dist/`
2. Proxies `/api/*` requests to your tr-engine backend
3. Injects the `Authorization: Bearer <token>` header on proxied requests if auth is required
4. Uses `try_files` to fall back to `index.html` for client-side routing

Example Caddy config:

```
tr-dashboard.example.com {
    handle /api/* {
        reverse_proxy localhost:8000 {
            header_up Authorization "Bearer YOUR_TOKEN_HERE"
        }
    }
    handle {
        root * /var/www/tr-dashboard
        try_files {path} /index.html
        file_server
    }
    encode gzip
}
```

### Regenerate API Types

Types are auto-generated from the backend OpenAPI spec:

```bash
npm run api:generate
```

### Type Check

```bash
npm run lint
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
