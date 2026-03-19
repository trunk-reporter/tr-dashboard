import { Routes, Route } from 'react-router-dom'
import { MainLayout } from '@/components/layout/MainLayout'
import { RequireAuth } from '@/components/auth/RequireAuth'
import Dashboard from '@/pages/Dashboard'
import Calls from '@/pages/Calls'
import CallDetail from '@/pages/CallDetail'
import Talkgroups from '@/pages/Talkgroups'
import TalkgroupDetail from '@/pages/TalkgroupDetail'
import Units from '@/pages/Units'
import UnitDetail from '@/pages/UnitDetail'
import Settings from '@/pages/Settings'
import Affiliations from '@/pages/Affiliations'
import TalkgroupDirectory from '@/pages/TalkgroupDirectory'
import Admin from '@/pages/Admin'
import Transcriptions from '@/pages/Transcriptions'
import TalkgroupAnalytics from '@/pages/TalkgroupAnalytics'
import Recorders from '@/pages/Recorders'
import Login from '@/pages/Login'
import Users from '@/pages/Users'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth><MainLayout /></RequireAuth>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/calls" element={<Calls />} />
        <Route path="/calls/:id" element={<CallDetail />} />
        <Route path="/transcriptions" element={<Transcriptions />} />
        <Route path="/talkgroups" element={<Talkgroups />} />
        <Route path="/talkgroups/:id" element={<TalkgroupDetail />} />
        <Route path="/talkgroups/:id/analytics" element={<TalkgroupAnalytics />} />
        <Route path="/units" element={<Units />} />
        <Route path="/units/:id" element={<UnitDetail />} />
        <Route path="/systems" element={<Recorders />} />
        <Route path="/affiliations" element={<Affiliations />} />
        <Route path="/directory" element={<TalkgroupDirectory />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/users" element={<Users />} />
      </Route>
    </Routes>
  )
}
