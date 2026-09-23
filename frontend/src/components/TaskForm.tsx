import { useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { Company, Department, Function, Project, Task, User } from '../types'
import { label } from '../constants'
import SearchableSelect from './SearchableSelect'

interface Props {
  projects: Project[]
  users: User[]
  companies?: Company[]
  functions?: Function[]
  departments?: Department[]
  onClose: () => void
  onSaved: () => void
  onRefresh?: () => void
  task?: Task
}

const EMPTY = {
  code: '',
  title: '',
  description: '',
  expected_deliverable: '',
  category: '',
  task_type: '',
  priority: 'medium',
  project_id: '',
  company_id: '',
  function_id: '',
  department_id: '',
  responsible_id: '',
  accountable_id: '',
  reviewer_id: '',
  planned_start_date: '',
  baseline_due_date: '',
  status: '',
  progress_pct: 0,
  blocker: false,
}

const DEFAULT_PRIORITIES = ['low', 'medium', 'high', 'critical']

// Turn whatever the API threw into a readable sentence (FastAPI sends {"detail": "..."} or,
// for validation errors, {"detail": [{loc, msg}, ...]}).
function errText(e: any): string {
  const raw = e?.message ?? String(e)
  try {
    const j = JSON.parse(raw)
    const d = j?.detail ?? j
    if (typeof d === 'string') return d
    if (Array.isArray(d)) return d.map((x: any) => `${(x.loc || []).slice(1).join('.')}: ${x.msg}`).join('; ')
  } catch { /* not JSON */ }
  return raw || 'Could not save the task'
}

// null -> '' so <input>/<textarea> stay controlled when editing an existing task
const initialForm = (task?: Task) =>
  task
    ? Object.fromEntries(Object.entries({ ...EMPTY, ...task }).map(([k, v]) => [k, v ?? '']))
    : { ...EMPTY }

export default function TaskForm({ projects, users, companies = [], functions = [], departments = [], onClose, onSaved, onRefresh, task }: Props) {
  const { user } = useAuth()
  const [form, setForm] = useState<any>(() => initialForm(task))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // inline create modals
  const [showProjectModal, setShowProjectModal] = useState(false)
  const [showUserModal, setShowUserModal] = useState(false)
  const [showOrgModal, setShowOrgModal] = useState<'company' | 'function' | 'department' | null>(null)

  // dynamic list options
  const [categories, setCategories] = useState<string[]>([])
  const [taskTypes, setTaskTypes] = useState<string[]>([])
  const [priorities, setPriorities] = useState<string[]>(DEFAULT_PRIORITIES)
  const [statuses, setStatuses] = useState<string[]>([])

  const loadOptions = () => {
    api.get<string[]>('/list-options?kind=category').then(setCategories).catch(() => {})
    api.get<string[]>('/list-options?kind=task_type').then(setTaskTypes).catch(() => {})
    api.get<string[]>('/list-options?kind=priority').then((p) => setPriorities(p.length ? p : DEFAULT_PRIORITIES)).catch(() => {})
    api.get<string[]>('/list-options?kind=status').then(setStatuses).catch(() => {})
  }

  useEffect(loadOptions, [])

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))
  const str = (v: any) => (v === null || v === undefined ? '' : String(v))

  // --- Hierarchy-aware RACI defaulting ---------------------------------
  // Picking Responsible auto-fills Accountable with that person's immediate
  // senior (User.reports_to_id) — the normal RACI rule: the manager is
  // accountable for what their report does. Admins can still freely
  // override the suggestion; this only ever pre-fills an EMPTY field, it
  // never forces or locks the value.
  const managerIdOf = (userId: string) => {
    const u = users.find((x) => String(x.id) === userId)
    return u?.reports_to_id != null ? String(u.reports_to_id) : ''
  }

  const onResponsibleChange = (v: string) => {
    set('responsible_id', v)
    if (!form.accountable_id) {
      const managerId = managerIdOf(v)
      if (managerId) set('accountable_id', managerId)
      // If the person has no manager on file (e.g. the CEO, or hierarchy
      // not set up yet), Accountable is left for the admin to pick manually.
    }
  }

  const addOption = async (kind: string, value: string) => {
    await api.post(`/list-options?kind=${kind}&value=${encodeURIComponent(value)}`)
    loadOptions()
  }

  const removeOption = async (kind: string, value: string) => {
    if (!confirm(`Remove "${label(value)}" from this list?`)) return
    await api.del(`/list-options?kind=${kind}&value=${encodeURIComponent(value)}`)
    loadOptions()
  }

  // Persist a free-text value into the list if it's not already present.
  const customAdd = (kind: string, list: string[], value: string) => {
    const v = value.trim()
    if (!v) return
    set(kindMap[kind] ?? kind, v)
    if (!list.includes(v)) addOption(kind, v)
  }

  const kindMap: Record<string, string> = {
    category: 'category',
    task_type: 'task_type',
    priority: 'priority',
    status: 'status',
  }

  // Every field in this form is mandatory. This lists them with a friendly
  // label and where to find the value on `form`, so submit() can check them
  // all in one pass and tell the user exactly what's missing — instead of
  // stopping at the first empty field one at a time.
  const REQUIRED_FIELDS: { key: string; label: string }[] = [
    { key: 'title', label: 'Task Title' },
    { key: 'project_id', label: 'Project' },
    { key: 'category', label: 'Category' },
    { key: 'company_id', label: 'SBU (Company)' },
    { key: 'function_id', label: 'Function' },
    { key: 'department_id', label: 'Department' },
    { key: 'task_type', label: 'Task Type' },
    { key: 'priority', label: 'Priority' },
    { key: 'status', label: 'Status' },
    { key: 'description', label: 'Description' },
    { key: 'expected_deliverable', label: 'Expected Deliverable' },
    { key: 'responsible_id', label: 'Responsible (R)' },
    { key: 'accountable_id', label: 'Accountable (A)' },
    { key: 'reviewer_id', label: 'Reviewer' },
    { key: 'planned_start_date', label: 'Planned Start' },
    { key: 'baseline_due_date', label: 'Baseline Due Date' },
  ]

  const submit = async () => {
    const missing = REQUIRED_FIELDS.filter(({ key }) => {
      const v = form[key]
      return v === null || v === undefined || String(v).trim() === ''
    })
    if (missing.length) {
      setError(`Please fill in: ${missing.map((m) => m.label).join(', ')}`)
      return
    }
    if (form.planned_start_date && form.planned_start_date > form.baseline_due_date) {
      setError('Planned start cannot be after the baseline due date'); return
    }
    const progress = Math.max(0, Math.min(100, Number(form.progress_pct) || 0))
    const status = form.status || 'backlog'
    // Keep an approved (revised) due date when editing; only follow the baseline if they were the same.
    const t: any = task // `types.ts` may not declare approved_due_date
    const keepApproved = t?.approved_due_date && t.approved_due_date !== t.baseline_due_date
    setSaving(true)
    setError('')
    const payload: any = {
      code: form.code || null,
      title: form.title.trim(),
      description: form.description,
      expected_deliverable: form.expected_deliverable,
      category: form.category || 'operational',
      task_type: form.task_type || 'task',
      priority: form.priority || 'medium',
      project_id: form.project_id ? Number(form.project_id) : null,
      company_id: form.company_id ? Number(form.company_id) : null,
      function_id: form.function_id ? Number(form.function_id) : null,
      department_id: form.department_id ? Number(form.department_id) : null,
      responsible_id: form.responsible_id ? Number(form.responsible_id) : null,
      accountable_id: form.accountable_id ? Number(form.accountable_id) : null,
      reviewer_id: form.reviewer_id ? Number(form.reviewer_id) : null,
      planned_start_date: form.planned_start_date || null,
      baseline_due_date: form.baseline_due_date || null,
      approved_due_date: keepApproved ? t.approved_due_date : form.baseline_due_date,
      progress_pct: status === 'completed' || status === 'closed' ? 100 : progress,
      status,
      blocker: form.blocker ?? false,
      blocker_details: form.blocker_details,
      acceptance_criteria: form.acceptance_criteria,
    }
    try {
      if (task) await api.patch(`/tasks/${task.id}`, payload)
      else await api.post('/tasks', payload)
      onSaved()
    } catch (e: any) {
      setError(errText(e))
    } finally {
      setSaving(false)
    }
  }

  const projectItems = projects.map((p) => ({ value: String(p.id), label: `${p.code} — ${p.name}` }))
  const userItems = users.map((u) => ({ value: String(u.id), label: u.name }))
  const companyItems = companies.map((c) => ({ value: String(c.id), label: c.name }))
  const functionItems = functions.map((f) => ({ value: String(f.id), label: f.name }))
  const departmentItems = departments.map((dp) => ({ value: String(dp.id), label: dp.name }))

  const createdProject = async (p: Project) => {
    set('project_id', String(p.id))
    setShowProjectModal(false)
    onRefresh?.() // refresh parent lists WITHOUT closing the task form
  }
  const createdUser = async (u: User) => {
    set('responsible_id', String(u.id))
    if (!form.accountable_id) {
      const managerId = u.reports_to_id != null ? String(u.reports_to_id) : ''
      if (managerId) set('accountable_id', managerId)
    }
    setShowUserModal(false)
    onRefresh?.() // refresh parent lists WITHOUT closing the task form
  }

  const removeProject = async (value: string) => {
    if (!confirm(`Delete this project? Its tasks will be hidden.`)) return
    await api.del(`/projects/${value}`)
    if (str(form.project_id) === value) set('project_id', '')
    onRefresh?.()
  }

  const removeUser = async (value: string) => {
    if (!confirm('Permanently delete this user?')) return
    await api.del(`/organizations/users/${value}/permanent`)
    if (str(form.responsible_id) === value) set('responsible_id', '')
    if (str(form.accountable_id) === value) set('accountable_id', '')
    if (str(form.reviewer_id) === value) set('reviewer_id', '')
    onRefresh?.()
  }

  const removeCompany = async (value: string) => {
    if (!confirm('Remove this SBU?')) return
    await api.del(`/organizations/companies/${value}`)
    if (str(form.company_id) === value) set('company_id', '')
    onRefresh?.()
  }
  const removeFunction = async (value: string) => {
    if (!confirm('Remove this function?')) return
    await api.del(`/organizations/functions/${value}`)
    if (str(form.function_id) === value) set('function_id', '')
    onRefresh?.()
  }
  const removeDepartment = async (value: string) => {
    if (!confirm('Remove this department?')) return
    await api.del(`/organizations/departments/${value}`)
    if (str(form.department_id) === value) set('department_id', '')
    onRefresh?.()
  }

  const createdOrg = (kind: 'company' | 'function' | 'department', obj: any) => {
    if (kind === 'company') set('company_id', String(obj.id))
    if (kind === 'function') set('function_id', String(obj.id))
    if (kind === 'department') set('department_id', String(obj.id))
    setShowOrgModal(null)
    onRefresh?.()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{task ? `Edit ${task.code}` : 'New Task'}</h2>
        {error && <div className="badge red" style={{ marginBottom: 12 }}>{error}</div>}

        <label>Task Title *</label>
        <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Install vibration sensors on Kiln 2" />

        <div className="form-row">
          <div>
            <label>Project *</label>
            <SearchableSelect
              value={str(form.project_id)}
              items={projectItems}
              onChange={(v) => set('project_id', v)}
              placeholder="Search project…"
              onAddNew={() => setShowProjectModal(true)}
              addLabel="new project"
              onRemove={user?.role === 'admin' ? (v) => removeProject(v) : undefined}
            />
          </div>
          <div>
            <label>Category *</label>
            <SearchableSelect
              value={str(form.category)}
              items={categories.map((c) => ({ value: c, label: label(c) }))}
              onChange={(v) => customAdd('category', categories, v)}
              placeholder="Select or type…"
              allowCustom
              onRemove={(v) => removeOption('category', v)}
            />
          </div>
        </div>

        <div className="form-row three">
          <div>
            <label>SBU (Company) *</label>
            <SearchableSelect
              value={str(form.company_id)}
              items={companyItems}
              onChange={(v) => set('company_id', v)}
              placeholder="Search SBU…"
              onAddNew={() => setShowOrgModal('company')}
              addLabel="new SBU"
              onRemove={(v) => removeCompany(v)}
            />
          </div>
          <div>
            <label>Function *</label>
            <SearchableSelect
              value={str(form.function_id)}
              items={functionItems}
              onChange={(v) => set('function_id', v)}
              placeholder="Search function…"
              onAddNew={() => setShowOrgModal('function')}
              addLabel="new function"
              onRemove={(v) => removeFunction(v)}
            />
          </div>
          <div>
            <label>Department *</label>
            <SearchableSelect
              value={str(form.department_id)}
              items={departmentItems}
              onChange={(v) => set('department_id', v)}
              placeholder="Search department…"
              onAddNew={() => setShowOrgModal('department')}
              addLabel="new department"
              onRemove={(v) => removeDepartment(v)}
            />
          </div>
        </div>

        <div className="form-row three">
          <div>
            <label>Task Type *</label>
            <SearchableSelect
              value={str(form.task_type)}
              items={taskTypes.map((t) => ({ value: t, label: label(t) }))}
              onChange={(v) => customAdd('task_type', taskTypes, v)}
              placeholder="Select or type…"
              allowCustom
              onRemove={(v) => removeOption('task_type', v)}
            />
          </div>
          <div>
            <label>Priority *</label>
            <SearchableSelect
              value={str(form.priority)}
              items={priorities.map((p) => ({ value: p, label: label(p) }))}
              onChange={(v) => customAdd('priority', priorities, v)}
              placeholder="Select or type…"
              allowCustom
              onRemove={(v) => removeOption('priority', v)}
            />
          </div>
          <div>
            <label>Status *</label>
            <SearchableSelect
              value={str(form.status)}
              items={statuses.map((s) => ({ value: s, label: label(s) }))}
              onChange={(v) => customAdd('status', statuses, v)}
              placeholder="Select or type…"
              allowCustom
              onRemove={(v) => removeOption('status', v)}
            />
          </div>
        </div>

        <label>Description *</label>
        <textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />

        <label>Expected Deliverable *</label>
        <input value={form.expected_deliverable} onChange={(e) => set('expected_deliverable', e.target.value)} />

        <div className="form-row three">
          <div>
            <label>Responsible (R) *</label>
            <SearchableSelect
              value={str(form.responsible_id)}
              items={userItems}
              onChange={onResponsibleChange}
              placeholder="Search user…"
              onAddNew={() => setShowUserModal(true)}
              addLabel="new user"
              onRemove={user?.role === 'admin' ? (v) => removeUser(v) : undefined}
            />
          </div>
          <div>
            <label>Accountable (A) *</label>
            <SearchableSelect
              value={str(form.accountable_id)}
              items={userItems}
              onChange={(v) => set('accountable_id', v)}
              placeholder="Search user…"
              onAddNew={() => setShowUserModal(true)}
              addLabel="new user"
              onRemove={user?.role === 'admin' ? (v) => removeUser(v) : undefined}
            />
            {form.responsible_id && form.accountable_id && form.accountable_id === managerIdOf(str(form.responsible_id)) && (
              <div className="small muted" style={{ marginTop: 4 }}>Auto-suggested: Responsible's immediate senior. Change it anytime.</div>
            )}
          </div>
          <div>
            <label>Reviewer *</label>
            <SearchableSelect
              value={str(form.reviewer_id)}
              items={userItems}
              onChange={(v) => set('reviewer_id', v)}
              placeholder="Search user…"
              onAddNew={() => setShowUserModal(true)}
              addLabel="new user"
              onRemove={user?.role === 'admin' ? (v) => removeUser(v) : undefined}
            />
          </div>
        </div>

        <div className="form-row three">
          <div>
            <label>Planned Start *</label>
            <input type="date" value={form.planned_start_date} onChange={(e) => set('planned_start_date', e.target.value)} />
          </div>
          <div>
            <label>Baseline Due Date *</label>
            <input type="date" value={form.baseline_due_date} onChange={(e) => set('baseline_due_date', e.target.value)} />
          </div>
          <div>
            <label>Progress %</label>
            <input type="number" min={0} max={100} value={form.progress_pct} onChange={(e) => set('progress_pct', Number(e.target.value))} />
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : task ? 'Save Changes' : 'Create Task'}
          </button>
        </div>
      </div>

      {showProjectModal && <ProjectModal onClose={() => setShowProjectModal(false)} onCreated={createdProject} />}
      {showUserModal && <UserModal onClose={() => setShowUserModal(false)} onCreated={createdUser} isAdmin={user?.role === 'admin'} />}
      {showOrgModal && <OrgModal kind={showOrgModal} onClose={() => setShowOrgModal(null)} onCreated={(o) => createdOrg(showOrgModal, o)} />}
    </div>
  )
}

function OrgModal({ kind, onClose, onCreated }: { kind: 'company' | 'function' | 'department'; onClose: () => void; onCreated: (o: any) => void }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const titles = { company: 'New SBU (Company)', function: 'New Function', department: 'New Department' }

  const submit = async () => {
    if (!name.trim()) { setErr(`${titles[kind]} name is required`); return }
    setBusy(true)
    setErr('')
    try {
      const payload: any = { name: name.trim() }
      if (kind !== 'department') payload.code = code.trim() || name.trim().slice(0, 3).toUpperCase()
      let o
      if (kind === 'company') o = await api.post('/organizations/companies', payload)
      else if (kind === 'function') o = await api.post('/organizations/functions', payload)
      else o = await api.post('/organizations/departments', payload)
      onCreated(o)
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 440 }} onClick={(e) => e.stopPropagation()}>
        <h2>{titles[kind]}</h2>
        {err && <div className="badge red" style={{ marginBottom: 12 }}>{err}</div>}
        <label>Name *</label>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        {kind !== 'department' && <><label>Code</label><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. ACS" /></>}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Create'}</button>
        </div>
      </div>
    </div>
  )
}

function ProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: Project) => void }) {
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!name.trim()) { setErr('Project name is required'); return }
    setBusy(true)
    setErr('')
    try {
      const p = await api.post<Project>('/projects', { name: name.trim(), code: null })
      onCreated(p)
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
        <h2>New Project</h2>
        {err && <div className="badge red" style={{ marginBottom: 12 }}>{err}</div>}
        <label>Project Name *</label>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <div className="small muted" style={{ marginTop: 6 }}>Project code is generated automatically.</div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Create Project'}</button>
        </div>
      </div>
    </div>
  )
}

function UserModal({ onClose, onCreated, isAdmin }: { onClose: () => void; onCreated: (u: User) => void; isAdmin: boolean }) {
  const [form, setForm] = useState({ employee_id: '', name: '', email: '', designation: '', role: 'employee' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.employee_id.trim()) { setErr('Employee ID, name and email are required'); return }
    setBusy(true)
    setErr('')
    try {
      const u = await api.post<User>('/organizations/users', form)
      onCreated(u)
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
        <h2>New User</h2>
        {!isAdmin && <div className="small muted mb" style={{ marginBottom: 12 }}>Only admins can create users.</div>}
        {err && <div className="badge red" style={{ marginBottom: 12 }}>{err}</div>}
        <div className="form-row">
          <div><label>Employee ID *</label><input value={form.employee_id} onChange={(e) => set('employee_id', e.target.value)} autoFocus /></div>
          <div><label>Name *</label><input value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
        </div>
        <div className="form-row">
          <div><label>Email *</label><input value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
          <div><label>Designation</label><input value={form.designation} onChange={(e) => set('designation', e.target.value)} /></div>
        </div>
        <label>Role</label>
        <select value={form.role} onChange={(e) => set('role', e.target.value)}>
          {['employee', 'team_lead', 'pm', 'pmo', 'reviewer', 'auditor', 'business_head', 'functional_head', 'sponsor', 'group_executive', 'admin'].map((r) => <option key={r} value={r}>{label(r)}</option>)}
        </select>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={busy || !isAdmin}>{busy ? 'Saving…' : 'Create User'}</button>
        </div>
      </div>
    </div>
  )
}