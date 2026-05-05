import { useState, useEffect, useCallback } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useHotkeys } from 'react-hotkeys-hook'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { AudioPlayer } from '@/components/audio/AudioPlayer'
import { CommandPalette } from '@/components/command/CommandPalette'
import { GoToMenu } from '@/components/command/GoToMenu'
import { initializeRealtimeConnection } from '@/stores/useRealtimeStore'
import { useUpdateStore } from '@/stores/useUpdateStore'
import { useThemeStore } from '@/stores/useThemeStore'
import { getHealth } from '@/api/client'
import { KEYBOARD_SHORTCUTS } from '@/lib/constants'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useFaviconStatus } from '@/hooks/useFaviconStatus'
import { useEmergencyNotifications } from '@/hooks/useEmergencyNotifications'
import { PWAUpdateBanner } from './PWAUpdateBanner'
import { OfflineBanner } from './OfflineBanner'

export function MainLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [goToMenuOpen, setGoToMenuOpen] = useState(false)
  const navigate = useNavigate()

  const checkForUpdate = useUpdateStore((s) => s.checkForUpdate)

  usePageTitle()
  useFaviconStatus()
  useEmergencyNotifications()

  // Apply persisted theme on mount
  const theme = useThemeStore((s) => s.theme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Initialize SSE connection and check for updates
  useEffect(() => {
    const cleanup = initializeRealtimeConnection()

    const doUpdateCheck = () => {
      getHealth()
        .then((health) => checkForUpdate(health.version ?? null))
        .catch(() => checkForUpdate())
    }

    doUpdateCheck()
    const updateInterval = setInterval(doUpdateCheck, 60 * 60 * 1000)

    return () => {
      cleanup()
      clearInterval(updateInterval)
    }
  }, [checkForUpdate])

  const toggleSidebar = useCallback(() => {
    if (window.innerWidth < 768) {
      setSidebarOpen((prev) => !prev)
    } else {
      setSidebarCollapsed((prev) => !prev)
    }
  }, [])

  const openCommand = useCallback(() => {
    setCommandOpen(true)
  }, [])

  // Keyboard shortcuts
  useHotkeys(KEYBOARD_SHORTCUTS.COMMAND_PALETTE, (e) => {
    e.preventDefault()
    setCommandOpen((prev) => !prev)
  })

  useHotkeys(KEYBOARD_SHORTCUTS.TOGGLE_SIDEBAR, (e) => {
    e.preventDefault()
    toggleSidebar()
  })

  // Show "Go to" menu when 'g' is pressed
  useHotkeys('g', (e) => {
    e.preventDefault()
    setGoToMenuOpen(true)
  }, { enabled: !commandOpen && !goToMenuOpen })

  // Navigation shortcuts (vim-style g+key sequences)
  useHotkeys(KEYBOARD_SHORTCUTS.GO_TO_DASHBOARD, (e) => {
    e.preventDefault()
    setGoToMenuOpen(false)
    navigate('/')
  })

  useHotkeys(KEYBOARD_SHORTCUTS.GO_TO_CALLS, (e) => {
    e.preventDefault()
    setGoToMenuOpen(false)
    navigate('/calls')
  })

  useHotkeys(KEYBOARD_SHORTCUTS.GO_TO_TALKGROUPS, (e) => {
    e.preventDefault()
    setGoToMenuOpen(false)
    navigate('/talkgroups')
  })

  useHotkeys(KEYBOARD_SHORTCUTS.GO_TO_UNITS, (e) => {
    e.preventDefault()
    setGoToMenuOpen(false)
    navigate('/units')
  })

  useHotkeys(KEYBOARD_SHORTCUTS.GO_TO_AFFILIATIONS, (e) => {
    e.preventDefault()
    setGoToMenuOpen(false)
    navigate('/affiliations')
  })

  useHotkeys(KEYBOARD_SHORTCUTS.GO_TO_DIRECTORY, (e) => {
    e.preventDefault()
    setGoToMenuOpen(false)
    navigate('/directory')
  })

  useHotkeys(KEYBOARD_SHORTCUTS.GO_TO_SETTINGS, (e) => {
    e.preventDefault()
    setGoToMenuOpen(false)
    navigate('/settings')
  })

  useHotkeys(KEYBOARD_SHORTCUTS.GO_TO_ADMIN, (e) => {
    e.preventDefault()
    setGoToMenuOpen(false)
    navigate('/admin')
  })

  // Escape to close menus
  useHotkeys(KEYBOARD_SHORTCUTS.ESCAPE, () => {
    setCommandOpen(false)
    setGoToMenuOpen(false)
  }, { enabled: commandOpen || goToMenuOpen })

  return (
    <div className="flex h-screen flex-col bg-background safe-area-top">
      <PWAUpdateBanner />
      <OfflineBanner />
      <Header onToggleSidebar={toggleSidebar} onOpenCommand={openCommand} />

      <div className="flex flex-1 overflow-hidden">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        {/* Desktop sidebar */}
        <div className="hidden md:block">
          <Sidebar collapsed={sidebarCollapsed} />
        </div>
        {/* Mobile sidebar — always expanded */}
        {sidebarOpen && (
          <div className="fixed inset-y-0 left-0 z-50 md:hidden">
            <Sidebar collapsed={false} onNavigate={() => setSidebarOpen(false)} />
          </div>
        )}

        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-auto p-2 md:p-4">
            <Outlet />
          </div>
          <div className="safe-area-bottom">
            <AudioPlayer />
          </div>
        </main>
      </div>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      <GoToMenu open={goToMenuOpen} onOpenChange={setGoToMenuOpen} onNavigate={(path) => {
        setGoToMenuOpen(false)
        navigate(path)
      }} />
    </div>
  )
}
