import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { BacklogItem, Company, Department, Function, Project } from '../types'
import { label } from '../constants'
import SearchableSelect from '../components/SearchableSelect'

interface Props {
  onConverted?: () => void
}

export default function Backlog({ onConverted }: Props) {
  const [items, setItems] = useState<BacklogItem[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [functions, setFunctions] = useState<Function[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [filter, setFilter] = useState({ project_id: '', company_id: '', function_id: '', department_id: '', status: '', priority: '' })
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<any>({ priority: 'medium', status: 'new', project_id: '', company_id: '', function_id: '', department_id: '' })
  const [err, setErr] = useState('')

  useEffect(() => {
    api.get<BacklogItem[]>('/backlogs').then(setItems)
    api.get<Project[]>('/projects').then(setProjects)
    api.get<Company[]>('/organizations/companies').then(setCompanies)
    api.get<Function[]>('/organizations/functions').then(setFunctions)
    api.get<Department[]>('/organizations/departments').then(setDepartments)
  }, [])

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const reload = () => api.get<BacklogItem[]>('/backlogs').then(setItems)

  const create = async () => {
    if (!form.requirement?.trim()) { setErr('Requirement is mandatory'); return }
    await api.post('/backlogs', {
      ...form,
      project_id: form.project_id ? Number(form.project_id) : null,
      company_id: form.company_id ? Number(form.company_id) : null,
      function_id: form.function_id ? Number(form.function_id) : null,
      department_id: form.department_id ? Number(form.department_id) : null,
      requested_by_id: form.requested_by_id ? Number(form.requested_by_id) : null,
      estimated_effort: form.estimated_effort ? Number(form.estimated_effort) : null,
    })
    setShowForm(false)
    setErr('')
    setForm({ priority: 'medium', status: 'new', project_id: '', company_id: '', function_id: '', department_id: '' })
    reload()
  }

  const convert = async (item: BacklogItem) => {
    await api.post('/tasks', {
      code: null,
      project_id: item.project_id,
      company_id: item.company_id,
      function_id: item.function_id,
      department_id: item.department_id,
      title: item.requirement,
      description: item.description,
      expected_deliverable: item.acceptance_criteria,
      category: 'project',
      task_type: 'task',
      priority: item.priority,
      status: 'backlog',
      acceptance_criteria: item.acceptance_criteria,
    })
    await api.patch(`/backlogs/${item.id}`, { ...item, status: 'converted' })
    reload()
    onConverted?.()
  }

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (filter.project_id && String(i.project_id) !== String(filter.project_id)) return false
      if (filter.company_id && String(i.company_id) !== String(filter.company_id)) return false
      if (filter.function_id && String(i.function_id) !== String(filter.function_id)) return false
      if (filter.department_id && String(i.department_id) !== String(filter.department_id)) return false
      if (filter.status && i.status !== filter.status) return false
      if (filter.priority && i.priority !== filter.priority) return false
      return true
    })
  }, [items, filter])

  const isFiltered = filter.project_id || filter.company_id || filter.function_id || filter.department_id || filter.status || filter.priority

  const projectItems = [{ value: '', label: 'All projects' }, ...projects.map((p) => ({ value: String(p.id), label: `${p.code} — ${p.name}` }))]
  const companyItems = [{ value: '', label: 'All SBUs' }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))]
  const functionItems = [{ value: '', label: 'All functions' }, ...functions.map((f) => ({ value: String(f.id), label: f.name }))]
  const departmentItems = [{ value: '', label: 'All departments' }, ...departments.map((d) => ({ value: String(d.id), label: d.name }))]
  const statusItems = [{ value: '', label: 'All' }, ...['new', 'review', 'grooming', 'prioritized', 'ready', 'planned', 'converted'].map((s) => ({ value: s, label: label(s) }))]
  const priorityItems = [{ value: '', label: 'All' }, ...['low', 'medium', 'high', 'critical'].map((p) => ({ value: p, label: label(p) }))]

  const companyName = (id?: number) => companies.find((c) => c.id === id)?.name
  const functionName = (id?: number) => functions.find((f) => f.id === id)?.name
  const departmentName = (id?: number) => departments.find((d) => d.id === id)?.name

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Backlog</h1>
          <div className="crumb">Requirements captured, groomed, prioritized — before becoming tasks</div>
        </div>
        <button className="btn primary" onClick={() => setShowForm(true)}>+ New Backlog Item</button>
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
        <div className="field" style={{ minWidth: 210 }}>
          <label>Project</label>
          <SearchableSelect value={filter.project_id} items={projectItems} onChange={(v) => setFilter({ ...filter, project_id: v })} placeholder="Type to search project…" />
        </div>
        <div className="field" style={{ minWidth: 150 }}>
          <label>Status</label>
          <SearchableSelect value={filter.status} items={statusItems} onChange={(v) => setFilter({ ...filter, status: v })} placeholder="Type to search…" />
        </div>
        <div className="field" style={{ minWidth: 140 }}>
          <label>Priority</label>
          <SearchableSelect value={filter.priority} items={priorityItems} onChange={(v) => setFilter({ ...filter, priority: v })} placeholder="Type to search…" />
        </div>
        {isFiltered && (
          <button className="btn sm" onClick={() => setFilter({ project_id: '', company_id: '', function_id: '', department_id: '', status: '', priority: '' })}>
            Clear
          </button>
        )}
      </div>

      <div className="small muted" style={{ margin: '0 0 10px 2px' }}>{filtered.length} of {items.length} items</div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr><th>Code</th><th>Requirement</th><th>SBU</th><th>Project</th><th>Priority</th><th>Status</th><th>Effort</th><th>Action</th></tr>
          </thead>
          <tbody>
            {filtered.map((i) => (
              <tr key={i.id}>
                <td className="muted small">{i.code}</td>
                <td>{i.requirement}</td>
                <td className="small">{companyName(i.company_id) ?? '—'}</td>
                <td className="small">{projects.find((p) => p.id === i.project_id)?.name ?? '—'}</td>
                <td><span className="badge gold">{label(i.priority)}</span></td>
                <td><span className="badge gray">{label(i.status)}</span></td>
                <td className="small">{i.estimated_effort ? `${i.estimated_effort}d` : '—'}</td>
                <td>
                  {i.status !== 'converted' ? (
                    <button className="btn sm" onClick={() => convert(i)}>Convert to Task</button>
                  ) : <span className="small muted">Done</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="empty">No backlog items match your filters.</div>}
      </div>

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>New Backlog Item</h2>
            {err && <div className="badge red" style={{ marginBottom: 12 }}>{err}</div>}
            <label>Requirement *</label>
            <input value={form.requirement} onChange={(e) => set('requirement', e.target.value)} />
            <label>Description</label>
            <textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
            <div className="form-row three">
              <div>
                <label>SBU</label>
                <SearchableSelect value={form.company_id} items={companyItems.slice(1)} onChange={(v) => set('company_id', v)} placeholder="Select SBU…" />
              </div>
              <div>
                <label>Function</label>
                <SearchableSelect value={form.function_id} items={functionItems.slice(1)} onChange={(v) => set('function_id', v)} placeholder="Select function…" />
              </div>
              <div>
                <label>Department</label>
                <SearchableSelect value={form.department_id} items={departmentItems.slice(1)} onChange={(v) => set('department_id', v)} placeholder="Select department…" />
              </div>
            </div>
            <div className="form-row three">
              <div>
                <label>Project</label>
                <SearchableSelect value={form.project_id} items={projectItems.slice(1)} onChange={(v) => set('project_id', v)} placeholder="Select project…" />
              </div>
              <div>
                <label>Priority</label>
                <select value={form.priority} onChange={(e) => set('priority', e.target.value)}>
                  {['low', 'medium', 'high', 'critical'].map((p) => <option key={p} value={p}>{label(p)}</option>)}
                </select>
              </div>
              <div>
                <label>Estimated Effort (days)</label>
                <input type="number" value={form.estimated_effort ?? ''} onChange={(e) => set('estimated_effort', e.target.value)} />
              </div>
            </div>
            <label>Acceptance Criteria</label>
            <textarea rows={2} value={form.acceptance_criteria} onChange={(e) => set('acceptance_criteria', e.target.value)} />
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn primary" onClick={create}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
