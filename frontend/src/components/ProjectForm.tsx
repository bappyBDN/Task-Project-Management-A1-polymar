import { useEffect, useState } from 'react'
import { api } from '../api'
import { Company, Department, Function, Project, User } from '../types'
import { METHODOLOGIES, PROJECT_STATUSES, label } from '../constants'
import SearchableSelect from './SearchableSelect'
import { RichTextEditor } from './RichText'
import SbuSelect from './SbuSelect'
import InviteUserModal from './InviteUserModal'
import OrgModal from './OrgModal'
import { useAuth } from '../auth'

/**
 * "New Project" form, shared by the Projects page (+ Add Project) and the Task
 * form (+ new project), so both always ask for the same fields.
 * Required: Project Name, SBU, Start Date, Due Date. The rest is optional.
 *
 * withTasks (Projects page only): the user can also add any number of tasks in the
 * same step. The project is created first, then each task through the normal
 * POST /tasks, so nothing new is needed on the backend or in the database.
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
  { key: 'company_id', label: 'SBU' },
  { key: 'manager_id', label: 'Project Manager' },
  { key: 'start_date', label: 'Start Date' },
  { key: 'baseline_due_date', label: 'Due Date' },
]

// One task row in the "Tasks" section.
interface TaskDraft {
  key: number
  title: string
  responsible_id: string
  accountable_id: string
  reviewer_id: string
  planned_start_date: string
  baseline_due_date: string
  priority: string
  description: string
  expected_deliverable: string
  error?: string
}
let draftKey = 0
const newDraft = (prev?: TaskDraft): TaskDraft => ({
  key: ++draftKey, title: '', responsible_id: '',
  // Accountable / Reviewer are usually the same across a project's tasks - copy them from the last row
  accountable_id: prev?.accountable_id ?? '', reviewer_id: prev?.reviewer_id ?? '',
  planned_start_date: '', baseline_due_date: '', priority: 'medium', description: '', expected_deliverable: '',
})

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

export default function ProjectForm({ companies, users: listedUsers, types, onClose, onSaved, withTasks = false, project, limited = false }: {
  companies: Company[]
  users: User[]
  types: string[] // project types already used by existing projects
  onClose: () => void
  onSaved: (p: Project, tasksCreated?: number) => void
  withTasks?: boolean // show the "Tasks" section (Projects page)
  project?: Project // set = edit this project (PATCH) instead of creating one
  // Manager / Owner (not admin / PMO) editing: manager and dates are locked (the server enforces the same)
  limited?: boolean
}) {
  const editing = !!project
  if (editing) withTasks = false
  const { user: me } = useAuth()
  const [form, setForm] = useState(() => project ? {
    name: project.name ?? '', company_id: project.company_id ? String(project.company_id) : '',
    manager_id: project.manager_id ? String(project.manager_id) : '',
    project_type: project.project_type || 'operational', methodology: project.methodology || 'hybrid',
    status: project.status || 'planning', priority: project.priority || 'medium',
    start_date: project.start_date || '', baseline_due_date: project.baseline_due_date || '',
    objective: project.objective || '',
    // a new project starts in the signed-in user's own SBU (they can change it)
  } : { ...EMPTY_FORM, company_id: me?.company_id != null ? String(me.company_id) : '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [newTypes, setNewTypes] = useState<string[]>([])
  // "+ Add new user" on Project Manager (true) or on a task row's person field:
  // people added by email aren't in the parent's list yet
  const [inviting, setInviting] = useState<true | { key: number; field: 'responsible_id' | 'accountable_id' | 'reviewer_id' } | false>(false)
  const [invited, setInvited] = useState<User[]>([])
  const users = [...listedUsers, ...invited.filter((u) => !listedUsers.some((x) => x.id === u.id))]
  const set = (k: keyof typeof EMPTY_FORM, v: string) => setForm((f) => ({ ...f, [k]: v }))

  // ---- tasks added together with the project
  const [drafts, setDrafts] = useState<TaskDraft[]>([])
  // the tasks start with the signed-in user's own function / department (they can change them)
  const [common, setCommon] = useState({
    function_id: me?.function_id != null ? String(me.function_id) : '',
    department_id: me?.department_id != null ? String(me.department_id) : '',
    category: 'operational', status: 'backlog',
  })
  const [addingOrg, setAddingOrg] = useState<'function' | 'department' | null>(null)
  const [functions, setFunctions] = useState<Function[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [statuses, setStatuses] = useState<string[]>([])
  const [created, setCreated] = useState<Project | null>(null) // project already saved (task retry)
  const [doneCount, setDoneCount] = useState(0)

  useEffect(() => {
    if (!withTasks) return
    api.get<Function[]>('/organizations/functions').then(setFunctions).catch(() => {})
    api.get<Department[]>('/organizations/departments').then(setDepartments).catch(() => {})
    api.get<string[]>('/list-options?kind=category').then(setCategories).catch(() => {})
    api.get<string[]>('/list-options?kind=status').then(setStatuses).catch(() => {})
  }, [withTasks])

  const setDraft = (key: number, k: keyof TaskDraft, v: string) =>
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, [k]: v, error: undefined } : d)))
  const addDraft = () => setDrafts((ds) => [...ds, newDraft(ds[ds.length - 1])])
  const removeDraft = (key: number) => setDrafts((ds) => ds.filter((d) => d.key !== key))
  // Same rule as the Task form: Responsible's immediate senior is suggested as Accountable (only if empty).
  const onDraftResponsible = (d: TaskDraft, v: string) => {
    setDraft(d.key, 'responsible_id', v)
    if (!d.accountable_id) {
      const mgr = users.find((u) => String(u.id) === v)?.reports_to_id
      if (mgr != null) setDraft(d.key, 'accountable_id', String(mgr))
    }
  }
  const draftProblems = (d: TaskDraft): string[] => {
    const miss: string[] = []
    if (!d.title.trim()) miss.push('Title')
    if (!d.responsible_id) miss.push('Responsible')
    if (!d.accountable_id) miss.push('Accountable')
    if (!d.reviewer_id) miss.push('Reviewer')
    return miss
  }

  // "+ Add new function / department" from the tasks section: add to the list and select it
  const createdOrg = (kind: 'function' | 'department', o: any) => {
    if (kind === 'function') { setFunctions((l) => [...l, o]); setCommon((c) => ({ ...c, function_id: String(o.id), department_id: '' })) }
    else { setDepartments((l) => [...l, o]); setCommon((c) => ({ ...c, department_id: String(o.id) })) }
    setAddingOrg(null)
  }
  // Category: pick one or type a new one - a new one is saved to the list, as in the Task form
  const onCategory = (v: string) => {
    const value = v.trim()
    setCommon((c) => ({ ...c, category: value || 'operational' }))
    if (value && !['operational', ...categories].includes(value)) {
      setCategories((l) => [...l, value])
      api.post(`/list-options?kind=category&value=${encodeURIComponent(value)}`).catch(() => {})
    }
  }
  const invitedUser = (u: User) => {
    setInvited((l) => [...l.filter((x) => x.id !== u.id), u])
    if (inviting === true) set('manager_id', String(u.id))
    else if (inviting) setDraft(inviting.key, inviting.field, String(u.id))
    setInviting(false)
  }

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
    if (!created && missing.length) { setError(`Please fill in: ${missing.map((m) => m.label).join(', ')}`); return }
    if (!created && form.start_date > form.baseline_due_date) { setError('Start date cannot be after the due date'); return }

    // check every task row before anything is saved
    let bad = false
    const checked = drafts.map((d) => {
      const miss = draftProblems(d)
      const start = d.planned_start_date || form.start_date
      const due = d.baseline_due_date || form.baseline_due_date
      let err: string | undefined
      if (miss.length) err = `Please fill in: ${miss.join(', ')}`
      else if (start && due && start > due) err = 'Start date cannot be after the due date'
      if (err) bad = true
      return { ...d, error: err }
    })
    if (bad) { setDrafts(checked); setError('Please fix the highlighted tasks below.'); return }

    setSaving(true)
    setError('')
    if (project) {
      try {
        onSaved(await updateProject(project))
      } catch (e: any) {
        setError(errText(e))
      } finally {
        setSaving(false)
      }
      return
    }
    let p = created
    if (!p) {
      try {
        p = await createProject()
        setCreated(p)
      } catch (e: any) {
        setError(errText(e)); setSaving(false); return
      }
    }
    if (!drafts.length) { setSaving(false); onSaved(p, doneCount); return }

    // project exists - create the tasks one by one; keep only the ones that failed
    let ok = doneCount
    const failed: TaskDraft[] = []
    for (const d of drafts) {
      try {
        await api.post('/tasks', taskPayload(d, p))
        ok += 1
      } catch (e: any) {
        failed.push({ ...d, error: errText(e) })
      }
    }
    setDoneCount(ok)
    setSaving(false)
    if (!failed.length) { onSaved(p, ok); return }
    setDrafts(failed)
    setError(`Project ${p.code || p.name} was created${ok ? ` with ${ok} task(s)` : ''}, but ${failed.length} task(s) could not be saved. Fix them and press "Retry", or Close.`)
  }

  const taskPayload = (d: TaskDraft, p: Project) => {
    const due = d.baseline_due_date || form.baseline_due_date || null
    return {
      code: null,
      title: d.title.trim(),
      description: d.description.trim() || d.expected_deliverable.trim() || d.title.trim(),
      expected_deliverable: d.expected_deliverable.trim() || null,
      category: common.category || 'operational',
      task_type: 'task',
      priority: d.priority || 'medium',
      project_id: p.id,
      company_id: p.company_id ?? (form.company_id ? Number(form.company_id) : null),
      function_id: common.function_id ? Number(common.function_id) : null,
      department_id: common.department_id ? Number(common.department_id) : null,
      responsible_id: Number(d.responsible_id),
      accountable_id: Number(d.accountable_id),
      reviewer_id: Number(d.reviewer_id),
      planned_start_date: d.planned_start_date || form.start_date || null,
      baseline_due_date: due,
      approved_due_date: due,
      progress_pct: 0,
      status: common.status || 'backlog',
      blocker: false,
    }
  }

  const updateProject = (pr: Project) => {
    const payload: any = {
      name: form.name.trim(),
      company_id: Number(form.company_id),
      project_type: form.project_type || 'operational',
      methodology: form.methodology || 'hybrid',
      status: form.status || 'planning',
      priority: form.priority || 'medium',
      objective: form.objective.trim() || null,
    }
    if (!limited) {
      const p: any = pr
      // keep an approved (revised) due date; only follow the baseline if they were the same
      const keepApproved = p.approved_due_date && p.approved_due_date !== p.baseline_due_date
      payload.manager_id = form.manager_id ? Number(form.manager_id) : null
      payload.start_date = form.start_date
      payload.baseline_due_date = form.baseline_due_date
      payload.approved_due_date = keepApproved ? p.approved_due_date : form.baseline_due_date
    }
    return api.patch<Project>(`/projects/${pr.id}`, payload)
  }

  const createProject = () =>
    api.post<Project>('/projects', {
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

  const opts = (list: readonly string[]) => list.map((v) => ({ value: v, label: label(v) }))
  // stopPropagation: when this opens on top of the Task form, closing it must not close the Task form too
  // once the project is saved, closing must still refresh the list
  const close = (e?: { stopPropagation: () => void }) => { e?.stopPropagation(); if (created) onSaved(created, doneCount); else onClose() }
  const userItems = users.map((u) => ({ value: String(u.id), label: u.name }))
  // the chosen one always stays listed (e.g. the user's own department filed under another function)
  const deptList = departments.filter((d) => !common.function_id || !d.function_id || String(d.function_id) === common.function_id || String(d.id) === common.department_id)
  const lock = !!created // project fields can't change after the project is saved

  return (
    <div className="modal-backdrop">
      <div className="modal" style={withTasks ? { maxHeight: '92vh', overflowY: 'auto' } : undefined} onClick={(e) => e.stopPropagation()}>
        <h2>{editing ? `Edit Project - ${project!.code || project!.name}` : created ? `New Project - ${created.code || created.name} saved` : 'New Project'}</h2>
        {error && <div className="alert error" role="alert">{error}</div>}
        {limited && (
          <div className="alert info">
            You are editing as the project's <strong>Manager / Owner</strong>. The Project Manager and the dates can only be changed by an admin / PMO.
          </div>
        )}

        <fieldset disabled={lock} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <label>Project Name *</label>
        <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Kiln 2 Vibration Monitoring" autoFocus />
        {!editing && <div className="small muted" style={{ marginTop: 6 }}>Project code is generated automatically.</div>}

        <div className="form-row">
          <div>
            <label>SBU *</label>
            <SbuSelect value={form.company_id} companies={companies} onChange={(v) => set('company_id', v)} />
          </div>
          <fieldset disabled={limited} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} title={limited ? 'Only an admin / PMO can change this' : undefined}>
            <label>Project Manager *</label>
            <SearchableSelect value={form.manager_id} items={users.map((u) => ({ value: String(u.id), label: u.name }))} onChange={(v) => set('manager_id', v)} placeholder="Search person…"
              onAddNew={() => setInviting(true)} addLabel="new user" />
          </fieldset>
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
            <input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} disabled={limited} />
          </div>
          <div>
            <label>Due Date *</label>
            <input type="date" value={form.baseline_due_date} min={form.start_date || undefined} onChange={(e) => set('baseline_due_date', e.target.value)} disabled={limited} />
          </div>
        </div>

        <label>Objective</label>
        <RichTextEditor rows={3} value={form.objective} onChange={(v) => set('objective', v)} placeholder="What should this project achieve?" disabled={lock} />
        </fieldset>

        {withTasks && (
          <div style={{ marginTop: 18, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
            <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--ink)' }}>Tasks {drafts.length > 0 && <span className="muted small">({drafts.length})</span>}</div>
                <div className="small muted">Optional - add as many tasks as you need. They get this project's company; empty dates use the project's dates.</div>
              </div>
              <button type="button" className="btn" onClick={addDraft} disabled={saving}>+ Add Task</button>
            </div>

            {drafts.length > 0 && (
              <>
                <div className="form-row" style={{ marginTop: 10 }}>
                  <div>
                    <label>Function (all tasks)</label>
                    <SearchableSelect value={common.function_id} items={functions.map((f) => ({ value: String(f.id), label: f.name }))} onChange={(v) => setCommon((c) => ({ ...c, function_id: v, department_id: '' }))} placeholder="Search function…"
                      onAddNew={() => setAddingOrg('function')} addLabel="new function" />
                  </div>
                  <div>
                    <label>Department (all tasks)</label>
                    <SearchableSelect value={common.department_id} items={deptList.map((d) => ({ value: String(d.id), label: d.name }))} onChange={(v) => setCommon((c) => ({ ...c, department_id: v }))} placeholder="Search department…"
                      onAddNew={() => setAddingOrg('department')} addLabel="new department" />
                  </div>
                </div>
                <div className="form-row">
                  <div>
                    <label>Category (all tasks)</label>
                    <SearchableSelect value={common.category} items={opts(Array.from(new Set(['operational', ...categories])))} onChange={onCategory} placeholder="Select or type a new category…" allowCustom />
                  </div>
                  <div>
                    <label>Status (all tasks)</label>
                    <SearchableSelect value={common.status} items={opts(Array.from(new Set(['backlog', ...statuses])))} onChange={(v) => setCommon((c) => ({ ...c, status: v || 'backlog' }))} placeholder="Status…" />
                  </div>
                </div>
                {(me?.function_id != null || me?.department_id != null) && (
                  <div className="small muted" style={{ marginTop: 4 }}>Function and department start from your profile - change them if these tasks belong elsewhere.</div>
                )}
              </>
            )}

            {drafts.map((d, i) => (
              <div key={d.key} style={{ border: `1px solid ${d.error ? '#dc2626' : 'var(--line)'}`, borderRadius: 8, padding: '10px 12px', marginTop: 12 }}>
                <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                  <strong className="small">Task {i + 1}</strong>
                  <button type="button" className="btn" style={{ padding: '2px 10px' }} onClick={() => removeDraft(d.key)} disabled={saving} title="Remove this task">Remove</button>
                </div>
                {d.error && <div className="badge red" style={{ margin: '8px 0' }}>{d.error}</div>}
                <label>Task Title *</label>
                <input value={d.title} onChange={(e) => setDraft(d.key, 'title', e.target.value)} placeholder="e.g. Install vibration sensors" disabled={saving} />
                <div className="form-row three">
                  <div>
                    <label>Responsible (R) *</label>
                    <SearchableSelect value={d.responsible_id} items={userItems} onChange={(v) => onDraftResponsible(d, v)} placeholder="Search person…"
                      onAddNew={() => setInviting({ key: d.key, field: 'responsible_id' })} addLabel="new user" />
                  </div>
                  <div>
                    <label>Accountable (A) *</label>
                    <SearchableSelect value={d.accountable_id} items={userItems} onChange={(v) => setDraft(d.key, 'accountable_id', v)} placeholder="Search person…"
                      onAddNew={() => setInviting({ key: d.key, field: 'accountable_id' })} addLabel="new user" />
                  </div>
                  <div>
                    <label>Reviewer *</label>
                    <SearchableSelect value={d.reviewer_id} items={userItems} onChange={(v) => setDraft(d.key, 'reviewer_id', v)} placeholder="Search person…"
                      onAddNew={() => setInviting({ key: d.key, field: 'reviewer_id' })} addLabel="new user" />
                  </div>
                </div>
                <div className="form-row three">
                  <div>
                    <label>Planned Start</label>
                    <input type="date" value={d.planned_start_date} min={form.start_date || undefined} max={form.baseline_due_date || undefined} onChange={(e) => setDraft(d.key, 'planned_start_date', e.target.value)} disabled={saving} />
                  </div>
                  <div>
                    <label>Due Date</label>
                    <input type="date" value={d.baseline_due_date} min={d.planned_start_date || form.start_date || undefined} max={form.baseline_due_date || undefined} onChange={(e) => setDraft(d.key, 'baseline_due_date', e.target.value)} disabled={saving} />
                  </div>
                  <div>
                    <label>Priority</label>
                    <SearchableSelect value={d.priority} items={opts(PRIORITIES)} onChange={(v) => setDraft(d.key, 'priority', v || 'medium')} placeholder="Priority…" />
                  </div>
                </div>
                <label>Description</label>
                <RichTextEditor rows={2} value={d.description} onChange={(v) => setDraft(d.key, 'description', v)}
                  placeholder="What is this task about? Use Link to attach a document or page." disabled={saving} />
                <label>Expected Deliverable</label>
                <input value={d.expected_deliverable} onChange={(e) => setDraft(d.key, 'expected_deliverable', e.target.value)} placeholder="What will be delivered?" disabled={saving} />
              </div>
            ))}
            {drafts.length > 0 && (
              <button type="button" className="btn" style={{ marginTop: 10 }} onClick={addDraft} disabled={saving}>+ Add Another Task</button>
            )}
          </div>
        )}

        {inviting && <InviteUserModal onClose={() => setInviting(false)} onInvited={invitedUser} />}
        {addingOrg && (
          <OrgModal kind={addingOrg} functionId={common.function_id ? Number(common.function_id) : null}
            onClose={() => setAddingOrg(null)} onCreated={(o) => createdOrg(addingOrg, o)} />
        )}

        <div className="modal-actions">
          <button className="btn" onClick={() => close()} disabled={saving}>{created ? 'Close' : 'Cancel'}</button>
          <button className="btn primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…'
              : editing ? 'Save Changes'
              : created ? `Retry ${drafts.length} Task${drafts.length === 1 ? '' : 's'}`
              : drafts.length ? `Create Project + ${drafts.length} Task${drafts.length === 1 ? '' : 's'}`
              : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  )
}