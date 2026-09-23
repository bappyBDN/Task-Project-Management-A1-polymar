import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { store } from '../store'
import { Company, Department, Function, Project, Task, User } from '../types'
import { HEALTH_COLORS, PRIORITY_COLORS, STATUS_COLORS, fmtDate, label } from '../constants'
import TaskForm from '../components/TaskForm'
import SearchableSelect from '../components/SearchableSelect'

export default function Tasks() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [functions, setFunctions] = useState<Function[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [showForm, setShowForm] = useState(false)
  const [filter, setFilter] = useState({ project_id: '', company_id: '', function_id: '', department_id: '', status: '', priority: '', overdue: '', responsible_id: '' })
  const navigate = useNavigate()

  const canSeeAll = user ? store.isPrivileged(user.role) : false

  useEffect(() => {
    api.get<Task[]>('/tasks').then(setTasks)
    api.get<Project[]>('/projects').then(setProjects)
    api.get<User[]>('/organizations/users').then(setUsers)
    api.get<Company[]>('/organizations/companies').then(setCompanies)
    api.get<Function[]>('/organizations/functions').then(setFunctions)
    api.get<Department[]>('/organizations/departments').then(setDepartments)
  }, [])

  const reload = () => api.get<Task[]>('/tasks').then(setTasks)

  const visibleTasks = useMemo(() => {
    if (!user || canSeeAll) return tasks
    // Regular users see only their own tasks (responsible or accountable)
    return tasks.filter((t) => t.responsible_id === user.id || t.accountable_id === user.id)
  }, [tasks, user, canSeeAll])

  const filtered = useMemo(() => {
    return visibleTasks.filter((t) => {
      if (filter.project_id && String(t.project_id) !== String(filter.project_id)) return false
      if (filter.company_id && String(t.company_id) !== String(filter.company_id)) return false
      if (filter.function_id && String(t.function_id) !== String(filter.function_id)) return false
      if (filter.department_id && String(t.department_id) !== String(filter.department_id)) return false
      if (filter.status && t.status !== filter.status) return false
      if (filter.priority && t.priority !== filter.priority) return false
      if (filter.responsible_id && String(t.responsible_id) !== String(filter.responsible_id)) return false
      if (filter.overdue === 'true') {
        const due = t.approved_due_date || t.baseline_due_date
        const done = ['completed', 'closed', 'cancelled'].includes(t.status)
        if (done || !due || due >= new Date().toISOString().slice(0, 10)) return false
      }
      return true
    })
  }, [visibleTasks, filter])

  const isFiltered = filter.project_id || filter.company_id || filter.function_id || filter.department_id || filter.status || filter.priority || filter.overdue || filter.responsible_id

  const projectItems = [{ value: '', label: 'All projects' }, ...projects.map((p) => ({ value: String(p.id), label: `${p.code} — ${p.name}` }))]
  const companyItems = [{ value: '', label: 'All SBUs' }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))]
  const functionItems = [{ value: '', label: 'All functions' }, ...functions.map((f) => ({ value: String(f.id), label: f.name }))]
  const departmentItems = [{ value: '', label: 'All departments' }, ...departments.map((dp) => ({ value: String(dp.id), label: dp.name }))]
  const userItems = [{ value: '', label: 'All' }, ...users.map((u) => ({ value: String(u.id), label: u.name }))]
  const statusItems = [{ value: '', label: 'All' }, ...Object.keys(STATUS_COLORS).map((s) => ({ value: s, label: label(s) }))]
  const priorityItems = [{ value: '', label: 'All' }, ...Object.keys(PRIORITY_COLORS).map((s) => ({ value: s, label: label(s) }))]
  const timingItems = [{ value: '', label: 'All' }, { value: 'true', label: 'Overdue' }]

  const companyName = (id?: number) => companies.find((c) => c.id === id)?.name
  const functionName = (id?: number) => functions.find((f) => f.id === id)?.name

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Tasks</h1>
          <div className="crumb">Uniform task master across the group</div>
        </div>
        <button className="btn primary" onClick={() => setShowForm(true)}>+ New Task</button>
      </div>

      <div className="filters">
        <div className="field" style={{ minWidth: 200 }}>
          <label>SBU</label>
          <SearchableSelect value={filter.company_id} items={companyItems} onChange={(v) => setFilter({ ...filter, company_id: v })} placeholder="Type to search SBU…" />
        </div>
        <div className="field" style={{ minWidth: 180 }}>
          <label>Function</label>
          <SearchableSelect value={filter.function_id} items={functionItems} onChange={(v) => setFilter({ ...filter, function_id: v })} placeholder="Type to search…" />
        </div>
        <div className="field" style={{ minWidth: 180 }}>
          <label>Department</label>
          <SearchableSelect value={filter.department_id} items={departmentItems} onChange={(v) => setFilter({ ...filter, department_id: v })} placeholder="Type to search…" />
        </div>
        <div className="field" style={{ minWidth: 200 }}>
          <label>Project</label>
          <SearchableSelect value={filter.project_id} items={projectItems} onChange={(v) => setFilter({ ...filter, project_id: v })} placeholder="Type to search project…" />
        </div>
        <div className="field" style={{ minWidth: 180 }}>
          <label>Responsible</label>
          <SearchableSelect value={filter.responsible_id} items={userItems} onChange={(v) => setFilter({ ...filter, responsible_id: v })} placeholder="Type to search user…" />
        </div>
        <div className="field" style={{ minWidth: 150 }}>
          <label>Status</label>
          <SearchableSelect value={filter.status} items={statusItems} onChange={(v) => setFilter({ ...filter, status: v })} placeholder="Type to search…" />
        </div>
        <div className="field" style={{ minWidth: 150 }}>
          <label>Priority</label>
          <SearchableSelect value={filter.priority} items={priorityItems} onChange={(v) => setFilter({ ...filter, priority: v })} placeholder="Type to search…" />
        </div>
        <div className="field" style={{ minWidth: 140 }}>
          <label>Timing</label>
          <SearchableSelect value={filter.overdue} items={timingItems} onChange={(v) => setFilter({ ...filter, overdue: v })} placeholder="Select…" />
        </div>
        {isFiltered && (
          <button className="btn sm" onClick={() => setFilter({ project_id: '', company_id: '', function_id: '', department_id: '', status: '', priority: '', overdue: '', responsible_id: '' })}>
            Clear
          </button>
        )}
      </div>

      <div className="small muted" style={{ margin: '0 0 10px 2px' }}>
        {filtered.length} of {visibleTasks.length} tasks{!canSeeAll && user ? ' (your tasks only)' : ''}
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Code</th><th>Task</th><th>SBU</th><th>Project</th><th>Responsible</th>
              <th>Priority</th><th>Status</th><th>Health</th><th>Progress</th><th>Due</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => {
              const proj = projects.find((p) => p.id === t.project_id)
              const owner = users.find((u) => u.id === t.responsible_id)
              return (
                <tr key={t.id} onClick={() => navigate(`/tasks/${t.id}`)} style={{ cursor: 'pointer' }}>
                  <td className="muted small">{t.code}</td>
                  <td><Link to={`/tasks/${t.id}`}>{t.title}</Link>{t.blocker && <span className="badge red" style={{ marginLeft: 8 }}>Blocked</span>}</td>
                  <td className="small">{companyName(t.company_id) ?? '—'}</td>
                  <td className="small">
                    {proj ? (
                      <Link
                        to={`/projects/${proj.id}`}
                        onClick={(e) => e.stopPropagation()}
                        style={{ color: 'var(--green)', fontWeight: 600, textDecoration: 'underline' }}
                      >
                        {proj.name}
                      </Link>
                    ) : '—'}
                  </td>
                  <td className="small">{owner?.name ?? '—'}</td>
                  <td><span className={`badge ${PRIORITY_COLORS[t.priority]}`}>{label(t.priority)}</span></td>
                  <td><span className={`badge ${STATUS_COLORS[t.status]}`}>{label(t.status)}</span></td>
                  <td><span className={`health-dot ${HEALTH_COLORS[t.health] ?? 'gray'}`} /></td>
                  <td style={{ minWidth: 110 }}>
                    <div className="progress"><span style={{ width: `${t.progress_pct}%` }} /></div>
                    <span className="small muted">{t.progress_pct}%</span>
                  </td>
                  <td className="small">{fmtDate(t.approved_due_date || t.baseline_due_date)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="empty">No tasks match your filters.</div>}
      </div>

      {showForm && (
        <TaskForm
          projects={projects}
          users={users}
          companies={companies}
          functions={functions}
          departments={departments}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); reload() }}
          onRefresh={() => { api.get<Project[]>('/projects').then(setProjects); api.get<User[]>('/organizations/users').then(setUsers) }}
        />
      )}
    </div>
  )
}