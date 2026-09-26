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
const access = read('src/pages/Access.tsx')
const keyInput = read('src/lib/apiKeyInput.ts')
const picker = read('src/components/calls/TalkgroupMultiSelect.tsx')
const restrictionEditor = read('src/components/auth/RestrictionEditor.tsx')
const app = read('src/App.tsx')
const composeExamples = ['examples/docker-compose.caddy.yml', 'examples/docker-compose.traefik.yml'].map((p) => [p, read(p)])
const readme = read('README.md')
/** Lines that copy an example .env: Compose reads .env from the compose file's directory (examples/) */
const envCopies = [readme, ...composeExamples.map(([, text]) => text)].flatMap((t) => t.split(/\r?\n/).filter((l) => /\bcp\b.*\.env\.example/.test(l)))

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
  // Date-only key expiry is 00:00 UTC, like `tr-engine keys create --expires` and admin.html
  ['key expiry dates mean 00:00 UTC and must be in the future', keyInput.includes('T00:00:00Z') && !access.includes('T23:59:59Z') && access.includes('expiryDateProblem(')],
  ['pasted keys are cleaned before /whoami', auth.includes('cleanPastedKey(raw)') && auth.includes('isSendableKey(key)')],
  ['key changes in other tabs are followed', auth.includes("addEventListener('storage'") && app.includes('installCrossTabKeySync()')],
  ['a credential change clears the player and stream state', app.includes('installCredentialReset()')],
  ['the show-once key copy has a fallback', access.includes('copyText(created.key, keyTextRef.current)') && !access.includes('navigator.clipboard')],
  ['talkgroup pickers have their own accessible names', picker.includes('htmlFor={inputId}') && picker.includes('id={inputId}') && picker.includes('aria-label={`Remove ') &&
    restrictionEditor.includes('label="Individually allowed talkgroups"') && restrictionEditor.includes('label="Excluded talkgroups (never allowed)"')],
  // Plain `docker compose` from the repo root reads the root docker-compose.yml (tr-dashboard only)
  ['example compose notes name their compose file', composeExamples.every(([p, text]) =>
    text.split('\n').filter((l) => l.startsWith('#') && l.includes('docker compose ') && !l.includes(' up -d')).every((l) => l.includes(`docker compose -f ${p} `)))],
  ['example quick starts copy .env next to their compose file', envCopies.length >= 4 && envCopies.every((l) => l.includes('cp examples/.env.example examples/.env '))],
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
