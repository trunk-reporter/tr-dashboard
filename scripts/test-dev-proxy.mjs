#!/usr/bin/env node
// The dev proxy's TR_API_KEY (vite.config.ts): added only to requests from
// this machine's own browser tab, never to LAN clients or to requests other
// sites make, and never by `vite preview`. Loads the real config file.
// Run: node scripts/test-dev-proxy.mjs (or npm test)
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfigFromFile } from 'vite'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const configFile = path.join(root, 'vite.config.ts')
const ENGINE = 'http://127.0.0.1:18999'
const KEY = 'tre_' + 'd'.repeat(64)

async function load(env, command = 'serve') {
  const saved = { TR_ENGINE_URL: process.env.TR_ENGINE_URL, TR_API_KEY: process.env.TR_API_KEY }
  Object.assign(process.env, env)
  for (const k of Object.keys(saved)) if (!(k in env)) delete process.env[k]
  try {
    const loaded = await loadConfigFromFile({ command, mode: 'development' }, configFile, root, 'silent')
    return loaded.config
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

/** What the proxy sends upstream for one incoming request */
function proxied(options, req) {
  const sent = {}
  const handlers = {}
  options.configure?.({ on: (event, fn) => { handlers[event] = fn } }, options)
  handlers.proxyReq?.({ setHeader: (k, v) => { sent[k.toLowerCase()] = v } }, req)
  return sent.authorization
}

const request = (remoteAddress, headers = {}) => ({
  socket: { remoteAddress },
  headers: { host: 'localhost:5173', ...headers },
})

let failed = 0
const results = []
async function test(name, fn) {
  try {
    await fn()
    results.push(`ok ${name}`)
  } catch (err) {
    failed++
    results.push(`FAIL ${name}\n  ${String(err?.stack ?? err).split('\n').slice(0, 6).join('\n  ')}`)
  }
}

const config = await load({ TR_ENGINE_URL: ENGINE, TR_API_KEY: KEY })
const api = config.server.proxy['/api']

await test('the dev proxy adds the key for this machine\'s own tab', () => {
  assert.equal(api.target, ENGINE)
  assert.equal(proxied(api, request('127.0.0.1')), `Bearer ${KEY}`)
  assert.equal(proxied(api, request('::1')), `Bearer ${KEY}`)
  assert.equal(proxied(api, request('::ffff:127.0.0.1')), `Bearer ${KEY}`)
  // Same-origin fetch/EventSource and a same-origin POST
  assert.equal(proxied(api, request('127.0.0.1', { 'sec-fetch-site': 'same-origin' })), `Bearer ${KEY}`)
  assert.equal(proxied(api, request('127.0.0.1', { 'sec-fetch-site': 'same-origin', origin: 'http://localhost:5173' })), `Bearer ${KEY}`)
  assert.equal(proxied(config.server.proxy['/health'], request('127.0.0.1')), `Bearer ${KEY}`)
})

await test('a key the browser sends is never replaced', () => {
  assert.equal(proxied(api, request('127.0.0.1', { authorization: 'Bearer tre_mine' })), undefined)
})

await test('LAN clients get no key (the dev server listens on every interface)', () => {
  assert.equal(config.server.host, '0.0.0.0')
  assert.equal(proxied(api, request('192.0.2.2')), undefined)
  assert.equal(proxied(api, request('10.1.2.3', { host: '10.1.2.3:5173' })), undefined)
  assert.equal(proxied(api, request('::ffff:192.168.1.20')), undefined)
  assert.equal(proxied(api, request('fe80::1')), undefined)
  assert.equal(proxied(api, request(undefined)), undefined)
})

await test('requests other sites make from the developer\'s browser get no key', () => {
  assert.equal(proxied(api, request('127.0.0.1', { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' })), undefined)
  assert.equal(proxied(api, request('127.0.0.1', { 'sec-fetch-site': 'same-site' })), undefined)
  // Older browsers without Sec-Fetch-*: the Origin header decides
  assert.equal(proxied(api, request('127.0.0.1', { origin: 'https://evil.example' })), undefined)
  assert.equal(proxied(api, request('127.0.0.1', { origin: 'http://localhost:3000' })), undefined)
  assert.equal(proxied(api, request('127.0.0.1', { origin: 'null' })), undefined)
})

await test('vite preview never adds the key', async () => {
  const preview = await load({ TR_ENGINE_URL: ENGINE, TR_API_KEY: KEY }, 'serve')
  const p = preview.preview.proxy
  assert.ok(p, 'preview has its own proxy (otherwise it inherits server.proxy)')
  assert.equal(p['/api'].target, ENGINE)
  assert.equal(proxied(p['/api'], request('127.0.0.1')), undefined)
  assert.equal(proxied(p['/health'], request('127.0.0.1')), undefined)
})

await test('without TR_API_KEY nothing is added; without TR_ENGINE_URL nothing is proxied', async () => {
  const noKey = await load({ TR_ENGINE_URL: ENGINE })
  assert.equal(proxied(noKey.server.proxy['/api'], request('127.0.0.1')), undefined)
  const noEngine = await load({ TR_API_KEY: KEY })
  assert.equal(noEngine.server.proxy, undefined)
  assert.equal(noEngine.preview.proxy, undefined)
})

for (const line of results) (line.startsWith('ok') ? console.log : console.error)(line)
if (failed) {
  console.error(`${failed} failed`)
  process.exit(1)
}
