import { useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { Company, Department, Function, Project, Task, User } from '../types'
import { fmtDate, label } from '../constants'
import SearchableSelect from './SearchableSelect'
import InviteUserModal from './InviteUserModal'
import OrgModal from './OrgModal'
import { RichTextEditor } from './RichText'
import SbuSelect from './SbuSelect'
import ProjectForm from './ProjectForm'

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
  // Responsible / Accountable person (not admin / PMO) editing their own task: an already-set
  // due date and Completed/Closed are locked (the server enforces the same).
  limited?: boolean
  // Accountable person (not Responsible): they also can't change the Accountable, Reviewer or Informed person.
  lockApprovers?: boolean
  // New task opened from a project's page: that project is already chosen (it can still be changed)
  defaultProjectId?: number
}

const DONE_STATUSES = ['completed', 'closed']

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
  informed_id: '',
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

// null -> '' so <input>/<textarea> stay controlled when editing an existing task.
// A new task starts with the signed-in user's own SBU / function / department (they can change them).
// Opened from a project's page, the project is chosen and the SBU is the project's.
const initialForm = (task?: Task, me?: User | null, project?: Project) =>
  task
    ? Object.fromEntries(Object.entries({ ...EMPTY, ...task }).map(([k, v]) => [k, v ?? '']))
    : {
      ...EMPTY, project_id: project?.id ?? '',
      company_id: project?.company_id ?? me?.company_id ?? '', function_id: me?.function_id ?? '', department_id: me?.department_id ?? '',
    }

export default function TaskForm({ projects, users: listedUsers, companies = [], functions = [], departments = [], onClose, onSaved, onRefresh, task, limited = false, lockApprovers = false, defaultProjectId }: Props) {
  const { user } = useAuth()
  const [form, setForm] = useState<any>(() => initialForm(task, user, projects.find((p) => p.id === defaultProjectId)))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // inline create modals
  const [showProjectModal, setShowProjectModal] = useState(false)
  // which person field "+ Add new user" was opened from (null = closed)
  const [showUserModal, setShowUserModal] = useState<'responsible_id' | 'accountable_id' | 'reviewer_id' | 'informed_id' | null>(null)
  // people just added by email may not be in the parent's list yet
  const [invited, setInvited] = useState<User[]>([])
  const users = [...listedUsers, ...invited.filter((u) => !listedUsers.some((x) => x.id === u.id))]
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

  // --- Gantt projects: the tasks this one depends on --------------------
  // Only for a project with the Gantt option on (see ProjectGantt). The task starts after
  // everything it depends on has finished; the server moves the forecast dates accordingly.
  const ganttOn = !!projects.find((p) => String(p.id) === str(form.project_id))?.gantt_enabled
  const [projectTasks, setProjectTasks] = useState<Task[]>([])
  const [dependsOn, setDependsOn] = useState<string[]>([])
  // editing: don't send dependencies until the saved ones are known (a failed load must not wipe them)
  const [depsLoaded, setDepsLoaded] = useState(!task)

  useEffect(() => {
    if (!task) return
    api.get<{ depends_on_ids: number[] }>(`/tasks/${task.id}/dependencies`)
      .then((d) => { setDependsOn(d.depends_on_ids.map(String)); setDepsLoaded(true) }).catch(() => {})
  }, [])
  useEffect(() => {
    if (!ganttOn || !form.project_id) { setProjectTasks([]); return }
    let stale = false
    api.get<Task[]>(`/tasks?project_id=${form.project_id}`).then((l) => { if (!stale) setProjectTasks(l) }).catch(() => {})
    return () => { stale = true }
  }, [ganttOn, form.project_id])

  const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10)
  // when a task this one depends on is expected to be finished
  const finishOf = (t: Task) => (DONE_STATUSES.includes(t.status) ? t.actual_due_date : t.forecast_due_date) || t.approved_due_date || t.baseline_due_date
  const chosen = dependsOn.map((v) => projectTasks.find((t) => String(t.id) === v)).filter((t): t is Task => !!t)
  const lastDep = chosen.filter((t) => t.status !== 'cancelled' && finishOf(t)).sort((a, b) => finishOf(b)!.localeCompare(finishOf(a)!))[0]
  const earliestStart = lastDep ? addDays(finishOf(lastDep)!, 1) : ''
  const startsTooEarly = !!earliestStart && !!form.planned_start_date && form.planned_start_date < earliestStart
  const dueLocked = limited && !!task?.baseline_due_date
  const startAfterDependencies = () => {
    const length = form.baseline_due_date ? Math.max(0, Math.round((Date.parse(form.baseline_due_date) - Date.parse(form.planned_start_date)) / 86400000)) : 0
    setForm((f: any) => ({ ...f, planned_start_date: earliestStart, baseline_due_date: addDays(earliestStart, length) }))
  }

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
    { key: 'company_id', label: 'SBU' },
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
      informed_id: form.informed_id ? Number(form.informed_id) : null,
      planned_start_date: form.planned_start_date || null,
      baseline_due_date: form.baseline_due_date || null,
      approved_due_date: keepApproved ? t.approved_due_date : form.baseline_due_date,
      progress_pct: status === 'completed' || status === 'closed' ? 100 : progress,
      status,
      blocker: form.blocker ?? false,
      blocker_details: form.blocker_details,
      acceptance_criteria: form.acceptance_criteria,
    }
    if (ganttOn && depsLoaded) payload.depends_on_ids = dependsOn.map(Number)
    if (limited && task) {
      // fields this person may not change are left exactly as they are
      delete payload.code
      delete payload.approved_due_date
      if (task.baseline_due_date) delete payload.baseline_due_date
      if (lockApprovers) { delete payload.accountable_id; delete payload.reviewer_id; delete payload.informed_id }
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
  const functionItems = functions.map((f) => ({ value: String(f.id), label: f.name }))
  const departmentItems = departments.map((dp) => ({ value: String(dp.id), label: dp.name }))

  // SBU / function / department still exactly as filled in from the user's profile
  const fromProfile = !task && !!user && (['company_id', 'function_id', 'department_id'] as const)
    .some((k) => user[k] != null && str(form[k]) === str(user[k]))
  // A task belongs to its project's SBU: follow the project unless the user picked another SBU themselves.
  const onProjectChange = (v: string) => {
    if (v !== str(form.project_id)) setDependsOn([]) // a task only depends on tasks of its own project
    set('project_id', v)
    const p = projects.find((x) => String(x.id) === v)
    if (!task && p?.company_id && (!form.company_id || str(form.company_id) === str(user?.company_id))) set('company_id', String(p.company_id))
  }

  const createdProject = async (p: Project) => {
    set('project_id', String(p.id))
    // the new project always has an SBU - use it for the task if none picked yet
    if (!form.company_id && p.company_id) set('company_id', String(p.company_id))
    setShowProjectModal(false)
    onRefresh?.() // refresh parent lists WITHOUT closing the task form
  }
  const createdUser = async (u: User) => {
    setInvited((l) => [...l.filter((x) => x.id !== u.id), u])
    if (showUserModal) set(showUserModal, String(u.id))
    if (showUserModal === 'responsible_id' && !form.accountable_id) {
      const managerId = u.reports_to_id != null ? String(u.reports_to_id) : ''
      if (managerId) set('accountable_id', managerId)
    }
    setShowUserModal(null)
    onRefresh?.() // refresh parent lists WITHOUT closing the task form
  }

  const removeProject = async (value: string) => {
    if (!confirm(`Delete this project? Its tasks will be permanently deleted too.`)) return
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
    if (str(form.informed_id) === value) set('informed_id', '')
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
    <div className="modal-backdrop">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{task ? `Edit ${task.code}` : 'New Task'}</h2>
        {limited && (
          <div className="alert info">
            You are editing as the task's <strong>{lockApprovers ? 'Accountable' : 'Responsible'}</strong> person.
            {lockApprovers ? ' Accountable, Reviewer, Informed and the due date' : ' The due date'} can only be changed by an admin / PMO;
            use "Request Date Revision" for a new date and "Submit for Completion" to finish the task.
          </div>
        )}
        {error && <div className="badge red" style={{ marginBottom: 12 }}>{error}</div>}

        <label>Task Title *</label>
        <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Install vibration sensors on Kiln 2" />

        <div className="form-row">
          <div>
            <label>Project *</label>
            <SearchableSelect
              value={str(form.project_id)}
              items={projectItems}
              onChange={onProjectChange}
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
            <label>SBU *</label>
            <SbuSelect
              value={str(form.company_id)}
              companies={companies}
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
        {fromProfile && <div className="small muted" style={{ marginTop: 4 }}>SBU, function and department are filled in from your profile - change them if this task belongs elsewhere.</div>}

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
              items={statuses.filter((s) => !limited || !DONE_STATUSES.includes(s) || s === task?.status).map((s) => ({ value: s, label: label(s) }))}
              onChange={(v) => customAdd('status', statuses, v)}
              placeholder="Select or type…"
              allowCustom
              onRemove={(v) => removeOption('status', v)}
            />
          </div>
        </div>

        <label>Description *</label>
        <RichTextEditor rows={3} value={form.description} onChange={(v) => set('description', v)} placeholder="What is this task about?" />

        <label>Expected Deliverable *</label>
        <RichTextEditor rows={2} value={form.expected_deliverable} onChange={(v) => set('expected_deliverable', v)} placeholder="What will be delivered when this task is done?" />

        <div className="form-row four">
          <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <label>Responsible (R) *</label>
            <SearchableSelect
              value={str(form.responsible_id)}
              items={userItems}
              onChange={onResponsibleChange}
              placeholder="Search user…"
              onAddNew={() => setShowUserModal('responsible_id')}
              addLabel="new user"
              onRemove={user?.role === 'admin' ? (v) => removeUser(v) : undefined}
            />
          </fieldset>
          <fieldset disabled={lockApprovers} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} title={lockApprovers ? 'Only the Responsible person or an admin / PMO can change this' : undefined}>
            <label>Accountable (A) *</label>
            <SearchableSelect
              value={str(form.accountable_id)}
              items={userItems}
              onChange={(v) => set('accountable_id', v)}
              placeholder="Search user…"
              onAddNew={() => setShowUserModal('accountable_id')}
              addLabel="new user"
              onRemove={user?.role === 'admin' ? (v) => removeUser(v) : undefined}
            />
            {form.responsible_id && form.accountable_id && form.accountable_id === managerIdOf(str(form.responsible_id)) && (
              <div className="small muted" style={{ marginTop: 4 }}>Auto-suggested: Responsible's immediate senior. Change it anytime.</div>
            )}
          </fieldset>
          <fieldset disabled={lockApprovers} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} title={lockApprovers ? 'Only the Responsible person or an admin / PMO can change this' : undefined}>
            <label>Reviewer *</label>
            <SearchableSelect
              value={str(form.reviewer_id)}
              items={userItems}
              onChange={(v) => set('reviewer_id', v)}
              placeholder="Search user…"
              onAddNew={() => setShowUserModal('reviewer_id')}
              addLabel="new user"
              onRemove={user?.role === 'admin' ? (v) => removeUser(v) : undefined}
            />
          </fieldset>
          <fieldset disabled={lockApprovers} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} title={lockApprovers ? 'Only the Responsible person or an admin / PMO can change this' : undefined}>
            <label>Informed (I)</label>
            <SearchableSelect
              value={str(form.informed_id)}
              items={userItems}
              onChange={(v) => set('informed_id', v)}
              placeholder="Search user…"
              onAddNew={() => setShowUserModal('informed_id')}
              addLabel="new user"
              onRemove={user?.role === 'admin' ? (v) => removeUser(v) : undefined}
            />
          </fieldset>
        </div>

        <div className="form-row three">
          <div>
            <label>Planned Start *</label>
            <input type="date" value={form.planned_start_date} onChange={(e) => set('planned_start_date', e.target.value)} />
          </div>
          <div>
            <label>Baseline Due Date *</label>
            <input type="date" value={form.baseline_due_date} onChange={(e) => set('baseline_due_date', e.target.value)}
              disabled={limited && !!task?.baseline_due_date} title={limited && task?.baseline_due_date ? 'Use "Request Date Revision" to change the due date' : undefined} />
          </div>
          <div>
            <label>Progress %</label>
            <input type="number" min={0} max={100} value={form.progress_pct} onChange={(e) => set('progress_pct', Number(e.target.value))} />
          </div>
        </div>

        {ganttOn && (
          <div className="gantt-deps">
            <label>Depends on <span style={{ fontWeight: 400 }}>— optional. This task starts after the tasks chosen here have finished (Gantt chart).</span></label>
            {chosen.map((t) => (
              <span key={t.id} className="gantt-chip">
                {t.code} — {t.title}{finishOf(t) ? ` (finishes ${fmtDate(finishOf(t))})` : ''}
                <button type="button" title="Remove" onClick={() => setDependsOn((l) => l.filter((x) => x !== String(t.id)))}>✕</button>
              </span>
            ))}
            <SearchableSelect
              value=""
              items={projectTasks.filter((t) => t.id !== task?.id && !dependsOn.includes(String(t.id)))
                .sort((a, b) => a.code.localeCompare(b.code)).map((t) => ({ value: String(t.id), label: `${t.code} — ${t.title}` }))}
              onChange={(v) => { if (v) setDependsOn((l) => (l.includes(v) ? l : [...l, v])) }}
              placeholder={projectTasks.length > (task ? 1 : 0) ? 'Search a task this one depends on…' : 'No other task in this project yet'}
            />
            {startsTooEarly && lastDep && (
              <div className="alert info" style={{ marginTop: 10, marginBottom: 0 }}>
                {lastDep.code} is expected to finish on {fmtDate(finishOf(lastDep))}, so this task can start on <strong>{fmtDate(earliestStart)}</strong> —
                later than its planned start. If you keep these dates, its forecast date (and the project's) is moved automatically.
                {!dueLocked && <> <button type="button" className="btn sm" style={{ marginLeft: 6 }} onClick={startAfterDependencies}>Plan it from {fmtDate(earliestStart)}</button></>}
              </div>
            )}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : task ? 'Save Changes' : 'Create Task'}
          </button>
        </div>
      </div>

      {showProjectModal && (
        <ProjectForm
          companies={companies}
          users={users}
          types={projects.map((p) => p.project_type)}
          onClose={() => setShowProjectModal(false)}
          onSaved={createdProject}
        />
      )}
      {showUserModal && <InviteUserModal onClose={() => setShowUserModal(null)} onInvited={createdUser} />}
      {showOrgModal && <OrgModal kind={showOrgModal} functionId={form.function_id ? Number(form.function_id) : null} onClose={() => setShowOrgModal(null)} onCreated={(o) => createdOrg(showOrgModal, o)} />}
    </div>
  )
}
