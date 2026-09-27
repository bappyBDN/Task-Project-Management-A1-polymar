import { useState } from 'react'
import { api } from '../api'
import { Company, Project, User } from '../types'
import { METHODOLOGIES, PROJECT_STATUSES, label } from '../constants'
import SearchableSelect from './SearchableSelect'

/**
 * "New Project" form, shared by the Projects page (+ Add Project) and the Task
 * form (+ new project), so both always ask for the same fields.
 * Required: Project Name, Company (SBU), Start Date, Due Date. The rest is optional.
 */

const PRIORITIES = ['low', 'medium', 'high', 'critical']
// Common project types offered by default; any new type can be typed in.
const DEFAULT_TYPES = ['operational', 'strategic', 'improvement', 'compliance']
const TYPE_MAX_LEN = 32 // projects.project_type is VARCHAR(32)

const EMPTY_FORM = {
  name: '', company_id: '', manager_id: '', project_type: 'operational', methodology: 'hybrid',
  status: 'planning', priority: 'medium', start_date: '', baseline_due_date: '', objective: '',
}

// Only these are mandatory; everything else is optional.
const REQUIRED: { key: keyof typeof EMPTY_FORM; label: string }[] = [
  { key: 'name', label: 'Project Name' },
  { key: 'company_id', label: 'Company (SBU)' },
  { key: 'start_date', label: 'Start Date' },
  { key: 'baseline_due_date', label: 'Due Date' },
]

// FastAPI sends {"detail": "..."} or a list of validation errors - show it as a readable sentence.
export function errText(e: any): string {
  const raw = e?.message ?? String(e)
  try {
    const d = JSON.parse(raw)?.detail
    if (typeof d === 'string') return d
    if (Array.isArray(d)) return d.map((x: any) => `${(x.loc || []).slice(1).join('.')}: ${x.msg}`).join('; ')
  } catch { /* not JSON */ }
  return raw || 'Could not create the project'
}

/** "Capital Project" -> "capital_project", the same style as the built-in values. */
const toKey = (v: string) => v.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')

export default function ProjectForm({ companies, users, types, onClose, onSaved }: {
  companies: Company[]
  users: User[]
  types: string[] // project types already used by existing projects
  onClose: () => void
  onSaved: (p: Project) => void
}) {
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [newTypes, setNewTypes] = useState<string[]>([])
  const set = (k: keyof typeof EMPTY_FORM, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const typeList = Array.from(new Set([...DEFAULT_TYPES, ...types.filter(Boolean), ...newTypes]))

  // Picking an existing type, or typing a new one (it is saved on the project).
  const onTypeChange = (v: string) => {
    if (!v) { set('project_type', ''); return }
    const key = typeList.includes(v) ? v : toKey(v)
    if (!key) return
    if (key.length > TYPE_MAX_LEN) { setError(`Type can be at most ${TYPE_MAX_LEN} characters`); return }
    if (!typeList.includes(key)) setNewTypes((t) => [...t, key])
    set('project_type', key)
  }

  const submit = async () => {
    const missing = REQUIRED.filter(({ key }) => !String(form[key] ?? '').trim())
    if (missing.length) { setError(`Please fill in: ${missing.map((m) => m.label).join(', ')}`); return }
    if (form.start_date > form.baseline_due_date) { setError('Start date cannot be after the due date'); return }
    setSaving(true)
    setError('')
    try {
      const p = await api.post<Project>('/projects', {
        code: null,
        name: form.name.trim(),
        company_id: Number(form.company_id),
        manager_id: form.manager_id ? Number(form.manager_id) : null,
        // optional, but these columns can't be empty in the database - fall back to the defaults
        project_type: form.project_type || 'operational',
        methodology: form.methodology || 'hybrid',
        status: form.status || 'planning',
        priority: form.priority || 'medium',
        objective: form.objective.trim() || null,
        start_date: form.start_date,
        baseline_due_date: form.baseline_due_date,
        approved_due_date: form.baseline_due_date,
      })
      onSaved(p)
    } catch (e: any) {
      setError(errText(e))
    } finally {
      setSaving(false)
    }
  }

  const opts = (list: readonly string[]) => list.map((v) => ({ value: v, label: label(v) }))
  // stopPropagation: when this opens on top of the Task form, closing it must not close the Task form too
  const close = (e?: { stopPropagation: () => void }) => { e?.stopPropagation(); onClose() }

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New Project</h2>
        {error && <div className="badge red" style={{ marginBottom: 12 }}>{error}</div>}

        <label>Project Name *</label>
        <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Kiln 2 Vibration Monitoring" autoFocus />
        <div className="small muted" style={{ marginTop: 6 }}>Project code is generated automatically.</div>

        <div className="form-row">
          <div>
            <label>Company (SBU) *</label>
            <SearchableSelect value={form.company_id} items={companies.map((c) => ({ value: String(c.id), label: c.name }))} onChange={(v) => set('company_id', v)} placeholder="Search company…" />
          </div>
          <div>
            <label>Project Manager</label>
            <SearchableSelect value={form.manager_id} items={users.map((u) => ({ value: String(u.id), label: u.name }))} onChange={(v) => set('manager_id', v)} placeholder="Search person…" />
          </div>
        </div>

        <div className="form-row three">
          <div>
            <label>Type</label>
            <SearchableSelect value={form.project_type} items={opts(typeList)} onChange={onTypeChange} placeholder="Select or type a new type…" allowCustom />
          </div>
          <div>
            <label>Methodology</label>
            <SearchableSelect value={form.methodology} items={opts(METHODOLOGIES)} onChange={(v) => set('methodology', v)} placeholder="Methodology…" />
          </div>
          <div>
            <label>Priority</label>
            <SearchableSelect value={form.priority} items={opts(PRIORITIES)} onChange={(v) => set('priority', v)} placeholder="Priority…" />
          </div>
        </div>

        <div className="form-row three">
          <div>
            <label>Status</label>
            <SearchableSelect value={form.status} items={opts(PROJECT_STATUSES)} onChange={(v) => set('status', v)} placeholder="Status…" />
          </div>
          <div>
            <label>Start Date *</label>
            <input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
          </div>
          <div>
            <label>Due Date *</label>
            <input type="date" value={form.baseline_due_date} min={form.start_date || undefined} onChange={(e) => set('baseline_due_date', e.target.value)} />
          </div>
        </div>

        <label>Objective</label>
        <textarea rows={3} value={form.objective} onChange={(e) => set('objective', e.target.value)} placeholder="What should this project achieve?" />

        <div className="modal-actions">
          <button className="btn" onClick={() => close()}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Create Project'}</button>
        </div>
      </div>
    </div>
  )
}