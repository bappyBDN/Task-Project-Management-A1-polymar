import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { useIsPrivileged } from '../usePrivileged'
import { Company, Department, Function, Project, Task, User } from '../types'
import { HEALTH_COLORS, PRIORITY_COLORS, STATUS_COLORS, label } from '../constants'
import SearchableSelect from '../components/SearchableSelect'
import { inName, inSbu, nameFilterItems, overseesSbu, sbuFilterItems, sbuName } from '../org'

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

  const canSeeAll = useIsPrivileged(user?.role)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [movingId, setMovingId] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)

  const reload = () =>
    api.get<Task[]>('/tasks')
      .then((t) => { setTasks(t); setErr('') })
      .catch((e) => setErr(`Could not load tasks: ${e.message || e}`))
      .finally(() => setLoading(false))

  useEffect(() => {
    reload()
    api.get<Project[]>('/projects').then(setProjects).catch(() => {})
    api.get<User[]>('/organizations/users').then(setUsers).catch(() => {})
    api.get<Company[]>('/organizations/companies').then(setCompanies).catch(() => {})
    api.get<Function[]>('/organizations/functions').then(setFunctions).catch(() => {})
    api.get<Department[]>('/organizations/departments').then(setDepartments).catch(() => {})
  }, [])

  const name = (id?: number) => users.find((u) => u.id === id)?.name
  const companyName = (id?: number) => sbuName(companies, id)
  const functionName = (id?: number) => functions.find((f) => f.id === id)?.name
  const departmentName = (id?: number) => departments.find((d) => d.id === id)?.name

  const visibleTasks = useMemo(() => {
    let list = tasks // the server already returns only the tasks this user may see
    if (filter.project_id) list = list.filter((t) => String(t.project_id) === String(filter.project_id))
    if (filter.company_id) list = list.filter((t) => inSbu(companies, t.company_id, filter.company_id))
    if (filter.function_id) list = list.filter((t) => inName(functions, t.function_id, filter.function_id))
    if (filter.department_id) list = list.filter((t) => inName(departments, t.department_id, filter.department_id))
    if (filter.responsible_id) list = list.filter((t) => String(t.responsible_id) === String(filter.responsible_id))
    if (filter.priority) list = list.filter((t) => t.priority === filter.priority)
    return list
  }, [tasks, filter, companies, functions, departments])

  // Responsible / Accountable move their own cards; only admin / PMO can drop into Completed
  // (everyone else finishes a task with "Submit for Completion" on the task page).
  // A COO manages the tasks of the SBUs they oversee like an admin / PMO.
  const manages = (t: Task) => canSeeAll
    || overseesSbu(user, companies, t.company_id ?? projects.find((p) => p.id === t.project_id)?.company_id)
  const canMove = (t: Task) => manages(t) || t.responsible_id === user?.id || t.accountable_id === user?.id
  const canMoveTo = (t: Task, status: string) => canMove(t) && (manages(t) || status !== 'completed')

  const move = async (task: Task, status: string) => {
    if (!status || status === task.status || movingId !== null) return
    if (!canMoveTo(task, status)) {
      setErr(status === 'completed' && canMove(task)
        ? `To complete ${task.code}, open it and use "Submit for Completion".`
        : `Only the Responsible or Accountable person (or an admin / PMO) can move ${task.code}.`)
      return
    }
    setMovingId(task.id)
    setErr('')
    try {
      await api.patch(`/tasks/${task.id}`, { ...task, status })
      await reload()
    } catch (e: any) {
      setErr(`Could not move ${task.code}: ${e.message || e}`)
    } finally {
      setMovingId(null)
    }
  }

  const isFiltered = filter.project_id || filter.company_id || filter.function_id || filter.department_id || filter.responsible_id || filter.priority

  const projectItems = [{ value: '', label: 'All projects' }, ...projects.map((p) => ({ value: String(p.id), label: `${p.code} — ${p.name}` }))]
  const companyItems = sbuFilterItems(companies)
  const functionItems = nameFilterItems(functions, 'All functions')
  const departmentItems = nameFilterItems(departments, 'All departments')
  const userItems = [{ value: '', label: 'All' }, ...users.map((u) => ({ value: String(u.id), label: u.name }))]
  const priorityItems = [{ value: '', label: 'All' }, ...Object.keys(PRIORITY_COLORS).map((p) => ({ value: p, label: label(p) }))]

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Kanban Board</h1>
          <div className="crumb">Drag a card to another column, or use "Move to…" on the card</div>
          {!canSeeAll && user && <div className="small muted" style={{ marginTop: 4 }}>Showing your tasks and projects only</div>}
        </div>
      </div>

      <div className="filters">
        <div className="field" style={{ minWidth: 190 }}>
          <label>SBU</label>
          <SearchableSelect value={filter.company_id} items={companyItems} onChange={(v) => setFilter({ ...filter, company_id: v })} placeholder="Search SBU…" />
        </div>
        <div className="field" style={{ minWidth: 170 }}>
          <label>Function</label>
          <SearchableSelect value={filter.function_id} items={functionItems} onChange={(v) => setFilter({ ...filter, function_id: v })} placeholder="Search function…" />
        </div>
        <div className="field" style={{ minWidth: 170 }}>
          <label>Department</label>
          <SearchableSelect value={filter.department_id} items={departmentItems} onChange={(v) => setFilter({ ...filter, department_id: v })} placeholder="Search department…" />
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

      {err && <div className="alert error" role="alert">{err}</div>}

      <div className="small muted" style={{ margin: '0 0 10px 2px' }}>{loading ? 'Loading tasks…' : `${visibleTasks.length} tasks`}</div>

      <div style={{ overflowX: 'auto', paddingBottom: 10 }}>
        <div className="grid kanban-board" style={{ gap: 14, alignItems: 'start' }}>
          {COLUMNS.map((col) => {
            const colTasks = visibleTasks.filter((t) => t.status === col.key)
            return (
              <div
                key={col.key}
                style={{ background: dragOver === col.key ? '#dde5f0' : '#eef1f5', borderRadius: 10, padding: 10, minWidth: 0, minHeight: 120, transition: 'background .15s' }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(col.key) }}
                onDragLeave={() => setDragOver((k) => (k === col.key ? null : k))}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(null)
                  const t = tasks.find((x) => String(x.id) === e.dataTransfer.getData('text/plain'))
                  if (t) move(t, col.key)
                }}
              >
                <div className="spread" style={{ marginBottom: 8 }}>
                  <strong className="small">{col.label}</strong>
                  <span className="badge gray">{colTasks.length}</span>
                </div>
                {colTasks.map((t) => (
                  <div key={t.id} className="card" style={{ marginBottom: 8, padding: 10, cursor: 'grab', minWidth: 0, wordBreak: 'break-word', opacity: movingId === t.id ? 0.5 : 1 }}
                    draggable={movingId === null && canMove(t)}
                    onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(t.id)); e.dataTransfer.effectAllowed = 'move' }}
                    onClick={() => navigate(`/tasks/${t.id}`)}>
                    <div className="small" style={{ fontWeight: 600 }}>{t.title}</div>
                    <div className="muted" style={{ fontSize: 11 }}>{t.code} · {name(t.responsible_id) ?? '—'}</div>
                    <div className="muted" style={{ fontSize: 11 }}>{companyName(t.company_id) ?? '—'}{t.function_id ? ` · ${functionName(t.function_id)}` : ''}{t.department_id ? ` · ${departmentName(t.department_id)}` : ''}</div>
                    <div className="row" style={{ marginTop: 6, gap: 6 }}>
                      <span className={`badge ${PRIORITY_COLORS[t.priority]}`}>{label(t.priority)}</span>
                      <span className={`health-dot ${HEALTH_COLORS[t.health]}`} />
                    </div>
                    {canMove(t) && <select
                      aria-label={`Move ${t.code} to another column`}
                      value=""
                      disabled={movingId !== null}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => move(t, e.target.value)}
                      style={{ marginTop: 8, padding: '4px 8px', fontSize: 12 }}
                    >
                      <option value="">{movingId === t.id ? 'Moving…' : 'Move to…'}</option>
                      {COLUMNS.filter((c) => c.key !== col.key && canMoveTo(t, c.key)).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>}
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
