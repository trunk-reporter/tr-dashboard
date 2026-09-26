// Pure helpers for API key input: pasted keys (key screen, Settings) and key
// expiry dates (Access page). Tested by scripts/test-auth-state.mjs.

/**
 * Invisible formatting characters documents, email and chat apps add to copied
 * text (soft hyphen, zero-width space/joiners, direction marks, word joiner,
 * BOM). None can be part of a key, so they are dropped wherever they are.
 */
const INVISIBLE = /[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g

/** Typographic quotes a key picks up when copied from a document or email. They can never be part of a usable key. */
const TYPOGRAPHIC_QUOTES = '\u2018\u2019\u201A\u201B\u201C\u201D\u201E\u201F\u00AB\u00BB\u2039\u203A'
const TYPOGRAPHIC_QUOTES_AROUND = new RegExp(`^[${TYPOGRAPHIC_QUOTES}]+|[${TYPOGRAPHIC_QUOTES}]+$`, 'g')

/** A key minted by tr-engine: `tre_` + 64 hex characters */
const MINTED_KEY = /^tre_[0-9a-f]{64}$/

/** A character an API key can have: printable ASCII, including the space */
const KEY_CHAR = /^[\x20-\x7e]$/

/** Tabs and line breaks: never part of a key, and a line break can't be sent in a header */
const TAB_OR_LINE_BREAK = /[\t\n\v\f\r\u0085\u2028\u2029]/

/**
 * What an Authorization header can carry for a key: printable ASCII
 * (U+0020-U+007E), with no space at either end. Browsers refuse to send
 * anything outside ISO-8859-1 (fetch throws before any request, which looks
 * like a network failure), and the engine hashes the bytes it receives, so a
 * non-ASCII value could never match. Inner spaces can be sent: an imported
 * legacy key (WRITE_TOKEN / AUTH_TOKEN) may contain them, and the engine
 * accepts it. Only a value failing this check is refused without asking the
 * engine; the engine decides about everything else.
 */
export function isSendableKey(key: string): boolean {
  return /^[\x21-\x7e](?:[\x20-\x7e]*[\x21-\x7e])?$/.test(key)
}

function describeChar(ch: string): string {
  const code = `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`
  if (/[\p{Cc}\p{Cf}]/u.test(ch)) return `an invisible character (${code})`
  if (/\s/.test(ch)) return `a special space (${code})`
  return `"${ch}" (${code})`
}

/** Message for a value that is not sendable as a key, naming the first offending character */
export function unsendableKeyMessage(key: string): string {
  const bad = Array.from(key).find((ch) => !KEY_CHAR.test(ch))
  const what = bad ? describeChar(bad) : 'a space at the start or end'
  return (
    `This doesn't look like an API key: it contains ${what}, which an API key can't have. ` +
    'Copy the key again from where it was first shown (curly quotes and invisible characters often come from documents, email or chat).'
  )
}

export type PastedKey = { key: string; error?: undefined } | { key?: undefined; error: string }

/**
 * Clean a pasted key before it is sent: drop invisible characters, surrounding
 * whitespace and typographic quotes, and straight quotes around a well-formed
 * `tre_` key (e.g. copied from `KEY="tre_..."`). Other straight quotes are
 * kept, since an imported legacy key may contain them. Then refuse only what
 * can't be a key: tabs and line breaks, characters that can't be sent in a
 * header (isSendableKey), and a space in a key minted by tr-engine (`tre_...`).
 * Anything else, e.g. an imported legacy key with inner spaces, is left to
 * /whoami. Same rules as tr-engine's web/auth.js. Returns the key, or a
 * message saying why it can't be one.
 */
export function cleanPastedKey(raw: string): PastedKey {
  let key = raw.replace(INVISIBLE, '').trim().replace(TYPOGRAPHIC_QUOTES_AROUND, '').trim()
  const unquoted = key.length > 2 && (key[0] === '"' || key[0] === "'" || key[0] === '`') && key.endsWith(key[0])
    ? key.slice(1, -1).trim()
    : null
  if (unquoted !== null && MINTED_KEY.test(unquoted)) key = unquoted

  if (!key) return { error: 'Paste an API key.' }
  if (TAB_OR_LINE_BREAK.test(key)) return { error: 'An API key has no line breaks or tabs.' }
  if (!isSendableKey(key)) return { error: unsendableKeyMessage(key) }
  if (key.startsWith('tre_') && key.includes(' ')) {
    return { error: 'A tr-engine API key (tre_…) has no spaces. Copy the key again from where it was first shown.' }
  }
  return { key }
}

// -----------------------------------------------------------------------------
// Expiry dates
// -----------------------------------------------------------------------------

/**
 * A date-only expiry means 00:00 UTC at the start of that date, the same as
 * `tr-engine keys create --expires 2026-12-31` and the engine's admin.html.
 */
export const EXPIRY_DATE_HINT = 'The key stops working at 00:00 UTC at the start of this date.'

/** `<input type="date">` value (YYYY-MM-DD) → RFC3339 at 00:00 UTC that date; null for none */
export function expiryFromDate(date: string): string | null {
  return date ? new Date(`${date}T00:00:00Z`).toISOString() : null
}

/** RFC3339 expiry → the UTC date for `<input type="date">` */
export function dateFromExpiry(expires: string | null | undefined): string {
  if (!expires) return ''
  const t = Date.parse(expires)
  return Number.isNaN(t) ? expires.slice(0, 10) : new Date(t).toISOString().slice(0, 10)
}

/** Why an expiry date can't be used, or null (an empty date means "never") */
export function expiryDateProblem(date: string, now: number = Date.now()): string | null {
  if (!date) return null
  const t = Date.parse(`${date}T00:00:00Z`)
  if (Number.isNaN(t)) return 'Pick a valid expiry date.'
  if (t <= now) return 'The expiry date must be in the future: the key would stop working at 00:00 UTC on that date.'
  return null
}

/** The earliest date an expiry can have (tomorrow in UTC), for the date input's `min` */
export function minExpiryDate(now: number = Date.now()): string {
  return new Date(now + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
