import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth'
import { STORAGE_MODE } from './api'
import { store } from './store'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Tasks from './pages/Tasks'
import TaskDetail from './pages/TaskDetail'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import Approvals from './pages/Approvals'
import ApprovalDetail from './pages/ApprovalDetail'
import Audit from './pages/Audit'
import Backlog from './pages/Backlog'
import Governance from './pages/Governance'
import Raci from './pages/Raci'
import Kanban from './pages/Kanban'
import Notifications from './pages/Notifications'
import AdminPanel from './pages/AdminPanel'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import { label } from './constants'

interface NavItem { to: string; label: string; icon: string }
interface NavSection { section: string; items: NavItem[]; adminOnly?: boolean }

const WORKSPACE: NavItem[] = [
  { to: '/', label: 'My Dashboard', icon: '▦' },
  { to: '/tasks', label: 'Tasks', icon: '✓' },
  { to: '/kanban', label: 'Kanban', icon: '▥' },
  { to: '/projects', label: 'Projects', icon: '▤' },
  { to: '/backlog', label: 'Backlog', icon: '☰' },
]

const GOVERNANCE: NavItem[] = [
  { to: '/governance', label: 'Actions & Decisions', icon: '⚑' },
  { to: '/raci', label: 'RACI Matrix', icon: '◈' },
  { to: '/approvals', label: 'Approvals', icon: '⏺' },
  { to: '/notifications', label: 'Notifications', icon: '✉' },
  { to: '/audit', label: 'Audit Trail', icon: '≡' },
]

const ADMIN: NavItem[] = [
  { to: '/admin', label: 'Admin Panel', icon: '⚙' },
]

function buildSections(isAdmin: boolean): NavSection[] {
  const sections: NavSection[] = [
    { section: 'My Workspace', items: WORKSPACE },
    { section: 'Governance', items: GOVERNANCE },
  ]
  if (isAdmin) sections.push({ section: 'Administration', items: ADMIN })
  return sections
}

export default function App() {
  const { user, loading, logout } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        Loading…
      </div>
    )
  }

  // ---- PUBLIC routes: always standalone, no sidebar, no auth required ----
  if (location.pathname === '/forgot-password') return <ForgotPassword />
  if (location.pathname === '/reset-password') return <ResetPassword />

  // ---- Not logged in → show Login ----
  if (!user) return <Login />

  // ---- Logged in → main layout ----
  const isAdmin = user.role === 'admin'
  const sections = buildSections(isAdmin)

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="title">Anwar Group</div>
          <div className="sub">Task &amp; Project Management</div>
        </div>
        <nav className="nav">
          {sections.map((s) => (
            <div key={s.section}>
              <div className="section">{s.section}</div>
              {s.items.map((i) => (
                <NavLink
                  key={i.to}
                  to={i.to}
                  end={i.to === '/'}
                  className={({ isActive }) => (isActive ? 'active' : '')}
                >
                  <span>{i.icon}</span>
                  <span>{i.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div style={{ padding: '14px 18px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="small" style={{ fontWeight: 600 }}>{user.name}</div>
          <div className="small" style={{ color: 'var(--gold)', fontSize: 11 }}>{label(user.role)}</div>
          <div className="small" style={{ color: '#7e8aa0', fontSize: 10, marginTop: 4 }}>
            {STORAGE_MODE === 'local' ? 'Data stored in browser (localStorage)' : 'Connected to database'}
          </div>
          <button className="btn sm" style={{ marginTop: 8, width: '100%' }} onClick={logout}>Sign Out</button>
          <button
            className="btn sm"
            style={{ marginTop: 4, width: '100%', color: 'var(--red)' }}
            onClick={() => { if (confirm('Reset all data to defaults?')) { store.reset(); window.location.reload() } }}
          >
            Reset Data
          </button>
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/tasks/:id" element={<TaskDetail />} />
          <Route path="/kanban" element={<Kanban />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/backlog" element={<Backlog />} />
          <Route path="/governance" element={<Governance />} />
          <Route path="/raci" element={<Raci />} />
          <Route path="/approvals" element={<Approvals />} />
          <Route path="/approvals/:id" element={<ApprovalDetail />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/audit" element={<Audit />} />
          {isAdmin && <Route path="/admin" element={<AdminPanel />} />}
        </Routes>
      </main>
    </div>
  )
}