import { useCallback } from 'react'
import { useAuthStore, scopesAllow } from '@/stores/useAuthStore'

/**
 * Pages built on endpoints that deny restricted credentials (`x-restricted:
 * deny`: units, affiliations, recorders, unit tag suggestions). Their nav
 * items and shortcuts are hidden while whoami.restricted is true.
 */
const RESTRICTED_HIDDEN_PATHS = new Set(['/units', '/units/suggestions', '/affiliations', '/systems'])

/** Pages that need the admin scope */
const ADMIN_PATHS = new Set(['/admin', '/access'])

export function isNavPathVisible(path: string, opts: { restricted: boolean; admin: boolean }): boolean {
  if (ADMIN_PATHS.has(path) && !opts.admin) return false
  if (RESTRICTED_HIDDEN_PATHS.has(path) && opts.restricted) return false
  return true
}

/** Reactive predicate for nav items, shortcuts and palette entries */
export function useNavVisible(): (path: string) => boolean {
  const restricted = useAuthStore((s) => s.restricted)
  const admin = useAuthStore((s) => scopesAllow(s.whoami, 'admin'))
  return useCallback((path: string) => isNavPathVisible(path, { restricted, admin }), [restricted, admin])
}
