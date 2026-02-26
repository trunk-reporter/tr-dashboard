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
import { getHealth } from '@/api/client'
import { KEYBOARD_SHORTCUTS } from '@/lib/constants'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useFaviconStatus } from '@/hooks/useFaviconStatus'
import { useEmergencyNotifications } from '@/hooks/useEmergencyNotifications'

export function MainLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [goToMenuOpen, setGoToMenuOpen] = useState(false)
  const navigate = useNavigate()

  const checkForUpdate = useUpdateStore((s) => s.checkForUpdate)

  usePageTitle()
  useFaviconStatus()
  useEmergencyNotifications()

  // Initialize SSE connection and check for updates
  useEffect(() => {
    const cleanup = initializeRealtimeConnection()

    getHealth()
      .then((health) => checkForUpdate(health.version ?? null))
      .catch(() => checkForUpdate())

    return cleanup
  }, [checkForUpdate])

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev)
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
    <div className="flex h-screen flex-col bg-background">
      <Header onToggleSidebar={toggleSidebar} onOpenCommand={openCommand} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar collapsed={sidebarCollapsed} />

        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-auto p-4">
            <Outlet />
          </div>
          <AudioPlayer />
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
