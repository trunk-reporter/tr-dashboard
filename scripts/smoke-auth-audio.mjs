#!/usr/bin/env node
import { readFileSync } from 'node:fs'

const apiClient = readFileSync(new URL('../src/api/client.ts', import.meta.url), 'utf8')
const authStore = readFileSync(new URL('../src/stores/useAuthStore.ts', import.meta.url), 'utf8')

const checks = [
  ['auth-init open/token/full state', authStore.includes("AuthMode = 'open' | 'token' | 'full'") && authStore.includes('setAuthInit')],
  ['audio blob URL playback', apiClient.includes('getCallAudioBlobUrl') && apiClient.includes('URL.createObjectURL')],
  ['no audio token query', !apiClient.includes('?token=${') && !apiClient.includes('token=')],
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
