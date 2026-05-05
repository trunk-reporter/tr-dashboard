import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeId = 'dark' | 'amber' | 'high-contrast' | 'light'

interface ThemeState {
  theme: ThemeId
  setTheme: (theme: ThemeId) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'dark',
      setTheme: (theme) => {
        set({ theme })
        document.documentElement.setAttribute('data-theme', theme)
      },
    }),
    {
      name: 'tr-dashboard-theme',
    }
  )
)
