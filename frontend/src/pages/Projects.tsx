import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { Company, Project, Task, User } from '../types'
import { HEALTH_COLORS, METHODOLOGIES, PROJECT_STATUSES, fmtDate, label } from '../constants'
import SearchableSelect from '../components/SearchableSelect'

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [filter, setFilter] = useState({ company_id: '', status: '', health: '', type: '', manager_id: '', methodology: '' })
  const navigate = useNavigate()

  useEffect(() => {
    api.get<Project[]>('/projects').then(setProjects)
    api.get<Task[]>('/tasks').then(setTasks)
    api.get<User[]>('/organizations/users').then(setUsers)
    api.get<Company[]>('/organizations/companies').then(setCompanies)
  }, [])

  const open = (p: Project) => navigate(`/projects/${p.id}`)

  const manager = (id?: number) => users.find((u) => u.id === id)?.name

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
                <td>
                  <Link
                    to={`/projects/${p.id}`}
                    style={{ color: 'var(--green)', fontWeight: 600, textDecoration: 'underline' }}
                  >
                    {p.name}
                  </Link>
                </td>
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
    </div>
  )
}