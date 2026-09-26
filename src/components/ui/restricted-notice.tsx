import { EmptyState } from './empty-state'

/**
 * Shown in place of data from an endpoint that denies restricted credentials
 * (units, affiliations, recorders, stats): the API functions return
 * Unavailable instead of calling the engine.
 */
export function RestrictedNotice({ what }: { what: string }) {
  return (
    <EmptyState
      title={`${what} aren't available`}
      description="Your access is limited to some systems or talkgroups, and tr-engine only serves this for unrestricted access."
    />
  )
}
