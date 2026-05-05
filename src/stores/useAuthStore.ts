import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface AuthUser {
  id: number
  username: string
  role: string
}

export type AuthMode = 'open' | 'token' | 'full'

/**
 * Auth state machine:
 *   idle → detecting → open | token | login-required | authenticated | error
 *   login-required → authenticated (on login)
 *   authenticated → login-required (on logout / session expiry)
 *   error → detecting (on retry)
 */
export type AuthState =
  | 'idle'
  | 'detecting'
  | 'open'
  | 'token'
  | 'login-required'
  | 'authenticated'
  | 'error'

interface AuthStateStore {
  authState: AuthState
  authMode: AuthMode | null
  jwtEnabled: boolean
  readToken: string
  accessToken: string
  user: AuthUser | null
  isAuthenticated: boolean
  writeToken: string
  errorMessage: string

  setDetecting: () => void
  setOpen: (readToken: string) => void
  setToken: (readToken: string) => void
  setLoginRequired: () => void
  setAuthenticated: (accessToken: string, user: AuthUser) => void
  setAuthInit: (mode: AuthMode, readToken: string, jwtEnabled: boolean) => void
  setAuth: (accessToken: string, user: AuthUser) => void
  clearAuth: () => void
  setError: (message: string) => void
  setAccessToken: (token: string) => void
  setWriteToken: (token: string) => void
  clearWriteToken: () => void
  isAdmin: () => boolean
  canWrite: () => boolean
}

export const useAuthStore = create<AuthStateStore>()(
  persist(
    (set, get) => ({
      authState: 'idle',
      authMode: null,
      jwtEnabled: false,
      readToken: '',
      accessToken: '',
      user: null,
      isAuthenticated: false,
      writeToken: '',
      errorMessage: '',

      setDetecting: () => set({ authState: 'detecting' }),

      setOpen: (readToken) =>
        set({ authState: 'open', authMode: 'open', readToken, jwtEnabled: false }),

      setToken: (readToken) =>
        set({ authState: 'token', authMode: 'token', readToken, jwtEnabled: false }),

      setLoginRequired: () =>
        set({ authState: 'login-required', authMode: 'full', jwtEnabled: true, readToken: '' }),

      setAuthenticated: (accessToken, user) =>
        set({
          authState: 'authenticated',
          authMode: 'full',
          jwtEnabled: true,
          accessToken,
          user,
          isAuthenticated: true,
        }),

      setAuthInit: (mode, readToken, jwtEnabled) => {
        if (mode === 'open') {
          set({ authState: 'open', authMode: mode, readToken, jwtEnabled })
        } else if (mode === 'token') {
          set({ authState: 'token', authMode: mode, readToken, jwtEnabled })
        } else if (mode === 'full' && jwtEnabled) {
          set({ authState: 'login-required', authMode: mode, readToken, jwtEnabled })
        } else {
          set({ authState: 'open', authMode: mode, readToken, jwtEnabled })
        }
      },

      setAuth: (accessToken, user) =>
        set({ accessToken, user, isAuthenticated: true, authState: 'authenticated' }),

      clearAuth: () =>
        set({
          accessToken: '', user: null, isAuthenticated: false,
          authMode: null, readToken: '', jwtEnabled: false,
          authState: 'idle', errorMessage: '',
        }),

      setError: (message) => set({ authState: 'error', errorMessage: message }),

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
      partialize: (state) => ({
        writeToken: state.writeToken,
      }),
      migrate: (persisted: any, version: number) => {
        if (version === 0 && persisted && typeof persisted === 'object') {
          return {
            writeToken: persisted.writeToken || '',
          }
        }
        return persisted as AuthStateStore
      },
      version: 2,
    }
  )
)
