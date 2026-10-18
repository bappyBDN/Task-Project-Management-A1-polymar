import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { Company, Department, Function, Project, Task, User } from '../types'
import { HEALTH_COLORS, METHODOLOGIES, PROJECT_STATUSES, fmtDate, label } from '../constants'
import SearchableSelect from '../components/SearchableSelect'
import ProjectForm, { errText } from '../components/ProjectForm'
import { inAnySbu, inName, nameFilterItems, sbuFilterItems, sbuIdsOf, sbuNames } from '../org'
import { usePageState } from '../session'

// Project Responsible column: at most this many task-Responsible names, the rest behind "+N"
const MAX_RESPONSIBLE = 6
// one steady colour per person (by id), so the same name looks the same on every row
const PERSON_COLORS = 8

const NO_FILTER = { name: '', company_id: '', function_id: '', department_id: '', status: '', health: '', type: '', manager_id: '', methodology: '' }


export default function Projects() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'   // only admins get a Delete button (the API enforces this too)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [functions, setFunctions] = useState<Function[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [filter, setFilter] = usePageState('filter', NO_FILTER)
  // Project Responsible column: '' = the server's order, 'asc' = A → Z, 'desc' = Z → A (by the first name shown)
  const [respSort, setRespSort] = usePageState<'' | 'asc' | 'desc'>('respSort', '')
  const [showForm, setShowForm] = useState(false)
  const navigate = useNavigate()

  const reloadProjects = () => api.get<Project[]>('/projects').then(setProjects)

  useEffect(() => {
    reloadProjects()
    api.get<Task[]>('/tasks').then(setTasks)
    api.get<User[]>('/organizations/users').then(setUsers)
    api.get<Company[]>('/organizations/companies').then(setCompanies)
    api.get<Function[]>('/organizations/functions').then(setFunctions).catch(() => {})
    api.get<Department[]>('/organizations/departments').then(setDepartments).catch(() => {})
  }, [])

  const open = (p: Project) => navigate(`/projects/${p.id}`)

  // Admin-only here (the project's Manager deletes from the project page). DELETE /projects/{id}
  // permanently deletes the project's tasks, detaches risks/issues/backlog, then removes the project.
  const removeProject = async (p: Project) => {
    if (!isAdmin || deletingId !== null) return
    const n = tasks.filter((t) => t.project_id === p.id).length
    const warn = n > 0 ? `\n\nIts ${n} task${n === 1 ? '' : 's'} will be permanently deleted too.` : ''
    if (!confirm(`Delete project ${p.code} — "${p.name}"?${warn}\n\nThis cannot be undone.`)) return
    setDeletingId(p.id)
    try {
      await api.del(`/projects/${p.id}`)
      await Promise.all([reloadProjects(), api.get<Task[]>('/tasks').then(setTasks)])
    } catch (e: any) {
      alert(`Could not delete the project: ${errText(e)}`)
    } finally {
      setDeletingId(null)
    }
  }

  const manager = (id?: number) => users.find((u) => u.id === id)?.name
  const userName = (id?: number) => users.find((u) => u.id === id)?.name ?? '—'

  // Most projects were created without a Company / Manager; that information
  // lives on their tasks. So a project belongs to a company if the project OR
  // any of its tasks is in that company, and involves an employee if they are
  // its PM / Sponsor / Owner OR Responsible / Accountable / Reviewer / Informed on a task.
  const tasksByProject = useMemo(() => {
    const m = new Map<number, Task[]>()
    tasks.forEach((t) => { if (t.project_id) { const l = m.get(t.project_id) ?? []; l.push(t); m.set(t.project_id, l) } })
    return m
  }, [tasks])
  const projectCompanyIds = (p: Project) => {
    const s = new Set<number>()
    sbuIdsOf(p).forEach((id) => s.add(id))
    ;(tasksByProject.get(p.id) ?? []).forEach((t) => sbuIdsOf(t).forEach((id) => s.add(id)))
    return s
  }
  const projectPeopleIds = (p: Project) => {
    const s = new Set<number>()
    ;[p.manager_id, p.sponsor_id, p.owner_id].forEach((id) => { if (id) s.add(id) })
    ;(tasksByProject.get(p.id) ?? []).forEach((t) => [t.responsible_id, t.accountable_id, t.reviewer_id, t.informed_id].forEach((id) => { if (id) s.add(id) }))
    return s
  }

  /** Who is Responsible for the project's tasks, the one with the most tasks first.
   *  Low-priority tasks are left out: the column is about the work that matters. */
  const responsibleOf = (p: Project) => {
    const count = new Map<number, number>()
    ;(tasksByProject.get(p.id) ?? []).forEach((t) => {
      if (t.responsible_id && (t.priority ?? '').toLowerCase() !== 'low') count.set(t.responsible_id, (count.get(t.responsible_id) ?? 0) + 1)
    })
    return [...count.entries()]
      .map(([id, n]) => ({ id, n, name: users.find((u) => u.id === id)?.name ?? `User #${id}` }))
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
  }

  /** The project's tasks that match the Company / Employee filters. */
  const matchingTasks = (p: Project) => {
    const uid = filter.manager_id ? Number(filter.manager_id) : null
    const leadsProject = uid !== null && [p.manager_id, p.sponsor_id, p.owner_id].includes(uid)
    return (tasksByProject.get(p.id) ?? []).filter((t) => {
      if (filter.company_id && !inAnySbu(companies, sbuIdsOf(t).length ? sbuIdsOf(t) : sbuIdsOf(p), filter.company_id)) return false
      // a PM / Sponsor / Owner sees all the project's tasks; others only the ones they are on
      if (uid !== null && !leadsProject && ![t.responsible_id, t.accountable_id, t.reviewer_id, t.informed_id].includes(uid)) return false
      return true
    })
  }

  const filtered = useMemo(() => {
    const words = filter.name.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return projects.filter((p) => {
      if (words.length && !words.every((w) => `${p.code} ${p.name}`.toLowerCase().includes(w))) return false
      // the project's own function, or that of any of its tasks; a project has no department
      // of its own, so that one is always its tasks'
      if (filter.function_id && !inName(functions, p.function_id, filter.function_id)
        && !(tasksByProject.get(p.id) ?? []).some((t) => inName(functions, t.function_id, filter.function_id))) return false
      if (filter.department_id && !(tasksByProject.get(p.id) ?? []).some((t) => inName(departments, t.department_id, filter.department_id))) return false
      if (filter.company_id && !inAnySbu(companies, [...projectCompanyIds(p)], filter.company_id)) return false
      if (filter.status && p.status !== filter.status) return false
      if (filter.health && p.health !== filter.health) return false
      if (filter.type && p.project_type !== filter.type) return false
      if (filter.methodology && p.methodology !== filter.methodology) return false
      if (filter.manager_id && !projectPeopleIds(p).has(Number(filter.manager_id))) return false
      return true
    })
  }, [projects, filter, tasksByProject, companies, functions, departments])

  /** The first name in the project's Project Responsible cell: its PM, else the task-Responsible with
   *  the most tasks. Projects with nobody go last whichever way the column is sorted. */
  const responsibleKey = (p: Project) => (p.manager_id ? manager(p.manager_id) ?? `User #${p.manager_id}` : responsibleOf(p)[0]?.name ?? '')
  const rows = useMemo(() => {
    if (!respSort) return filtered
    const dir = respSort === 'asc' ? 1 : -1
    return [...filtered]
      .map((p) => ({ p, k: responsibleKey(p) }))
      .sort((a, b) => ((a.k === '') !== (b.k === '') ? (a.k === '' ? 1 : -1) : dir * a.k.localeCompare(b.k, undefined, { sensitivity: 'base' })))
      .map((r) => r.p)
  }, [filtered, respSort, users, tasksByProject])
  const cycleRespSort = () => setRespSort((s) => (s === '' ? 'asc' : s === 'asc' ? 'desc' : ''))

  const isFiltered = filter.name.trim() || filter.function_id || filter.department_id || filter.company_id || filter.status || filter.health || filter.type || filter.methodology || filter.manager_id
  const personOrCompany = Boolean(filter.company_id || filter.manager_id)
  const shownTasks = useMemo(
    () => (personOrCompany ? filtered.flatMap((p) => matchingTasks(p).map((t) => ({ t, p }))) : []),
    [filtered, personOrCompany, filter, tasksByProject, companies],
  )

  // Full option lists: every company, status, health colour, methodology and
  // employee. Any value found in the data but missing from the standard list is
  // added at the end, so every real value can still be selected.
  const fullList = (standard: readonly string[], vals: (string | undefined)[]) => {
    const extra = [...new Set(vals.filter(Boolean) as string[])].filter((v) => !standard.includes(v))
    return [...standard, ...extra]
  }
  const companyItems = sbuFilterItems(companies)
  const functionItems = nameFilterItems(functions, 'All')
  const departmentItems = nameFilterItems(departments, 'All')
  const statusItems = [{ value: '', label: 'All' }, ...fullList(PROJECT_STATUSES, projects.map((p) => p.status)).map((s) => ({ value: s, label: label(s) }))]
  const healthItems = [{ value: '', label: 'All' }, ...fullList(Object.keys(HEALTH_COLORS), projects.map((p) => p.health)).map((h) => ({ value: h, label: label(h) }))]
  const typeItems = [{ value: '', label: 'All' }, ...Array.from(new Set(projects.map((p) => p.project_type))).map((t) => ({ value: t, label: label(t) }))]
  const methodologyItems = [{ value: '', label: 'All' }, ...fullList(METHODOLOGIES, projects.map((p) => p.methodology)).map((m) => ({ value: m, label: label(m) }))]
  const managerItems = [{ value: '', label: 'All' }, ...users.map((u) => ({ value: String(u.id), label: u.name }))]

  // SBU column: the project's own SBUs. Only a project without any shows the SBUs of its tasks
  // (a task left on an SBU the project has since moved away from must not show here).
  const companyName = (p: Project) =>
    sbuNames(companies, sbuIdsOf(p).length ? sbuIdsOf(p) : [...projectCompanyIds(p)]) ?? '—'

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Projects</h1>
          <div className="crumb">Project master with status &amp; health governance</div>
        </div>
        <button className="btn primary" onClick={() => setShowForm(true)}>+ Add Project</button>
      </div>

      <div className="filters">
        <div className="field" style={{ minWidth: 220 }}>
          <label>Project Name</label>
          <input type="search" value={filter.name} onChange={(e) => setFilter({ ...filter, name: e.target.value })} placeholder="Search name or code…" />
        </div>
        <div className="field" style={{ minWidth: 190 }}>
          <label>SBU</label>
          <SearchableSelect value={filter.company_id} items={companyItems} onChange={(v) => setFilter({ ...filter, company_id: v })} placeholder="Search SBU…" />
        </div>
        <div className="field" style={{ minWidth: 180 }}>
          <label>Function</label>
          <SearchableSelect value={filter.function_id} items={functionItems} onChange={(v) => setFilter({ ...filter, function_id: v })} placeholder="Search function…" />
        </div>
        <div className="field" style={{ minWidth: 180 }}>
          <label>Department</label>
          <SearchableSelect value={filter.department_id} items={departmentItems} onChange={(v) => setFilter({ ...filter, department_id: v })} placeholder="Search department…" />
        </div>
        <div className="field" style={{ minWidth: 150 }}>
          <label>Status</label>
          <SearchableSelect value={filter.status} items={statusItems} onChange={(v) => setFilter({ ...filter, status: v })} placeholder="Type to search…" />
        </div>
        <div className="field" style={{ minWidth: 140 }}>
          <label>Health</label>
          <SearchableSelect value={filter.health} items={healthItems} onChange={(v) => setFilter({ ...filter, health: v })} placeholder="Type to search…" />
        </div>
        <div className="field" style={{ minWidth: 160 }}>
          <label>Type</label>
          <SearchableSelect value={filter.type} items={typeItems} onChange={(v) => setFilter({ ...filter, type: v })} placeholder="Type to search…" />
        </div>
        <div className="field" style={{ minWidth: 170 }}>
          <label>Methodology</label>
          <SearchableSelect value={filter.methodology} items={methodologyItems} onChange={(v) => setFilter({ ...filter, methodology: v })} placeholder="Type to search…" />
        </div>
        <div className="field" style={{ minWidth: 180 }}>
          <label>Employee</label>
          <SearchableSelect value={filter.manager_id} items={managerItems} onChange={(v) => setFilter({ ...filter, manager_id: v })} placeholder="Type to search…" />
        </div>
        {isFiltered && (
          <button className="btn sm" onClick={() => setFilter(NO_FILTER)}>
            Clear
          </button>
        )}
      </div>

      <div className="small muted" style={{ margin: '0 0 10px 2px' }}>
        {filtered.length} of {projects.length} projects{personOrCompany ? ` · ${shownTasks.length} matching task${shownTasks.length === 1 ? '' : 's'}` : ''}
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Code</th><th>Project</th><th>SBU</th><th className="srt" onClick={cycleRespSort} aria-sort={respSort ? (respSort === 'asc' ? 'ascending' : 'descending') : undefined}
                title={respSort === '' ? 'Click to sort A → Z' : respSort === 'asc' ? 'Sorted A → Z — click for Z → A' : 'Sorted Z → A — click to clear'}>
                Project Responsible{respSort === 'asc' ? ' ▲' : respSort === 'desc' ? ' ▼' : ''}
              </th><th>Tasks</th><th>Type</th><th>Status</th><th>Health</th>
              <th>Completion</th><th>Baseline</th><th>Forecast</th>{isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} onClick={() => open(p)} style={{ cursor: 'pointer' }}>
                <td className="muted small">{p.code}</td>
                <td>
                  <Link
                    to={`/projects/${p.id}`}
                    onClick={(e) => e.stopPropagation()}
                    style={{ color: 'var(--green)', fontWeight: 600, textDecoration: 'underline' }}
                  >
                    {p.name}
                  </Link>
                </td>
                <td className="small">{companyName(p)}</td>
                <td>
                  {(() => {
                    // one cell for everyone responsible: the Project Manager first, then the people
                    // Responsible for its tasks (a PM who also has tasks shows once, as the PM)
                    const all = responsibleOf(p)
                    const pm = p.manager_id ? { id: p.manager_id, name: manager(p.manager_id) ?? `User #${p.manager_id}`, n: all.find((r) => r.id === p.manager_id)?.n ?? 0 } : null
                    const others = all.filter((r) => r.id !== pm?.id)
                    if (!pm && !others.length) return <span className="small muted">—</span>
                    // the employee searched for is always among the names shown
                    const picked = others.find((r) => String(r.id) === filter.manager_id)
                    const first = others.slice(0, MAX_RESPONSIBLE)
                    const shown = picked && !first.includes(picked) ? [...first.slice(0, -1), picked] : first
                    const rest = others.filter((r) => !shown.includes(r))
                    const tasksOf = (n: number) => `Responsible for ${n} task${n === 1 ? '' : 's'}`
                    return (
                      <div className="resp-chips">
                        {pm && (
                          <span className={`resp-chip pm${String(pm.id) === filter.manager_id ? ' on' : ''}`}
                            title={`${pm.name} — Project Manager${pm.n ? `, ${tasksOf(pm.n)}` : ''}`}>
                            <i>PM</i><span>{pm.name}</span>{pm.n > 1 && <b>{pm.n}</b>}
                          </span>
                        )}
                        {shown.map((r) => (
                          <span key={r.id} className={`resp-chip c${r.id % PERSON_COLORS}${r === picked ? ' on' : ''}`} title={`${r.name} — ${tasksOf(r.n)}`}>
                            <span>{r.name}</span>{r.n > 1 && <b>{r.n}</b>}
                          </span>
                        ))}
                        {rest.length > 0 && (
                          <span className="resp-chip more" title={rest.map((r) => `${r.name} (${r.n})`).join(', ')}>+{rest.length}</span>
                        )}
                      </div>
                    )
                  })()}
                </td>
                <td className="small">
                  {personOrCompany
                    ? `${matchingTasks(p).length} of ${(tasksByProject.get(p.id) ?? []).length}`
                    : (tasksByProject.get(p.id) ?? []).length}
                </td>
                <td className="small">{label(p.project_type)}</td>
                <td><span className="badge gray">{label(p.status)}</span></td>
                <td><span className={`health-dot ${HEALTH_COLORS[p.health]}`} /> {label(p.health)}</td>
                <td style={{ minWidth: 100 }}>
                  <div className="progress"><span style={{ width: `${p.completion_pct}%` }} /></div>
                  <span className="small muted">{p.completion_pct}%</span>
                </td>
                <td className="small">{fmtDate(p.baseline_due_date)}</td>
                <td className="small">{fmtDate(p.forecast_due_date)}</td>
                {isAdmin && (
                  <td>
                    <button
                      className="btn sm danger"
                      disabled={deletingId !== null}
                      onClick={(e) => { e.stopPropagation(); removeProject(p) }}
                    >
                      {deletingId === p.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="empty">No projects match your filters.</div>}
      </div>

      {/* The tasks behind the Company / Employee filter */}
      {personOrCompany && shownTasks.length > 0 && (
        <>
          <div className="section-title">
            Matching Tasks ({shownTasks.length})
            <span className="small muted" style={{ fontWeight: 400, marginLeft: 8 }}>
              {[filter.company_id && companyItems.find((c) => c.value === filter.company_id)?.label,
                filter.manager_id && users.find((u) => String(u.id) === filter.manager_id)?.name].filter(Boolean).join(' · ')}
            </span>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr><th>Code</th><th>Task</th><th>Project</th><th>Responsible</th><th>Accountable</th><th>Reviewer</th><th>Informed</th><th>Status</th><th>Progress</th><th>Due</th></tr>
              </thead>
              <tbody>
                {shownTasks.map(({ t, p }) => (
                  <tr key={t.id} onClick={() => navigate(`/tasks/${t.id}`)} style={{ cursor: 'pointer' }}>
                    <td className="muted small">{t.code}</td>
                    <td><Link to={`/tasks/${t.id}`} onClick={(e) => e.stopPropagation()}>{t.title}</Link></td>
                    <td className="small">{p.name}</td>
                    <td className="small">{userName(t.responsible_id)}</td>
                    <td className="small">{userName(t.accountable_id)}</td>
                    <td className="small">{userName(t.reviewer_id)}</td>
                    <td className="small">{userName(t.informed_id)}</td>
                    <td><span className="badge gray">{label(t.status)}</span></td>
                    <td style={{ minWidth: 90 }}>
                      <div className="progress"><span style={{ width: `${t.progress_pct}%` }} /></div>
                      <span className="small muted">{t.progress_pct}%</span>
                    </td>
                    <td className="small">{fmtDate(t.approved_due_date || t.baseline_due_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showForm && (
        <ProjectForm
          companies={companies}
          users={users}
          types={Array.from(new Set(projects.map((p) => p.project_type)))}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); reloadProjects(); api.get<Task[]>('/tasks').then(setTasks).catch(() => {}) }}
          withTasks
        />
      )}
    </div>
  )
}