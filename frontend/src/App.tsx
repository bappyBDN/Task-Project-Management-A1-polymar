import { useEffect, useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth'
import { STORAGE_MODE } from './api'
import { store } from './store'
import Login from './pages/Login'
import Signup from './pages/Signup'
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
import logo from './assets/anwars-logo.jpg'

interface NavItem { to: string; label: string; icon: string }
interface NavSection { section: string; items: NavItem[]; adminOnly?: boolean }

// 24x24 line icons (stroke = currentColor, so they follow the link colour)
const ICONS: Record<string, string> = {
  dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  tasks: 'M9 11l3 3 8-8M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2h9',
  kanban: 'M4 3h4v18H4zM10 3h4v12h-4zM16 3h4v8h-4z',
  projects: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  backlog: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  governance: 'M4 21V4M4 4h12l-2 4 2 4H4',
  raci: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18',
  approvals: 'M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6zM9 12l2 2 4-4',
  notifications: 'M6 9a6 6 0 0112 0c0 6 3 8 3 8H3s3-2 3-8M10 21h4',
  audit: 'M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9zM14 3v6h6M8 13h8M8 17h5',
  admin: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  signout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
}

function NavIcon({ name }: { name: string }) {
  return (
    <svg className="nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  )
}

const WORKSPACE: NavItem[] = [
  { to: '/', label: 'My Dashboard', icon: 'dashboard' },
  { to: '/tasks', label: 'Tasks', icon: 'tasks' },
  { to: '/kanban', label: 'Kanban', icon: 'kanban' },
  { to: '/projects', label: 'Projects', icon: 'projects' },
  { to: '/backlog', label: 'Backlog', icon: 'backlog' },
]

const GOVERNANCE: NavItem[] = [
  { to: '/governance', label: 'Actions & Decisions', icon: 'governance' },
  { to: '/raci', label: 'RACI Matrix', icon: 'raci' },
  { to: '/approvals', label: 'Approvals', icon: 'approvals' },
  { to: '/notifications', label: 'Notifications', icon: 'notifications' },
  { to: '/audit', label: 'Audit Trail', icon: 'audit' },
]

const ADMIN: NavItem[] = [
  { to: '/admin', label: 'Admin Panel', icon: 'admin' },
]

function buildSections(isAdmin: boolean): NavSection[] {
  const sections: NavSection[] = [
    { section: 'My Workspace', items: WORKSPACE },
    { section: 'Governance', items: GOVERNANCE },
  ]
  if (isAdmin) sections.push({ section: 'Administration', items: ADMIN })
  return sections
}

const initialsOf = (name?: string) =>
  (name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'

function NotFound() {
  return (
    <div className="card empty" style={{ marginTop: 40 }}>
      <h2 style={{ color: 'var(--navy)', marginTop: 0 }}>Page not found</h2>
      <p>This page doesn't exist or you don't have access to it.</p>
      <Link to="/" className="btn primary">Go to My Dashboard</Link>
    </div>
  )
}

export default function App() {
  const { user, loading, logout } = useAuth()
  const location = useLocation()
  const [navOpen, setNavOpen] = useState(false)
  // close the phone menu after navigating
  useEffect(() => { setNavOpen(false) }, [location.pathname])

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

  // ---- Not logged in → show Sign Up or Login ----
  if (!user && location.pathname === '/signup') return <Signup />
  if (!user) return <Login />

  // ---- Logged in → main layout ----
  const isAdmin = user.role === 'admin'
  const sections = buildSections(isAdmin)

  return (
    <div className="app">
      {/* Phone / small screens: the sidebar is hidden and opens from this bar */}
      <header className="mobile-bar">
        <button className="btn sm" aria-label="Open menu" aria-expanded={navOpen} onClick={() => setNavOpen(true)}>☰</button>
        <img className="mobile-logo" src={logo} alt="Anwar Group" />
        <span className="mobile-title">Task &amp; Project Management</span>
      </header>
      <aside className={`sidebar${navOpen ? ' open' : ''}`}>
        <Link to="/" className="brand" aria-label="Anwar Group - My Dashboard">
          <img className="brand-logo" src={logo} alt="Anwar Group" />
          <div className="sub">Task &amp; Project Management</div>
        </Link>
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
                  <NavIcon name={i.icon} />
                  <span>{i.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-user">
          <div className="who">
            <span className="avatar" aria-hidden>{initialsOf(user.name)}</span>
            <div style={{ minWidth: 0 }}>
              <div className="name" title={user.name}>{user.name}</div>
              <div className="role">{label(user.role)}</div>
            </div>
          </div>
          <div className="conn">
            <i className={STORAGE_MODE === 'local' ? 'off' : ''} />
            {STORAGE_MODE === 'local' ? 'Data stored in browser (localStorage)' : 'Connected to database'}
          </div>
          <button className="signout" onClick={logout}><NavIcon name="signout" />Sign Out</button>
          {/* Only meaningful for the browser-only demo mode: it never touches the real database,
              so showing it to everyone in database mode was just alarming. */}
          {STORAGE_MODE === 'local' && (
            <button
              className="btn sm"
              style={{ marginTop: 4, width: '100%', color: 'var(--red)' }}
              onClick={() => { if (confirm('Reset all browser demo data to defaults?')) { store.reset(); window.location.reload() } }}
            >
              Reset Demo Data
            </button>
          )}
        </div>
      </aside>
      {navOpen && <div className="sidebar-backdrop" onClick={() => setNavOpen(false)} />}
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
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  )
}