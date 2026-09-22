import { useEffect, useState } from 'react'
import { api } from '../api'
import { Company, Department, Function, Project, RaciMatrix } from '../types'
import { label } from '../constants'
import SearchableSelect from '../components/SearchableSelect'

const RACI_COLORS: Record<string, string> = {
  R: 'var(--navy)', A: 'var(--gold)', C: 'var(--green)', I: 'var(--muted)',
}

export default function Raci() {
  const [projects, setProjects] = useState<Project[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [functions, setFunctions] = useState<Function[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [projectId, setProjectId] = useState<string>('')
  const [matrix, setMatrix] = useState<RaciMatrix | null>(null)
  const [filter, setFilter] = useState({ company_id: '', function_id: '', department_id: '' })

  useEffect(() => {
    api.get<Project[]>('/projects').then(setProjects)
    api.get<Company[]>('/organizations/companies').then(setCompanies)
    api.get<Function[]>('/organizations/functions').then(setFunctions)
    api.get<Department[]>('/organizations/departments').then(setDepartments)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams()
    if (filter.company_id) params.set('company_id', filter.company_id)
    if (filter.function_id) params.set('function_id', filter.function_id)
    if (filter.department_id) params.set('department_id', filter.department_id)
    const q = params.toString()
    const path = projectId ? `/raci/matrix/${projectId}` : '/raci/matrix'
    api.get<RaciMatrix>(`${path}${q ? '?' + q : ''}`).then(setMatrix)
  }, [projectId, filter])

  const projectItems = [{ value: '', label: 'All projects' }, ...projects.map((p) => ({ value: String(p.id), label: `${p.code} — ${p.name}` }))]
  const companyItems = [{ value: '', label: 'All SBUs' }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))]
  const functionItems = [{ value: '', label: 'All functions' }, ...functions.map((f) => ({ value: String(f.id), label: f.name }))]
  const departmentItems = [{ value: '', label: 'All departments' }, ...departments.map((d) => ({ value: String(d.id), label: d.name }))]

  const isFiltered = projectId || filter.company_id || filter.function_id || filter.department_id
  const projectName = (id?: number) => projects.find((p) => p.id === id)?.name

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>RACI Matrix</h1>
          <div className="crumb">Responsible · Accountable · Consulted · Informed</div>
        </div>
      </div>

      <div className="filters">
        <div className="field" style={{ minWidth: 220 }}>
          <label>Project</label>
          <SearchableSelect value={projectId} items={projectItems} onChange={(v) => setProjectId(v)} placeholder="All projects" />
        </div>
        <div className="field" style={{ minWidth: 180 }}>
          <label>SBU</label>
          <SearchableSelect value={filter.company_id} items={companyItems} onChange={(v) => setFilter({ ...filter, company_id: v })} placeholder="All SBUs" />
        </div>
        <div className="field" style={{ minWidth: 170 }}>
          <label>Function</label>
          <SearchableSelect value={filter.function_id} items={functionItems} onChange={(v) => setFilter({ ...filter, function_id: v })} placeholder="All functions" />
        </div>
        <div className="field" style={{ minWidth: 170 }}>
          <label>Department</label>
          <SearchableSelect value={filter.department_id} items={departmentItems} onChange={(v) => setFilter({ ...filter, department_id: v })} placeholder="All departments" />
        </div>
        {isFiltered && (
          <button className="btn sm" onClick={() => { setFilter({ company_id: '', function_id: '', department_id: '' }); setProjectId('') }}>
            Clear
          </button>
        )}
      </div>

      {matrix && (
        <>
          <div className="card mb">
            <div className="row" style={{ gap: 20 }}>
              {['R', 'A', 'C', 'I'].map((t) => (
                <div key={t} className="row">
                  <strong style={{ color: RACI_COLORS[t], fontSize: 18 }}>{t}</strong>
                  <span className="small muted">{['Responsible', 'Accountable', 'Consulted', 'Informed'][['R', 'A', 'C', 'I'].indexOf(t)]}</span>
                </div>
              ))}
            </div>
          </div>

          {matrix.gaps.length > 0 && (
            <div className="card mb" style={{ background: '#fdf3d7', borderColor: '#ecd9a0' }}>
              <strong className="small" style={{ color: 'var(--warn)' }}>RACI gaps detected:</strong>{' '}
              <span className="small">{matrix.gaps.length} task(s) missing Responsible or Accountable.</span>
            </div>
          )}

          <div className="small muted" style={{ margin: '0 0 10px 2px' }}>{matrix.tasks.length} tasks · {matrix.users.length} people</div>

          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ minWidth: 600 }}>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Project</th>
                  {matrix.users.map((u) => <th key={u.id}>{u.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((r) => (
                  <tr key={r.task_id}>
                    <td className="small"><strong>{r.code}</strong><div className="muted" style={{ fontSize: 11 }}>{r.title}</div></td>
                    <td className="small muted">{projectName(r.project_id) ?? '—'}</td>
                    {r.cells.map((c) => (
                      <td key={c.user_id} style={{ textAlign: 'center' }}>
                        {c.value ? (
                          c.value.split('').map((ch) => (
                            <span key={ch} style={{ fontWeight: 700, color: RACI_COLORS[ch] ?? 'var(--ink)', margin: '0 2px' }}>{ch}</span>
                          ))
                        ) : <span className="muted">·</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {matrix.rows.length === 0 && <div className="empty">No tasks match the current filters.</div>}
          </div>
        </>
      )}
    </div>
  )
}
