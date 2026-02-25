import { NavLink, Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useRealtimeStore } from '@/stores/useRealtimeStore'
import { useFilterStore } from '@/stores/useFilterStore'
import { useMonitorStore } from '@/stores/useMonitorStore'
import {
  formatDecodeRate,
  normalizeDecodeRate,
  parseTalkgroupKey,
  getTalkgroupDisplayName,
} from '@/lib/utils'

interface SidebarProps {
  collapsed: boolean
}

const navItems = [
  {
    label: 'Dashboard',
    path: '/',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect width="7" height="9" x="3" y="3" rx="1" />
        <rect width="7" height="5" x="14" y="3" rx="1" />
        <rect width="7" height="9" x="14" y="12" rx="1" />
        <rect width="7" height="5" x="3" y="16" rx="1" />
      </svg>
    ),
  },
  {
    label: 'Calls',
    path: '/calls',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" x2="12" y1="19" y2="22" />
      </svg>
    ),
  },
  {
    label: 'Transcriptions',
    path: '/transcriptions',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        <path d="M8 10h8" />
        <path d="M8 14h4" />
      </svg>
    ),
  },
  {
    label: 'Talkgroups',
    path: '/talkgroups',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    label: 'Units',
    path: '/units',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 20a6 6 0 0 0-12 0" />
        <circle cx="12" cy="10" r="4" />
        <circle cx="12" cy="12" r="10" />
      </svg>
    ),
  },
  {
    label: 'Settings',
    path: '/settings',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
]

export function Sidebar({ collapsed }: SidebarProps) {
  const decodeRates = useRealtimeStore((s) => s.decodeRates)
  const activeCalls = useRealtimeStore((s) => s.activeCalls)
  const favoriteTalkgroups = useFilterStore((s) => s.favoriteTalkgroups)
  const toggleFavoriteTalkgroup = useFilterStore((s) => s.toggleFavoriteTalkgroup)
  const monitoredTalkgroups = useMonitorStore((s) => s.monitoredTalkgroups)
  const removeTalkgroupMonitor = useMonitorStore((s) => s.removeTalkgroupMonitor)
  const isMonitoring = useMonitorStore((s) => s.isMonitoring)

  // Recent calls from active calls for talkgroup activity
  const recentActivity = Array.from(activeCalls.values()).slice(0, 10)

  // Display name from composite key
  const getTgDisplayNameFromKey = (key: string): string => {
    const parsed = parseTalkgroupKey(key)
    if (parsed) return `TG ${parsed.tgid}`
    return key
  }

  if (collapsed) {
    return (
      <aside className="flex w-16 flex-col items-center border-r border-border bg-card py-4">
        <nav className="flex flex-col gap-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground nav-active-glow'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )
              }
              title={item.label}
            >
              {item.icon}
            </NavLink>
          ))}
        </nav>
      </aside>
    )
  }

  return (
    <aside className="flex w-60 flex-col border-r border-border bg-card">
      <nav className="flex flex-col gap-1 p-3">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground nav-active-glow'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )
            }
          >
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <Separator />

      <ScrollArea className="flex-1">
        <div className="p-3">
          <h3 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Systems
          </h3>
          {decodeRates.size === 0 ? (
            <p className="px-2 text-xs text-muted-foreground">No systems connected</p>
          ) : (
            <div className="space-y-1">
              {Array.from(decodeRates.values()).map((rate) => {
                const norm = normalizeDecodeRate(rate.decode_rate)
                return (
                  <div
                    key={rate.sys_name || rate.system_id}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'h-2 w-2 rounded-full',
                          norm >= 0.9
                            ? 'bg-success'
                            : norm >= 0.7
                              ? 'bg-warning'
                              : 'bg-destructive'
                        )}
                      />
                      <span className="capitalize">{rate.sys_name || rate.system_name || `System ${rate.system_id}`}</span>
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatDecodeRate(rate.decode_rate)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <Separator className="my-2" />

        <div className="p-3">
          <h3 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Favorites
          </h3>
          {favoriteTalkgroups.length === 0 ? (
            <p className="px-2 text-xs text-muted-foreground">No favorite talkgroups</p>
          ) : (
            <div className="space-y-1">
              {favoriteTalkgroups.map((key) => {
                const parsed = parseTalkgroupKey(key)
                if (!parsed) return null
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <Link
                      to={`/talkgroups/${key}`}
                      className="hover:text-primary hover:underline truncate"
                    >
                      {getTgDisplayNameFromKey(key)}
                    </Link>
                    <button
                      onClick={() => toggleFavoriteTalkgroup(parsed.systemId, parsed.tgid)}
                      className="text-primary hover:text-primary/80 shrink-0"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <Separator className="my-2" />

        <div className="p-3">
          <h3 className="mb-2 flex items-center gap-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Monitored</span>
            {isMonitoring && (
              <span className="h-2 w-2 rounded-full bg-live animate-pulse" />
            )}
          </h3>
          {monitoredTalkgroups.size === 0 ? (
            <p className="px-2 text-xs text-muted-foreground">No talkgroups monitored</p>
          ) : (
            <div className="space-y-1">
              {Array.from(monitoredTalkgroups).map((key) => {
                const parsed = parseTalkgroupKey(key)
                if (!parsed) return null
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={cn(
                          'h-2 w-2 rounded-full shrink-0',
                          isMonitoring ? 'bg-live' : 'bg-muted-foreground'
                        )}
                      />
                      <Link
                        to={`/talkgroups/${key}`}
                        className="hover:text-primary hover:underline truncate"
                      >
                        {getTgDisplayNameFromKey(key)}
                      </Link>
                    </div>
                    <button
                      onClick={() => removeTalkgroupMonitor(parsed.systemId, parsed.tgid)}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                      title="Stop monitoring"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <Separator className="my-2" />

        <div className="p-3">
          <h3 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Active Calls
          </h3>
          {recentActivity.length === 0 ? (
            <p className="px-2 text-xs text-muted-foreground">No active calls</p>
          ) : (
            <div className="space-y-1">
              {recentActivity.map((call) => (
                <div
                  key={call.call_id}
                  className="rounded-md px-2 py-1.5 text-xs hover:bg-accent"
                >
                  <div className="flex items-center justify-between">
                    <Link
                      to={`/talkgroups/${call.system_id}:${call.tgid}`}
                      className="font-medium text-foreground hover:text-primary hover:underline truncate max-w-[120px]"
                      title={getTalkgroupDisplayName(call.tgid, call.tg_alpha_tag)}
                    >
                      {getTalkgroupDisplayName(call.tgid, call.tg_alpha_tag)}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </aside>
  )
}
