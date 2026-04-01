import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface AuthUser {
  id: number
  username: string
  role: string
}

export type AuthMode = 'open' | 'token' | 'full'

interface AuthState {
  // Auth mode from auth-init endpoint
  authMode: AuthMode | null
  jwtEnabled: boolean
  readToken: string

  // JWT auth
  accessToken: string
  user: AuthUser | null
  isAuthenticated: boolean

  // Legacy write token (backward compat / token mode)
  writeToken: string

  // Actions
  setAuthInit: (mode: AuthMode, readToken: string, jwtEnabled: boolean) => void
  setAuth: (accessToken: string, user: AuthUser) => void
  clearAuth: () => void
  setAccessToken: (token: string) => void
  setWriteToken: (token: string) => void
  clearWriteToken: () => void

  // Role helpers
  isAdmin: () => boolean
  canWrite: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      authMode: null,
      jwtEnabled: false,
      readToken: '',
      accessToken: '',
      user: null,
      isAuthenticated: false,
      writeToken: '',

      setAuthInit: (mode, readToken, jwtEnabled) =>
        set({ authMode: mode, readToken, jwtEnabled }),

      setAuth: (accessToken, user) =>
        set({ accessToken, user, isAuthenticated: true }),

      // Full reset: clears JWT session and auth-init state, forcing re-detection
      clearAuth: () =>
        set({ accessToken: '', user: null, isAuthenticated: false, authMode: null, readToken: '', jwtEnabled: false }),

      setAccessToken: (token) => set({ accessToken: token }),

      setWriteToken: (token) => set({ writeToken: token }),
      clearWriteToken: () => set({ writeToken: '' }),

      isAdmin: () => get().user?.role === 'admin',
      canWrite: () => {
        if (get().authMode === 'open') return true
        const role = get().user?.role
        return role === 'admin' || role === 'editor' || !!get().writeToken
      },
    }),
    {
      name: 'tr-dashboard-auth',
      // Only persist writeToken. Access token lives in memory only
      // (restored via refreshAuth on page load). User is also memory-only
      // to avoid a stale-role window where isAdmin()/canWrite() return
      // truthy before the refresh validates the session.
      partialize: (state) => ({
        writeToken: state.writeToken,
      }),
      // Migrate from old store shape — discard any persisted auth state
      migrate: (persisted: any, version: number) => {
        if (version === 0 && persisted && typeof persisted === 'object') {
          return {
            writeToken: persisted.writeToken || '',
          }
        }
        return persisted as AuthState
      },
      version: 2,
    }
  )
)
