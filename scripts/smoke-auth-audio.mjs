#!/usr/bin/env node
// Static smoke check for the API-key auth model (tr-engine API-key design
// §12.1): the key only ever goes in the Authorization header, URLs carry
// short-lived tickets minted right before use, and nothing of the old
// login/JWT/token model is left. Run: node scripts/smoke-auth-audio.mjs
import { readFileSync, existsSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const exists = (path) => existsSync(new URL(`../${path}`, import.meta.url))

const client = read('src/api/client.ts')
const store = read('src/stores/useAuthStore.ts')
const auth = read('src/api/auth.ts')
const tickets = read('src/api/tickets.ts')
const sse = read('src/api/eventsource.ts')
const player = read('src/components/audio/AudioPlayer.tsx')
const audioStore = read('src/stores/useAudioStore.ts')
const sources = [client, store, auth, tickets, sse, player, audioStore]

const checks = [
  ['store v3 persists only the API key', store.includes('version: 3') && store.includes('apiKey: state.apiKey') && !store.includes('writeToken: state.writeToken')],
  ['v2 writeToken migrates to a candidate key', store.includes('old.writeToken') && store.includes('candidateKey: token !== ')],
  ['whoami decides the auth status', auth.includes('/whoami') && auth.includes("'too-old'") && auth.includes("'invalid-key'")],
  ['upload-only keys are rejected', auth.includes("!whoami.scopes.includes('listen')")],
  ['request() sends the key only as a Bearer header', client.includes('headers[\'Authorization\'] = `Bearer ${apiKey}`')],
  ['no key or token in any URL', sources.every((s) => !s.includes('token=') && !s.includes("'token'"))],
  ['no cookies or credentials: include', sources.every((s) => !s.includes("credentials: 'include'"))],
  ['old auth endpoints are gone', sources.every((s) => !s.includes('/auth-init') && !s.includes('/auth/login') && !s.includes('/auth/refresh') && !s.includes("'/users'"))],
  ['login and users pages are gone', !exists('src/pages/Login.tsx') && !exists('src/pages/Users.tsx') && !exists('src/components/auth/RequireAuth.tsx')],
  ['tickets are cached per key with a minimum lifetime', tickets.includes('minRemaining') && tickets.includes('cached.key === key')],
  ['event stream mints a ticket before every connect', sse.includes('await getTicket(') && sse.includes('appendTicket(')],
  ['event stream resumes with last_event_id', sse.includes("params.set('last_event_id'")],
  ['event stream handles event: auth', sse.includes("addEventListener('auth'") && sse.includes("'ticket_expired'")],
  ['event stream reconnects when the key changes', sse.includes('state.apiKey !== prev.apiKey')],
  ['audio URL is built from API_BASE, not audio_url', audioStore.includes('audioUrl: callAudioUrl(call.call_id)') && client.includes('`${API_BASE}/calls/${id}/audio`')],
  ['player adds the ticket right before src', player.includes('mediaUrl(currentCall.audioUrl)') && player.includes('audio.src = src')],
  ['player re-mints the ticket once on a media error', player.includes('ticketRetriedRef') && player.includes('mediaUrl(url, true)')],
]

let failed = false
for (const [name, ok] of checks) {
  if (!ok) {
    console.error(`FAIL ${name}`)
    failed = true
  } else {
    console.log(`ok ${name}`)
  }
}

if (failed) process.exit(1)
