#!/usr/bin/env node
import { request } from 'node:http'

const BASE = process.argv.find(a => a.startsWith('--base-url='))?.split('=')[1]
  || process.env.BASE_URL
  || 'http://localhost:8080'

function httpGet(url) {
  return new Promise((resolve, reject) => {
    request(url, { method: 'GET', timeout: 10000 }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) })
        } catch {
          reject(new Error(`non-json response (${res.statusCode}): ${data}`))
        }
      })
    }).on('error', reject).on('timeout', function () { this.destroy(); reject(new Error('timeout')) }).end()
  })
}

let failed = false
const check = (name, ok) => { if (!ok) { console.error(`FAIL ${name}`); failed = true } else { console.log(`ok ${name}`) } }

const url = `${BASE.replace(/\/+$/, '')}/api/v1/auth-init`

try {
  const { status, body } = await httpGet(url)

  check('HTTP 200', status === 200)
  check('has mode field', typeof body.mode === 'string' && ['open', 'token', 'full'].includes(body.mode))

  const mode = body.mode
  console.log(`  auth mode: ${mode}`)

  if (mode === 'open') {
    check('open mode — no read_token', body.read_token == null)
  } else if (mode === 'token') {
    check('token mode — read_token may be set', body.read_token !== undefined)
    check('token mode — AUTH_TOKEN (implicit via env)', !process.env.AUTH_TOKEN || body.read_token !== undefined)
  } else if (mode === 'full') {
    check('full mode — read_token may be set', body.read_token !== undefined)
  }
} catch (err) {
  console.error(`FAIL connection: ${err.message}`)
  failed = true
}

if (failed) process.exit(1)
