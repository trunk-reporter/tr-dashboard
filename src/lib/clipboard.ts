/** Select all text in an element, so the user can copy it by hand */
export function selectElementText(el: Node): void {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(el)
  selection.removeAllRanges()
  selection.addRange(range)
}

/** The pre-Clipboard-API way, which also works over plain HTTP: copy from a temporary textarea */
function legacyCopy(text: string): boolean {
  const active = document.activeElement as HTMLElement | null
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.top = '0'
  ta.style.left = '0'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  let ok = false
  try {
    ta.select()
    ok = document.execCommand('copy')
  } catch {
    ok = false
  } finally {
    document.body.removeChild(ta)
    active?.focus?.()
  }
  return ok
}

/**
 * Copy text to the clipboard. The Clipboard API exists only in secure
 * contexts (HTTPS or localhost), so a dashboard served over plain HTTP on a
 * LAN falls back to the legacy copy command. If that fails too, `showEl` (the
 * element displaying the text) is selected for a manual Ctrl+C / Cmd+C.
 *
 * Resolves to 'copied', 'selected' (only selected: tell the user to copy) or
 * 'failed' (nothing to select).
 */
export async function copyText(text: string, showEl?: Node | null): Promise<'copied' | 'selected' | 'failed'> {
  // The legacy path must run before any await, while the click still counts
  // as a user gesture
  const hasApi = typeof navigator !== 'undefined' && !!navigator.clipboard?.writeText && window.isSecureContext !== false
  if (!hasApi && legacyCopy(text)) return 'copied'
  if (hasApi) {
    try {
      await navigator.clipboard.writeText(text)
      return 'copied'
    } catch {
      if (legacyCopy(text)) return 'copied'
    }
  }
  if (!showEl) return 'failed'
  selectElementText(showEl)
  return 'selected'
}
