import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { store } from '../store'
import { Company, Milestone, Project, Task, User } from '../types'
import { HEALTH_COLORS, METHODOLOGIES, PROJECT_STATUSES, fmtDate, label } from '../constants'
import SearchableSelect from '../components/SearchableSelect'

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [selected, setSelected] = useState<Project | null>(null)
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [filter, setFilter] = useState({ company_id: '', status: '', health: '', type: '', manager_id: '', methodology: '' })
  const navigate = useNavigate()

  useEffect(() => {
    api.get<Project[]>('/projects').then(setProjects)
    api.get<Task[]>('/tasks').then(setTasks)
    api.get<User[]>('/organizations/users').then(setUsers)
    api.get<Company[]>('/organizations/companies').then(setCompanies)
  }, [])

  const open = (p: Project) => {
    setSelected(p)
    api.get<Milestone[]>(`/projects/${p.id}/milestones`).then(setMilestones)
  }

  const manager = (id?: number) => users.find((u) => u.id === id)?.name
  const projTasks = (id: number) => tasks.filter((t) => t.project_id === id)

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (filter.company_id && String(p.company_id) !== String(filter.company_id)) return false
      if (filter.status && p.status !== filter.status) return false
      if (filter.health && p.health !== filter.health) return false
      if (filter.type && p.project_type !== filter.type) return false
      if (filter.methodology && p.methodology !== filter.methodology) return false
      if (filter.manager_id && String(p.manager_id) !== String(filter.manager_id)) return false
      return true
    })
  }, [projects, filter])

  const isFiltered = filter.company_id || filter.status || filter.health || filter.type || filter.methodology || filter.manager_id

  const companyItems = [{ value: '', label: 'All companies' }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))]
  const statusItems = [{ value: '', label: 'All' }, ...PROJECT_STATUSES.map((s) => ({ value: s, label: label(s) }))]
  const healthItems = [{ value: '', label: 'All' }, ...Object.keys(HEALTH_COLORS).map((h) => ({ value: h, label: label(h) }))]
  const typeItems = [{ value: '', label: 'All' }, ...Array.from(new Set(projects.map((p) => p.project_type))).map((t) => ({ value: t, label: label(t) }))]
  const methodologyItems = [{ value: '', label: 'All' }, ...METHODOLOGIES.map((m) => ({ value: m, label: label(m) }))]
  const managerItems = [{ value: '', label: 'All' }, ...users.map((u) => ({ value: String(u.id), label: u.name }))]

  const companyName = (id?: number) => companies.find((c) => c.id === id)?.name ?? '—'

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Projects</h1>
          <div className="crumb">Project master with status &amp; health governance</div>
        </div>
      </div>

      <div className="filters">
        <div className="field" style={{ minWidth: 190 }}>
          <label>Company</label>
          <SearchableSelect value={filter.company_id} items={companyItems} onChange={(v) => setFilter({ ...filter, company_id: v })} placeholder="Type to search…" />
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
          <label>Manager</label>
          <SearchableSelect value={filter.manager_id} items={managerItems} onChange={(v) => setFilter({ ...filter, manager_id: v })} placeholder="Type to search…" />
        </div>
        {isFiltered && (
          <button className="btn sm" onClick={() => setFilter({ company_id: '', status: '', health: '', type: '', manager_id: '', methodology: '' })}>
            Clear
          </button>
        )}
      </div>

      <div className="small muted" style={{ margin: '0 0 10px 2px' }}>{filtered.length} of {projects.length} projects</div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Code</th><th>Project</th><th>Company</th><th>PM</th><th>Type</th><th>Status</th><th>Health</th>
              <th>Completion</th><th>Baseline</th><th>Forecast</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} onClick={() => open(p)} style={{ cursor: 'pointer' }}>
                <td className="muted small">{p.code}</td>
                <td><a onClick={(e) => e.stopPropagation()}>{p.name}</a></td>
                <td className="small">{companyName(p.company_id)}</td>
                <td className="small">{manager(p.manager_id)}</td>
                <td className="small">{label(p.project_type)}</td>
                <td><span className="badge gray">{label(p.status)}</span></td>
                <td><span className={`health-dot ${HEALTH_COLORS[p.health]}`} /> {label(p.health)}</td>
                <td style={{ minWidth: 100 }}>
                  <div className="progress"><span style={{ width: `${p.completion_pct}%` }} /></div>
                  <span className="small muted">{p.completion_pct}%</span>
                </td>
                <td className="small">{fmtDate(p.baseline_due_date)}</td>
                <td className="small">{fmtDate(p.forecast_due_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="empty">No projects match your filters.</div>}
      </div>

      {selected && (
        <div className="card mt">
          <div className="spread">
            <div>
              <h2 style={{ margin: 0, fontSize: 16, color: 'var(--navy)' }}>{selected.name}</h2>
              <div className="small muted">{selected.objective}</div>
            </div>
            <div className="row">
              <span className={`badge ${selected.health === 'green' ? 'green' : selected.health === 'amber' ? 'amber' : 'red'}`}>{label(selected.health)}</span>
            </div>
          </div>

          <div className="section-title">Milestones</div>
          <table>
            <thead><tr><th>Milestone</th><th>Due</th><th>Status</th><th>Completion</th></tr></thead>
            <tbody>
              {milestones.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td className="small">{fmtDate(m.due_date)}</td>
                  <td><span className="badge gray">{label(m.status)}</span></td>
                  <td className="small">{m.completion_pct}%</td>
                </tr>
              ))}
              {milestones.length === 0 && <tr><td colSpan={4} className="muted small">No milestones</td></tr>}
            </tbody>
          </table>

          <div className="section-title">Tasks ({projTasks(selected.id).length})</div>
          <table>
            <thead><tr><th>Code</th><th>Task</th><th>Status</th><th>Health</th><th>Due</th></tr></thead>
            <tbody>
              {projTasks(selected.id).map((t) => (
                <tr key={t.id} onClick={() => navigate(`/tasks/${t.id}`)} style={{ cursor: 'pointer' }}>
                  <td className="muted small">{t.code}</td>
                  <td>{t.title}</td>
                  <td><span className="badge gray">{label(t.status)}</span></td>
                  <td><span className={`health-dot ${HEALTH_COLORS[t.health]}`} /></td>
                  <td className="small">{fmtDate(t.approved_due_date || t.baseline_due_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
