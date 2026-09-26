import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { MainLayout } from '@/components/layout/MainLayout'
import { AuthGate } from '@/components/auth/AuthGate'
import { PageLoader } from '@/components/ui/page-loader'
import { QueryProvider } from '@/api/query'
import { useAuthStore } from '@/stores/useAuthStore'
import { installCredentialReset, useCredentialEpoch } from '@/stores/credentialState'
import { installCrossTabKeySync } from '@/api/auth'
import Dashboard from '@/pages/Dashboard'

// A key set, replaced or forgotten (or narrower access for the same key)
// clears the player, stream data and alert history (stores outside React
// Query), and key changes made in other tabs are followed.
installCredentialReset()
installCrossTabKeySync()

const Calls = lazy(() => import('@/pages/Calls'))
const CallDetail = lazy(() => import('@/pages/CallDetail'))
const Talkgroups = lazy(() => import('@/pages/Talkgroups'))
const TalkgroupDetail = lazy(() => import('@/pages/TalkgroupDetail'))
const TalkgroupAnalytics = lazy(() => import('@/pages/TalkgroupAnalytics'))
const Units = lazy(() => import('@/pages/Units'))
const UnitDetail = lazy(() => import('@/pages/UnitDetail'))
const UnitTagSuggestions = lazy(() => import('@/pages/UnitTagSuggestions'))
const Settings = lazy(() => import('@/pages/Settings'))
const Affiliations = lazy(() => import('@/pages/Affiliations'))
const TalkgroupDirectory = lazy(() => import('@/pages/TalkgroupDirectory'))
const CallGroups = lazy(() => import('@/pages/CallGroups'))
const CallGroupDetail = lazy(() => import('@/pages/CallGroupDetail'))
const Admin = lazy(() => import('@/pages/Admin'))
const Transcriptions = lazy(() => import('@/pages/Transcriptions'))
const Recorders = lazy(() => import('@/pages/Recorders'))
const SystemDetail = lazy(() => import('@/pages/SystemDetail'))
const Access = lazy(() => import('@/pages/Access'))
const Investigate = lazy(() => import('@/pages/Investigate'))


export default function App() {
  // A new or forgotten key, or narrower access for the same key (the epoch),
  // remounts the pages with an empty query cache and reconnects the event
  // stream, so nothing fetched with the previous credential is shown under
  // the new one (installCredentialReset above covers the Zustand stores).
  const apiKey = useAuthStore((s) => s.apiKey)
  const epoch = useCredentialEpoch((s) => s.epoch)

  return (
    <QueryProvider key={`${epoch}:${apiKey}`}>
      <Routes>
        <Route element={<AuthGate><MainLayout /></AuthGate>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/calls" element={<Suspense fallback={<PageLoader />}><Calls /></Suspense>} />
          <Route path="/calls/:id" element={<Suspense fallback={<PageLoader />}><CallDetail /></Suspense>} />
          <Route path="/transcriptions" element={<Suspense fallback={<PageLoader />}><Transcriptions /></Suspense>} />
          <Route path="/talkgroups" element={<Suspense fallback={<PageLoader />}><Talkgroups /></Suspense>} />
          <Route path="/talkgroups/:id" element={<Suspense fallback={<PageLoader />}><TalkgroupDetail /></Suspense>} />
          <Route path="/talkgroups/:id/analytics" element={<Suspense fallback={<PageLoader />}><TalkgroupAnalytics /></Suspense>} />
          <Route path="/units" element={<Suspense fallback={<PageLoader />}><Units /></Suspense>} />
          <Route path="/units/suggestions" element={<Suspense fallback={<PageLoader />}><UnitTagSuggestions /></Suspense>} />
          <Route path="/units/:id" element={<Suspense fallback={<PageLoader />}><UnitDetail /></Suspense>} />
          <Route path="/systems" element={<Suspense fallback={<PageLoader />}><Recorders /></Suspense>} />
          <Route path="/systems/:id" element={<Suspense fallback={<PageLoader />}><SystemDetail /></Suspense>} />
          <Route path="/affiliations" element={<Suspense fallback={<PageLoader />}><Affiliations /></Suspense>} />
          <Route path="/directory" element={<Suspense fallback={<PageLoader />}><TalkgroupDirectory /></Suspense>} />
          <Route path="/call-groups" element={<Suspense fallback={<PageLoader />}><CallGroups /></Suspense>} />
          <Route path="/call-groups/:id" element={<Suspense fallback={<PageLoader />}><CallGroupDetail /></Suspense>} />
          <Route path="/investigate" element={<Suspense fallback={<PageLoader />}><Investigate /></Suspense>} />
          <Route path="/settings" element={<Suspense fallback={<PageLoader />}><Settings /></Suspense>} />
          <Route path="/admin" element={<Suspense fallback={<PageLoader />}><Admin /></Suspense>} />
          <Route path="/access" element={<Suspense fallback={<PageLoader />}><Access /></Suspense>} />
          {/* Removed pages: sign-in (keys are pasted on the key screen or in Settings) and users (keys are managed on Access) */}
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/users" element={<Navigate to="/access" replace />} />
        </Route>
      </Routes>
    </QueryProvider>
  )
}
