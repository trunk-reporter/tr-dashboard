import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { MainLayout } from '@/components/layout/MainLayout'
import { RequireAuth } from '@/components/auth/RequireAuth'
import { PageLoader } from '@/components/ui/page-loader'
import Dashboard from '@/pages/Dashboard'
import Login from '@/pages/Login'

const Calls = lazy(() => import('@/pages/Calls'))
const CallDetail = lazy(() => import('@/pages/CallDetail'))
const Talkgroups = lazy(() => import('@/pages/Talkgroups'))
const TalkgroupDetail = lazy(() => import('@/pages/TalkgroupDetail'))
const TalkgroupAnalytics = lazy(() => import('@/pages/TalkgroupAnalytics'))
const Units = lazy(() => import('@/pages/Units'))
const UnitDetail = lazy(() => import('@/pages/UnitDetail'))
const Settings = lazy(() => import('@/pages/Settings'))
const Affiliations = lazy(() => import('@/pages/Affiliations'))
const TalkgroupDirectory = lazy(() => import('@/pages/TalkgroupDirectory'))
const CallGroups = lazy(() => import('@/pages/CallGroups'))
const CallGroupDetail = lazy(() => import('@/pages/CallGroupDetail'))
const Admin = lazy(() => import('@/pages/Admin'))
const Transcriptions = lazy(() => import('@/pages/Transcriptions'))
const Recorders = lazy(() => import('@/pages/Recorders'))
const SystemDetail = lazy(() => import('@/pages/SystemDetail'))
const Users = lazy(() => import('@/pages/Users'))
const Investigate = lazy(() => import('@/pages/Investigate'))


export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth><MainLayout /></RequireAuth>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/calls" element={<Suspense fallback={<PageLoader />}><Calls /></Suspense>} />
        <Route path="/calls/:id" element={<Suspense fallback={<PageLoader />}><CallDetail /></Suspense>} />
        <Route path="/transcriptions" element={<Suspense fallback={<PageLoader />}><Transcriptions /></Suspense>} />
        <Route path="/talkgroups" element={<Suspense fallback={<PageLoader />}><Talkgroups /></Suspense>} />
        <Route path="/talkgroups/:id" element={<Suspense fallback={<PageLoader />}><TalkgroupDetail /></Suspense>} />
        <Route path="/talkgroups/:id/analytics" element={<Suspense fallback={<PageLoader />}><TalkgroupAnalytics /></Suspense>} />
        <Route path="/units" element={<Suspense fallback={<PageLoader />}><Units /></Suspense>} />
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
        <Route path="/users" element={<Suspense fallback={<PageLoader />}><Users /></Suspense>} />
      </Route>
    </Routes>
  )
}
