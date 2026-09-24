import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { store } from '../store'
import { Company, Department, Function, Project, Task, User } from '../types'
import { HEALTH_COLORS, PRIORITY_COLORS, STATUS_COLORS, label } from '../constants'
import SearchableSelect from '../components/SearchableSelect'

const COLUMNS = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'ready', label: 'Ready' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'in_review', label: 'In Review' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'completed', label: 'Completed' },
]

export default function Kanban() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [functions, setFunctions] = useState<Function[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [filter, setFilter] = useState({ project_id: '', company_id: '', function_id: '', department_id: '', responsible_id: '', priority: '' })
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

  const name = (id?: number) => users.find((u) => u.id === id)?.name
  const companyName = (id?: number) => companies.find((c) => c.id === id)?.name
  const functionName = (id?: number) => functions.find((f) => f.id === id)?.name
  const departmentName = (id?: number) => departments.find((d) => d.id === id)?.name

  const visibleTasks = useMemo(() => {
    let list = user && !canSeeAll
      ? tasks.filter((t) => t.responsible_id === user.id || t.accountable_id === user.id)
      : tasks
    if (filter.project_id) list = list.filter((t) => String(t.project_id) === String(filter.project_id))
    if (filter.company_id) list = list.filter((t) => String(t.company_id) === String(filter.company_id))
    if (filter.function_id) list = list.filter((t) => String(t.function_id) === String(filter.function_id))
    if (filter.department_id) list = list.filter((t) => String(t.department_id) === String(filter.department_id))
    if (filter.responsible_id) list = list.filter((t) => String(t.responsible_id) === String(filter.responsible_id))
    if (filter.priority) list = list.filter((t) => t.priority === filter.priority)
    return list
  }, [tasks, user, canSeeAll, filter])

  const move = async (task: Task, status: string) => {
    await api.patch(`/tasks/${task.id}`, { ...task, status })
    const fresh = await api.get<Task[]>('/tasks')
    setTasks(fresh)
  }

  const isFiltered = filter.project_id || filter.company_id || filter.function_id || filter.department_id || filter.responsible_id || filter.priority

  const projectItems = [{ value: '', label: 'All projects' }, ...projects.map((p) => ({ value: String(p.id), label: `${p.code} — ${p.name}` }))]
  const companyItems = [{ value: '', label: 'All SBUs' }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))]
  const functionItems = [{ value: '', label: 'All functions' }, ...functions.map((f) => ({ value: String(f.id), label: f.name }))]
  const departmentItems = [{ value: '', label: 'All departments' }, ...departments.map((d) => ({ value: String(d.id), label: d.name }))]
  const userItems = [{ value: '', label: 'All' }, ...users.map((u) => ({ value: String(u.id), label: u.name }))]
  const priorityItems = [{ value: '', label: 'All' }, ...Object.keys(PRIORITY_COLORS).map((p) => ({ value: p, label: label(p) }))]

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Kanban Board</h1>
          <div className="crumb">Drag-free workflow — move cards by changing status</div>
          {!canSeeAll && user && <div className="small muted" style={{ marginTop: 4 }}>Showing your tasks only</div>}
        </div>
      </div>

      <div className="filters">
        <div className="field" style={{ minWidth: 190 }}>
          <label>SBU</label>
          <SearchableSelect value={filter.company_id} items={companyItems} onChange={(v) => setFilter({ ...filter, company_id: v })} placeholder="Type to search SBU…" />
        </div>
        <div className="field" style={{ minWidth: 170 }}>
          <label>Function</label>
          <SearchableSelect value={filter.function_id} items={functionItems} onChange={(v) => setFilter({ ...filter, function_id: v })} placeholder="Type to search…" />
        </div>
        <div className="field" style={{ minWidth: 170 }}>
          <label>Department</label>
          <SearchableSelect value={filter.department_id} items={departmentItems} onChange={(v) => setFilter({ ...filter, department_id: v })} placeholder="Type to search…" />
        </div>
        <div className="field" style={{ minWidth: 200 }}>
          <label>Project</label>
          <SearchableSelect value={filter.project_id} items={projectItems} onChange={(v) => setFilter({ ...filter, project_id: v })} placeholder="Type to search project…" />
        </div>
        <div className="field" style={{ minWidth: 170 }}>
          <label>Responsible</label>
          <SearchableSelect value={filter.responsible_id} items={userItems} onChange={(v) => setFilter({ ...filter, responsible_id: v })} placeholder="Type to search user…" />
        </div>
        <div className="field" style={{ minWidth: 140 }}>
          <label>Priority</label>
          <SearchableSelect value={filter.priority} items={priorityItems} onChange={(v) => setFilter({ ...filter, priority: v })} placeholder="Type to search…" />
        </div>
        {isFiltered && (
          <button className="btn sm" onClick={() => setFilter({ project_id: '', company_id: '', function_id: '', department_id: '', responsible_id: '', priority: '' })}>
            Clear
          </button>
        )}
      </div>

      <div className="small muted" style={{ margin: '0 0 10px 2px' }}>{visibleTasks.length} tasks</div>

      <div style={{ overflowX: 'auto', paddingBottom: 10 }}>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(6, minmax(230px, 1fr))', gap: 14, alignItems: 'start', minWidth: 1450 }}>
          {COLUMNS.map((col) => {
            const colTasks = visibleTasks.filter((t) => t.status === col.key)
            return (
              <div key={col.key} style={{ background: '#eef1f5', borderRadius: 10, padding: 10, minWidth: 0 }}>
                <div className="spread" style={{ marginBottom: 8 }}>
                  <strong className="small">{col.label}</strong>
                  <span className="badge gray">{colTasks.length}</span>
                </div>
                {colTasks.map((t) => (
                  <div key={t.id} className="card" style={{ marginBottom: 8, padding: 10, cursor: 'pointer', minWidth: 0, wordBreak: 'break-word' }}
                    onClick={() => navigate(`/tasks/${t.id}`)}>
                    <div className="small" style={{ fontWeight: 600 }}>{t.title}</div>
                    <div className="muted" style={{ fontSize: 11 }}>{t.code} · {name(t.responsible_id) ?? '—'}</div>
                    <div className="muted" style={{ fontSize: 11 }}>{companyName(t.company_id) ?? '—'}{t.function_id ? ` · ${functionName(t.function_id)}` : ''}{t.department_id ? ` · ${departmentName(t.department_id)}` : ''}</div>
                    <div className="row" style={{ marginTop: 6, gap: 6 }}>
                      <span className={`badge ${PRIORITY_COLORS[t.priority]}`}>{label(t.priority)}</span>
                      <span className={`health-dot ${HEALTH_COLORS[t.health]}`} />
                    </div>
                    <div className="row" style={{ marginTop: 6, gap: 4, flexWrap: 'wrap' }}>
                      {COLUMNS.filter((c) => c.key !== col.key).map((c) => (
                        <button key={c.key} className="btn sm" style={{ fontSize: 10, padding: '2px 6px' }}
                          onClick={(e) => { e.stopPropagation(); move(t, c.key) }}
                          title={`Move to ${c.label}`}>
                          → {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {colTasks.length === 0 && <div className="empty small" style={{ padding: 16 }}>—</div>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
