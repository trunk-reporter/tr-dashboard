#!/usr/bin/env node
// Behaviour tests for auth-related client state: key input cleaning, key
// expiry dates, following key changes made in other tabs, key changes during
// a background re-check, and clearing the player/stream/alert state when the
// credential changes or its access narrows. The dashboard's own
// modules are loaded through Vite's SSR loader (for the `@/` alias and
// import.meta.env) with a fake window, localStorage and fetch.
// Run: node scripts/test-auth-state.mjs (or npm test)
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// --- browser stand-ins ------------------------------------------------------

class MemoryStorage {
  #m = new Map()
  get length() { return this.#m.size }
  key(i) { return [...this.#m.keys()][i] ?? null }
  getItem(k) { return this.#m.has(k) ? this.#m.get(k) : null }
  setItem(k, v) { this.#m.set(k, String(v)) }
  removeItem(k) { this.#m.delete(k) }
  clear() { this.#m.clear() }
}

const storage = new MemoryStorage()
const win = new EventTarget()
win.localStorage = storage
win.location = { href: 'http://dash.test/', origin: 'http://dash.test' }
globalThis.window = win
globalThis.localStorage = storage

const whoami = (over = {}) => ({
  credential: 'key',
  key: { id: 1, name: 'k', prefix: 'tre_00000000' },
  scopes: ['listen'],
  restricted: false,
  anonymous: { access: 'listen', restricted: false },
  version: 'test',
  ...over,
})
const ANON = whoami({ credential: 'anonymous', key: null })

/** Keys the fake engine accepts, by value → whoami */
const engineKeys = new Map()
/** Every request the fake engine got: { path, auth } */
let requests = []
/** Per-path overrides: path → () => Promise<Response> */
const routes = new Map()

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

globalThis.fetch = async (url, init = {}) => {
  const headers = new Headers(init.headers ?? {})
  const auth = headers.get('Authorization') ?? ''
  const p = new URL(String(url), 'http://dash.test').pathname
  requests.push({ path: p, auth })
  for (const [suffix, handler] of routes) if (p.endsWith(suffix)) return handler(auth)
  if (p.endsWith('/whoami')) {
    if (!auth) return json(200, ANON)
    const w = engineKeys.get(auth.replace(/^Bearer /, ''))
    return w ? json(200, w) : json(401, { error: 'invalid API key', code: 'invalid_key' })
  }
  return json(404, { error: 'not found' })
}

const tick = () => new Promise((r) => setTimeout(r, 0))
async function settle() {
  for (let i = 0; i < 10; i++) await tick()
}

// --- load the modules ---------------------------------------------------------

const server = await createServer({
  root,
  configFile: false,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false },
  resolve: { alias: { '@': path.join(root, 'src') } },
  optimizeDeps: { noDiscovery: true, include: [] },
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

try {
  const input = await server.ssrLoadModule('/src/lib/apiKeyInput.ts')
  const auth = await server.ssrLoadModule('/src/api/auth.ts')
  const { useAuthStore } = await server.ssrLoadModule('/src/stores/useAuthStore.ts')
  const { useAudioStore } = await server.ssrLoadModule('/src/stores/useAudioStore.ts')
  const { useRealtimeStore } = await server.ssrLoadModule('/src/stores/useRealtimeStore.ts')
  const { useTranscriptionCache } = await server.ssrLoadModule('/src/stores/useTranscriptionCache.ts')
  const { installCredentialReset, useCredentialEpoch, accessNarrowed } = await server.ssrLoadModule('/src/stores/credentialState.ts')
  const { useAlertStore } = await server.ssrLoadModule('/src/stores/useAlertStore.ts')
  const { resyncActiveCalls } = await server.ssrLoadModule('/src/stores/useRealtimeStore.ts')
  const { copyText } = await server.ssrLoadModule('/src/lib/clipboard.ts')

  const STORE = 'tr-dashboard-auth'
  const KEY_A = 'tre_' + 'a'.repeat(64)
  const KEY_B = 'tre_' + 'b'.repeat(64)
  engineKeys.set(KEY_A, whoami({ scopes: ['admin', 'edit', 'listen'], key: { id: 1, name: 'admin', prefix: 'tre_aaaaaaaa' } }))
  engineKeys.set(KEY_B, whoami({ key: { id: 2, name: 'listener', prefix: 'tre_bbbbbbbb' } }))
  const stored = () => JSON.parse(storage.getItem(STORE) ?? 'null')?.state?.apiKey
  /** What another tab does: write the persisted store and fire `storage` here */
  const otherTabStores = (apiKey) => {
    const old = storage.getItem(STORE)
    const value = JSON.stringify({ state: { apiKey, candidateKey: false }, version: 3 })
    storage.setItem(STORE, value)
    const e = new Event('storage')
    Object.assign(e, { key: STORE, oldValue: old, newValue: value, storageArea: storage })
    win.dispatchEvent(e)
  }
  const reset = async () => {
    await settle()
    routes.clear()
    requests = []
    useAuthStore.setState({ apiKey: '', candidateKey: false, whoami: ANON, status: 'ready', error: '', restricted: false })
    useAudioStore.getState().reset()
    useRealtimeStore.getState().clearStreamData()
    useTranscriptionCache.getState().clear()
    useAlertStore.setState({ rules: [], history: [] })
  }

  // ---------------------------------------------------------------------------
  // Key expiry dates (r1-18): 00:00 UTC at the start of the date, like the CLI
  // (`--expires 2026-12-31`) and the engine's admin.html
  // ---------------------------------------------------------------------------
  const NOW = Date.parse('2026-09-26T08:59:00Z')

  await test('a date-only expiry is 00:00 UTC that date', () => {
    assert.equal(input.expiryFromDate('2026-12-31'), '2026-12-31T00:00:00.000Z')
    assert.equal(input.expiryFromDate(''), null)
  })

  await test('today and past dates are refused, tomorrow is accepted', () => {
    assert.match(input.expiryDateProblem('2026-09-26', NOW), /future/)
    assert.match(input.expiryDateProblem('2026-01-01', NOW), /future/)
    assert.equal(input.expiryDateProblem('2026-09-27', NOW), null)
    assert.equal(input.expiryDateProblem('', NOW), null)
    assert.match(input.expiryDateProblem('2026-02-31x', NOW), /valid/)
  })

  await test('the date input minimum is always an accepted date', () => {
    for (const t of ['2026-09-26T00:00:00Z', '2026-09-26T08:59:00Z', '2026-09-26T23:59:59Z', '2026-12-31T23:00:00Z']) {
      const now = Date.parse(t)
      assert.equal(input.expiryDateProblem(input.minExpiryDate(now), now), null, t)
      const before = new Date(Date.parse(`${input.minExpiryDate(now)}T00:00:00Z`) - 86400000).toISOString().slice(0, 10)
      assert.notEqual(input.expiryDateProblem(before, now), null, t)
    }
  })

  await test('an expiry shows as its UTC date and round-trips', () => {
    assert.equal(input.dateFromExpiry('2026-12-31T00:00:00Z'), '2026-12-31')
    assert.equal(input.dateFromExpiry('2026-12-31T20:00:00-05:00'), '2027-01-01')
    assert.equal(input.dateFromExpiry(null), '')
    assert.equal(input.dateFromExpiry(input.expiryFromDate('2027-03-01')), '2027-03-01')
  })

  // ---------------------------------------------------------------------------
  // Pasted keys (r1-23)
  // ---------------------------------------------------------------------------
  await test('curly quotes and invisible characters around a key are dropped', () => {
    assert.deepEqual(input.cleanPastedKey(`\u201C${KEY_A}\u201D`), { key: KEY_A })
    assert.deepEqual(input.cleanPastedKey(`${KEY_A}\u200B`), { key: KEY_A })
    assert.deepEqual(input.cleanPastedKey(`\uFEFF ${KEY_A} \u2060`), { key: KEY_A })
    // e.g. a renderer that inserts break opportunities into long strings
    assert.deepEqual(input.cleanPastedKey(`${KEY_A.slice(0, 20)}\u200B${KEY_A.slice(20, 40)}\u00AD${KEY_A.slice(40)}`), { key: KEY_A })
    assert.deepEqual(input.cleanPastedKey(`"${KEY_A}"`), { key: KEY_A })
    assert.deepEqual(input.cleanPastedKey(`'${KEY_A}'`), { key: KEY_A })
  })

  await test('straight quotes around a non-tre_ value are kept (legacy keys may contain them)', () => {
    assert.deepEqual(input.cleanPastedKey('"legacy-secret-value"'), { key: '"legacy-secret-value"' })
  })

  await test('characters no key can have get a key-specific message', () => {
    const inner = input.cleanPastedKey(`tre_ab\u201Ccd`)
    assert.match(inner.error, /doesn't look like an API key/)
    assert.match(inner.error, /U\+201C/)
    assert.match(input.cleanPastedKey('tre_ab\u0007cd').error, /invisible character \(U\+0007\)/)
    assert.match(input.cleanPastedKey('p\u00E4sswort-legacy').error, /U\+00E4/)
    assert.match(input.cleanPastedKey('tre_ab cd').error, /no spaces/)
    assert.match(input.cleanPastedKey(' \u200B ').error, /Paste an API key/)
  })

  await test('connectKey sends the cleaned key and stores it', async () => {
    await reset()
    const problem = await auth.connectKey(`\u201C${KEY_B}\u201D\u200B`)
    assert.equal(problem, null)
    assert.equal(useAuthStore.getState().apiKey, KEY_B)
    assert.deepEqual(requests.map((r) => r.auth), [`Bearer ${KEY_B}`])
  })

  await test('connectKey refuses an unsendable key without calling the engine or blaming the network', async () => {
    await reset()
    const problem = await auth.connectKey(`tre_\u2018abc\u2019def`)
    assert.match(problem, /doesn't look like an API key/)
    assert.doesNotMatch(problem, /connect/i)
    assert.equal(requests.length, 0)
  })

  await test('a stored unsendable key is reported as a key problem, not a network error', async () => {
    await reset()
    const r = await auth.fetchWhoami('tre_abc\u200Bdef')
    assert.equal(r.kind, 'invalid-key')
    assert.equal(requests.length, 0)
  })

  // ---------------------------------------------------------------------------
  // Other tabs (r1-19)
  // ---------------------------------------------------------------------------
  auth.installCrossTabKeySync()

  await test('a key forgotten in another tab is not written back by this tab', async () => {
    await reset()
    useAuthStore.getState().setKey(KEY_A, engineKeys.get(KEY_A))
    assert.equal(stored(), KEY_A)
    otherTabStores('')
    await settle()
    assert.equal(useAuthStore.getState().apiKey, '')
    assert.equal(useAuthStore.getState().status, 'ready')
    assert.equal(useAuthStore.getState().whoami.credential, 'anonymous')
    // Any later auth-store write here (an Access-page change re-checks auth)
    await auth.recheckAuth()
    useAuthStore.getState().updateWhoami(ANON)
    assert.equal(stored(), '')
  })

  await test('a key replaced in another tab is adopted and re-checked', async () => {
    await reset()
    useAuthStore.getState().setKey(KEY_A, engineKeys.get(KEY_A))
    otherTabStores(KEY_B)
    await settle()
    const s = useAuthStore.getState()
    assert.equal(s.apiKey, KEY_B)
    assert.equal(s.status, 'ready')
    assert.deepEqual(s.whoami.scopes, ['listen'])
    assert.ok(requests.some((r) => r.path.endsWith('/whoami') && r.auth === `Bearer ${KEY_B}`))
    await auth.recheckAuth()
    assert.equal(stored(), KEY_B)
  })

  await test('a re-check in flight for the old key does not block the adopted one', async () => {
    await reset()
    useAuthStore.getState().setKey(KEY_A, engineKeys.get(KEY_A))
    let release
    const gate = new Promise((r) => { release = r })
    routes.set('/whoami', async (a) => {
      if (a === `Bearer ${KEY_A}`) await gate
      routes.delete('/whoami')
      return globalThis.fetch('/api/v1/whoami', { headers: a ? { Authorization: a } : {} })
    })
    const pending = auth.recheckAuth()
    otherTabStores('')
    release()
    await pending
    await settle()
    assert.equal(useAuthStore.getState().apiKey, '')
    assert.equal(useAuthStore.getState().status, 'ready')
    assert.equal(useAuthStore.getState().whoami.credential, 'anonymous')
  })

  await test('unrelated storage keys are ignored; a cleared localStorage forgets the key', async () => {
    await reset()
    useAuthStore.getState().setKey(KEY_A, engineKeys.get(KEY_A))
    const other = new Event('storage')
    Object.assign(other, { key: 'tr-dashboard-monitor', storageArea: storage })
    win.dispatchEvent(other)
    await settle()
    assert.equal(useAuthStore.getState().apiKey, KEY_A)

    storage.clear()
    const cleared = new Event('storage')
    Object.assign(cleared, { key: null, storageArea: storage })
    win.dispatchEvent(cleared)
    await settle()
    assert.equal(useAuthStore.getState().apiKey, '')
    assert.equal(stored(), '')
  })

  // ---------------------------------------------------------------------------
  // A key connected while a background re-check waits (r2-16)
  // ---------------------------------------------------------------------------
  /** Hold every anonymous /whoami until release(); keyed ones answer at once */
  const holdAnonymousWhoami = () => {
    let release
    const gate = new Promise((r) => { release = r })
    const hold = { held: 0, release: () => release() }
    routes.set('/whoami', async (a) => {
      if (!a) {
        hold.held++
        await gate
        return json(200, ANON)
      }
      const w = engineKeys.get(a.replace(/^Bearer /, ''))
      return w ? json(200, w) : json(401, { error: 'API key revoked', code: 'invalid_key' })
    })
    return hold
  }
  const KEY_C = 'tre_' + 'c'.repeat(64)
  const keyC = (over = {}) => whoami({ key: { id: 3, name: 'soon revoked', prefix: 'tre_cccccccc' }, ...over })

  await test('a key connected while the re-check of a revoked key waits is kept', async () => {
    await reset()
    useAuthStore.getState().setKey(KEY_C, keyC())
    // Revoked: /whoami answers 401, and the re-check then asks for the anonymous policy
    const hold = holdAnonymousWhoami()
    const pending = auth.recheckAuth()
    await settle()
    assert.equal(hold.held, 1)
    assert.equal(await auth.connectKey(KEY_B), null)
    hold.release()
    await pending
    const s = useAuthStore.getState()
    assert.equal(s.apiKey, KEY_B)
    assert.equal(s.status, 'ready')
    assert.equal(s.error, '')
    assert.equal(s.whoami.key.id, 2)
  })

  await test('a key connected while the re-check of a key that lost listen waits is kept', async () => {
    await reset()
    engineKeys.set(KEY_C, keyC())
    useAuthStore.getState().setKey(KEY_C, keyC())
    engineKeys.set(KEY_C, keyC({ scopes: ['upload'] }))
    const hold = holdAnonymousWhoami()
    const pending = auth.recheckAuth()
    await settle()
    assert.equal(hold.held, 1)
    assert.equal(await auth.connectKey(KEY_B), null)
    hold.release()
    await pending
    engineKeys.delete(KEY_C)
    assert.equal(useAuthStore.getState().apiKey, KEY_B)
    assert.equal(useAuthStore.getState().status, 'ready')
  })

  await test('a key connected while Forget waits is kept', async () => {
    await reset()
    useAuthStore.getState().setKey(KEY_A, engineKeys.get(KEY_A))
    const hold = holdAnonymousWhoami()
    const forgetting = auth.forgetKey()
    await settle()
    assert.equal(hold.held, 1)
    assert.equal(await auth.connectKey(KEY_B), null)
    hold.release()
    await forgetting
    const s = useAuthStore.getState()
    assert.equal(s.apiKey, KEY_B)
    assert.equal(s.status, 'ready')
    assert.equal(s.whoami.credential, 'key')
    assert.equal(stored(), KEY_B)
  })

  await test('a page restored from the back/forward cache adopts the stored key', async () => {
    await reset()
    useAuthStore.getState().setKey(KEY_A, engineKeys.get(KEY_A))
    storage.setItem(STORE, JSON.stringify({ state: { apiKey: KEY_B, candidateKey: false }, version: 3 }))
    const show = new Event('pageshow')
    Object.assign(show, { persisted: true })
    win.dispatchEvent(show)
    await settle()
    assert.equal(useAuthStore.getState().apiKey, KEY_B)
  })

  // ---------------------------------------------------------------------------
  // Credential change clears the player and stream state (r1-21)
  // ---------------------------------------------------------------------------
  installCredentialReset()

  const call = (id, over = {}) => ({
    call_id: id,
    system_id: 1,
    system_name: 'butco',
    tgid: 9178,
    tg_alpha_tag: 'Fire Main',
    duration: 4,
    units: [{ unit_id: 1001, alpha_tag: 'Engine 1' }],
    src_list: [{ src: 1001, time: 0, pos: 0 }],
    ...over,
  })
  const fill = () => {
    const audio = useAudioStore.getState()
    audio.setVolume(0.3)
    audio.loadCall(call(1))
    audio.loadCall(call(2))
    useAudioStore.setState({ playbackState: 'playing' })
    audio.addToQueue(call(3))
    const rt = useRealtimeStore.getState()
    rt.handleCallStart(call(4))
    rt.handleUnitEvent({ event_type: 'call', unit_id: 1001, system_id: 1, tgid: 9178 })
    rt.handleRateUpdate({ sys_name: 'butco', system_id: 1, decode_rate: 0.9 })
    rt.handleRecorderUpdate({ id: 'rec0', instance_id: 'tr-1', state: 'recording' })
    useTranscriptionCache.setState({ cache: new Map([[2, { status: 'loaded', transcription: { text: 'engine 1 on scene' } }]]) })
    const a = useAudioStore.getState()
    assert.equal(a.currentCall.callId, 2)
    assert.equal(a.history.length, 1)
    assert.equal(a.queue.length, 1)
  }
  const assertCleared = () => {
    const a = useAudioStore.getState()
    assert.equal(a.currentCall, null)
    assert.equal(a.playbackState, 'idle')
    assert.deepEqual(a.queue, [])
    assert.deepEqual(a.history, [])
    assert.deepEqual(a.transmissions, [])
    assert.equal(a.unitTags.size, 0)
    assert.equal(a.volume, 0.3, 'volume is a preference and survives')
    const rt = useRealtimeStore.getState()
    assert.equal(rt.activeCalls.size, 0)
    assert.deepEqual(rt.unitEvents, [])
    assert.equal(rt.decodeRates.size, 0)
    assert.deepEqual(rt.recorders, [])
    assert.equal(useTranscriptionCache.getState().cache.size, 0)
  }

  await test('forgetting the key clears the player, stream data and transcriptions', async () => {
    await reset()
    useAuthStore.getState().setKey(KEY_A, engineKeys.get(KEY_A))
    fill()
    await auth.forgetKey()
    assert.equal(useAuthStore.getState().apiKey, '')
    assertCleared()
  })

  await test('replacing the key clears them too', async () => {
    await reset()
    useAuthStore.getState().setKey(KEY_A, engineKeys.get(KEY_A))
    fill()
    assert.equal(await auth.connectKey(KEY_B), null)
    assertCleared()
  })

  await test('a key change from another tab clears them too', async () => {
    await reset()
    useAuthStore.getState().setKey(KEY_A, engineKeys.get(KEY_A))
    fill()
    otherTabStores('')
    await settle()
    assertCleared()
  })

  await test('a whoami refresh for the same key keeps the player', async () => {
    await reset()
    useAuthStore.getState().setKey(KEY_A, engineKeys.get(KEY_A))
    fill()
    await auth.recheckAuth()
    assert.equal(useAudioStore.getState().currentCall.callId, 2)
    assert.equal(useRealtimeStore.getState().activeCalls.size, 1)
  })

  await test('transmissions or a transcription arriving after the reset are dropped', async () => {
    await reset()
    useAuthStore.getState().setKey(KEY_A, engineKeys.get(KEY_A))
    let releaseTx, releaseTr
    const txGate = new Promise((r) => { releaseTx = r })
    const trGate = new Promise((r) => { releaseTr = r })
    routes.set('/transmissions', async () => { await txGate; return json(200, { transmissions: [{ src: 1001 }], total: 1 }) })
    routes.set('/transcription', async () => { await trGate; return json(200, { text: 'old credential' }) })
    useAudioStore.getState().loadCall(call(7, { src_list: [] }))
    const tr = useTranscriptionCache.getState().fetchTranscription(7)
    await settle()
    await auth.forgetKey()
    releaseTx()
    releaseTr()
    await tr
    await settle()
    assert.deepEqual(useAudioStore.getState().transmissions, [])
    assert.equal(useTranscriptionCache.getState().cache.size, 0)
  })

  // ---------------------------------------------------------------------------
  // Alert history (r2-17): persisted, and its messages name talkgroups
  // ---------------------------------------------------------------------------
  const alertRule = { label: 'Watch 1:9178', enabled: true, trigger: 'talkgroup', value: '1:9178', cooldownMs: 60000 }
  const fillAlerts = () => {
    useAlertStore.getState().addRule(alertRule)
    const ruleId = useAlertStore.getState().rules[0].id
    useAlertStore.getState().addEvent({ ruleId, label: alertRule.label, message: 'Fire Main is active' })
    assert.equal(useAlertStore.getState().history.length, 1)
  }
  const persistedAlerts = () => JSON.parse(storage.getItem('tr-dashboard-alerts')).state

  await test('forgetting the key clears the alert history (also in storage) and keeps the rules', async () => {
    await reset()
    useAuthStore.getState().setKey(KEY_A, engineKeys.get(KEY_A))
    fillAlerts()
    await auth.forgetKey()
    assert.deepEqual(useAlertStore.getState().history, [])
    assert.deepEqual(persistedAlerts().history, [])
    assert.equal(useAlertStore.getState().rules.length, 1)
    assert.equal(persistedAlerts().rules[0].value, '1:9178')
  })

  await test('replacing the key clears the alert history too; a same-key refresh keeps it', async () => {
    await reset()
    useAuthStore.getState().setKey(KEY_A, engineKeys.get(KEY_A))
    fillAlerts()
    await auth.recheckAuth()
    assert.equal(useAlertStore.getState().history.length, 1)
    assert.equal(await auth.connectKey(KEY_B), null)
    assert.deepEqual(useAlertStore.getState().history, [])
    assert.equal(useAlertStore.getState().rules.length, 1)
  })

  // ---------------------------------------------------------------------------
  // Narrower access for the same key, or for no key (r2-18)
  // ---------------------------------------------------------------------------
  const KEY_R = 'tre_' + 'e'.repeat(64)
  const keyR = (restriction = null) =>
    whoami({ key: { id: 5, name: 'restricted later', prefix: 'tre_eeeeeeee', restriction }, restricted: restriction !== null })
  const EXCLUDE_9178 = { allow_all: true, exclude_talkgroups: ['1:9178'] }
  const epoch = () => useCredentialEpoch.getState().epoch

  await test('accessNarrowed: lost scopes, a new or changed restriction and a rejected key narrow; widening does not', () => {
    const edit = whoami({ scopes: ['edit', 'listen'] })
    assert.equal(accessNarrowed(edit, whoami()), true)
    assert.equal(accessNarrowed(whoami(), edit), false)
    assert.equal(accessNarrowed(keyR(), keyR(EXCLUDE_9178)), true)
    assert.equal(accessNarrowed(keyR(EXCLUDE_9178), keyR()), false)
    assert.equal(accessNarrowed(keyR(EXCLUDE_9178), keyR({ allow_all: true, exclude_talkgroups: ['1:9178', '1:7777'] })), true)
    // Same lists in another order: no change
    assert.equal(accessNarrowed(
      keyR({ systems: [2, 1], talkgroups: ['3:1', '1:5'] }),
      keyR({ systems: [1, 2], talkgroups: ['1:5', '3:1'] })), false)
    assert.equal(accessNarrowed(keyR(), null), true)
    assert.equal(accessNarrowed(keyR(), ANON), true)
    const restrictedAnon = whoami({ credential: 'anonymous', key: null, restricted: true, anonymous: { access: 'listen', restricted: true } })
    assert.equal(accessNarrowed(ANON, restrictedAnon), true)
    assert.equal(accessNarrowed(restrictedAnon, ANON), false)
    assert.equal(accessNarrowed(ANON, whoami({ credential: 'anonymous', key: null, scopes: [], anonymous: { access: 'off', restricted: false } })), true)
    // An admin changing the anonymous policy doesn't change the admin's own access
    const admin = engineKeys.get(KEY_A)
    assert.equal(accessNarrowed(admin, { ...admin, anonymous: { access: 'listen', restricted: true } }), false)
  })

  await test('a restriction added to the key in use clears the player, stream and alerts and remounts the pages', async () => {
    await reset()
    engineKeys.set(KEY_R, keyR())
    useAuthStore.getState().setKey(KEY_R, keyR())
    fill()
    fillAlerts()
    const before = epoch()
    engineKeys.set(KEY_R, keyR(EXCLUDE_9178))
    await auth.recheckAuth()
    assert.equal(useAuthStore.getState().apiKey, KEY_R)
    assert.equal(useAuthStore.getState().restricted, true)
    assertCleared()
    assert.deepEqual(useAlertStore.getState().history, [])
    assert.equal(useAlertStore.getState().rules.length, 1)
    assert.equal(epoch(), before + 1)

    // Asking again with the same answer changes nothing
    fill()
    await auth.recheckAuth()
    assert.equal(useRealtimeStore.getState().activeCalls.size, 1)
    assert.equal(epoch(), before + 1)

    // Lifting the restriction keeps what the narrower access already showed
    engineKeys.set(KEY_R, keyR())
    await auth.recheckAuth()
    assert.equal(useAuthStore.getState().restricted, false)
    assert.equal(useRealtimeStore.getState().activeCalls.size, 1)
    assert.equal(epoch(), before + 1)
    engineKeys.delete(KEY_R)
  })

  await test('a restricted anonymous policy clears what was seen under the open one', async () => {
    await reset()
    await auth.recheckAuth() // anonymous, unrestricted
    fill()
    const before = epoch()
    const restrictedAnon = whoami({ credential: 'anonymous', key: null, restricted: true, anonymous: { access: 'listen', restricted: true } })
    routes.set('/whoami', async (a) => (a ? json(401, { code: 'invalid_key' }) : json(200, restrictedAnon)))
    await auth.recheckAuth()
    assert.equal(useAuthStore.getState().status, 'ready')
    assert.equal(useAuthStore.getState().restricted, true)
    assertCleared()
    assert.equal(epoch(), before + 1)
  })

  await test('a key revoked while in use clears its data before the key screen', async () => {
    await reset()
    engineKeys.set(KEY_R, keyR())
    useAuthStore.getState().setKey(KEY_R, keyR())
    fill()
    engineKeys.delete(KEY_R)
    await auth.recheckAuth()
    assert.equal(useAuthStore.getState().status, 'invalid-key')
    assertCleared()
  })

  await test('a whoami refresh after a key change in another tab does not clear twice', async () => {
    await reset()
    useAuthStore.getState().setKey(KEY_A, engineKeys.get(KEY_A))
    const before = epoch()
    otherTabStores(KEY_B)
    await settle()
    assert.equal(useAuthStore.getState().apiKey, KEY_B)
    fill()
    await auth.recheckAuth()
    assert.equal(useRealtimeStore.getState().activeCalls.size, 1)
    assert.equal(epoch(), before)
  })

  // ---------------------------------------------------------------------------
  // Active calls whose call_end never arrives (r2-18 backstop)
  // ---------------------------------------------------------------------------
  const activeIds = () => [...useRealtimeStore.getState().activeCalls.keys()].sort((a, b) => a - b)

  await test('calls tr-engine no longer lists as active are dropped', async () => {
    await reset()
    const rt = useRealtimeStore.getState()
    rt.handleCallStart(call(4, { tgid: 7777, tg_alpha_tag: 'SENSITIVE-LIVE' }))
    rt.handleCallStart(call(5))
    routes.set('/calls/active', async () => json(200, { calls: [call(5)], total: 1 }))
    await resyncActiveCalls()
    assert.deepEqual(activeIds(), [5])
    assert.ok(requests.some((r) => r.path.endsWith('/calls/active')))
  })

  await test('a call_start racing the re-sync is kept; no request while nothing is active', async () => {
    await reset()
    const rt = useRealtimeStore.getState()
    rt.handleCallStart(call(4))
    let release
    const gate = new Promise((r) => { release = r })
    routes.set('/calls/active', async () => { await gate; return json(200, { calls: [], total: 0 }) })
    const pending = resyncActiveCalls()
    await settle()
    rt.handleCallStart(call(6))
    release()
    await pending
    assert.deepEqual(activeIds(), [6])

    requests = []
    rt.handleCallEnd(call(6))
    await resyncActiveCalls()
    assert.equal(requests.length, 0)
  })

  await test('a re-sync in flight across a credential change leaves the new stream alone', async () => {
    await reset()
    useRealtimeStore.getState().handleCallStart(call(4))
    let release
    const gate = new Promise((r) => { release = r })
    routes.set('/calls/active', async () => { await gate; return json(200, { calls: [], total: 0 }) })
    const pending = resyncActiveCalls()
    await settle()
    useRealtimeStore.getState().clearStreamData()
    useRealtimeStore.getState().handleCallStart(call(4))
    release()
    await pending
    assert.deepEqual(activeIds(), [4])
  })

  await test('a failed re-sync keeps the active calls', async () => {
    await reset()
    useRealtimeStore.getState().handleCallStart(call(4))
    routes.set('/calls/active', async () => json(500, { error: 'boom' }))
    await resyncActiveCalls()
    assert.deepEqual(activeIds(), [4])
  })

  // ---------------------------------------------------------------------------
  // Copying the show-once key (r1-22): over plain HTTP there is no Clipboard API
  // ---------------------------------------------------------------------------
  const dom = { execResult: false, execCalls: 0, appended: [], selected: null, written: [] }
  globalThis.document = {
    activeElement: null,
    body: {
      appendChild: (el) => dom.appended.push(el),
      removeChild: (el) => { dom.appended = dom.appended.filter((x) => x !== el) },
    },
    createElement: () => ({ value: '', style: {}, setAttribute() {}, select() { dom.selectedText = this.value } }),
    createRange: () => ({ selectNodeContents(node) { this.node = node } }),
    execCommand: (cmd) => { dom.execCalls++; return cmd === 'copy' && dom.execResult },
  }
  win.getSelection = () => ({ removeAllRanges() { dom.selected = null }, addRange(r) { dom.selected = r.node } })
  const setClipboard = (secure, clipboard) => {
    win.isSecureContext = secure
    Object.defineProperty(globalThis.navigator, 'clipboard', { value: clipboard, configurable: true })
  }
  const resetDom = (execResult) => Object.assign(dom, { execResult, execCalls: 0, appended: [], selected: null, selectedText: null, written: [] })
  const keyEl = { textContent: KEY_A }

  await test('over plain HTTP the key is copied with the legacy copy command', async () => {
    resetDom(true)
    setClipboard(false, undefined)
    assert.equal(await copyText(KEY_A, keyEl), 'copied')
    assert.equal(dom.selectedText, KEY_A)
    assert.equal(dom.execCalls, 1)
    assert.deepEqual(dom.appended, [], 'the temporary textarea is removed')
  })

  await test('when no copy works the key is selected for a manual copy, not silently ignored', async () => {
    resetDom(false)
    setClipboard(false, undefined)
    assert.equal(await copyText(KEY_A, keyEl), 'selected')
    assert.equal(dom.selected, keyEl)
    assert.equal(await copyText(KEY_A, null), 'failed')
  })

  await test('in a secure context the Clipboard API is used, with the same fallbacks when it is refused', async () => {
    resetDom(false)
    setClipboard(true, { writeText: async (t) => { dom.written.push(t) } })
    assert.equal(await copyText(KEY_A, keyEl), 'copied')
    assert.deepEqual(dom.written, [KEY_A])
    assert.equal(dom.execCalls, 0)

    resetDom(false)
    setClipboard(true, { writeText: async () => { throw new Error('NotAllowedError') } })
    assert.equal(await copyText(KEY_A, keyEl), 'selected')
    assert.equal(dom.selected, keyEl)
  })
} finally {
  await server.close()
}

for (const line of results) (line.startsWith('ok') ? console.log : console.error)(line)
if (failed) {
  console.error(`${failed} failed`)
  process.exit(1)
}
