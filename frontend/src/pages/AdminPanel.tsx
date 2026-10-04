import { useEffect, useState } from 'react'
import { api } from '../api'
import { Company, Department, Function, Project, Task, User } from '../types'
import { fmtDate, label } from '../constants'
import SearchableSelect from '../components/SearchableSelect'
import SbuSelect, { sbuKey } from '../components/SbuSelect'
import { sbuName } from '../org'
import DuplicatesPanel from '../components/DuplicatesPanel'
import { clearPrivilegedCache } from '../usePrivileged'

const ROLES = ['group_executive', 'coo', 'business_head', 'functional_head', 'department_head', 'sponsor', 'pmo', 'pm', 'team_lead', 'employee', 'reviewer', 'auditor', 'admin']

interface UserForm {
  /** COO: the SBUs they oversee */
  sbu_ids: number[]
  employee_id: string
  name: string
  email: string
  designation?: string
  role: string
  company_id?: number | null
  function_id?: number | null
  department_id?: number | null
  reports_to_id?: number | null
}

// Added EmailLog interface
export interface EmailLog {
  id: number
  entity_type: string
  entity_id: number
  entity_code?: string | null
  entity_title?: string | null
  email_type: string
  sent_date: string
  recipients?: string | null
}

const EMPTY_USER: UserForm = { employee_id: '', name: '', email: '', designation: '', role: 'employee', company_id: null, function_id: null, department_id: null, reports_to_id: null, sbu_ids: [] }

// ---------------------------------------------------------------- Hierarchy helpers
function groupByManager(users: User[]): Map<number | null, User[]> {
  const map = new Map<number | null, User[]>()
  for (const u of users) {
    const key = u.reports_to_id ?? null
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(u)
  }
  return map
}

function reportingChain(users: User[], userId: number): User[] {
  const byId = new Map(users.map((u) => [u.id, u]))
  const chain: User[] = []
  let current = byId.get(userId)
  const seen = new Set<number>()
  while (current && !seen.has(current.id)) {
    chain.unshift(current)
    seen.add(current.id)
    current = current.reports_to_id != null ? byId.get(current.reports_to_id) : undefined
  }
  return chain
}

// ---------------------------------------------------------------- Org tree node
function OrgTreeNode({
  user, byManager, depth, onEdit,
}: {
  user: User
  byManager: Map<number | null, User[]>
  depth: number
  onEdit: (u: User) => void
}) {
  const children = byManager.get(user.id) ?? []
  return (
    <div style={{ marginLeft: depth === 0 ? 0 : 20, paddingLeft: depth === 0 ? 0 : 14, borderLeft: depth === 0 ? 'none' : '2px solid #e4e4e4', marginTop: 6 }}>
      <div className="row" style={{ alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: depth === 0 ? '#f6f4ec' : 'transparent' }}>
        <span className={`badge ${user.role === 'admin' ? 'gold' : 'gray'}`} style={{ fontSize: 11 }}>{label(user.role)}</span>
        <strong style={{ fontSize: depth === 0 ? 15 : 14 }}>{user.name}</strong>
        <span className="small muted">{user.designation ?? '—'}</span>
        {!user.is_active && <span className="badge red" style={{ fontSize: 10 }}>Inactive</span>}
        <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => onEdit(user)}>Edit</button>
      </div>
      {children.map((c) => (
        <OrgTreeNode key={c.id} user={c} byManager={byManager} depth={depth + 1} onEdit={onEdit} />
      ))}
    </div>
  )
}

export default function AdminPanel() {
  // Added 'emails' to tab state
  const [tab, setTab] = useState<'users' | 'tasks' | 'roles' | 'hierarchy' | 'emails' | 'duplicates'>('users')
  const [users, setUsers] = useState<User[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [functions, setFunctions] = useState<Function[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]) // New state for email logs
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [form, setForm] = useState<UserForm>(EMPTY_USER)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [pageErr, setPageErr] = useState('')
  const [confirmDeactivate, setConfirmDeactivate] = useState<number | null>(null)

  // Runs an admin action and shows a readable error instead of failing silently.
  const run = async (fn: () => Promise<void>) => {
    setPageErr('')
    try { await fn() } catch (e: any) { setMsg(''); setPageErr(e?.message || 'Something went wrong. Please try again.') }
  }
  const [privileged, setPrivileged] = useState<string[]>([])
  const [allRoles, setAllRoles] = useState<string[]>([])
  const [newRole, setNewRole] = useState('')
  const [showOrgModal, setShowOrgModal] = useState<'company' | 'function' | 'department' | null>(null)
  const [showQuickUser, setShowQuickUser] = useState(false)

  const load = () => {
    api.get<User[]>('/organizations/users').then(setUsers)
    api.get<Task[]>('/tasks').then(setTasks)
    api.get<Project[]>('/projects').then(setProjects)
    api.get<Company[]>('/organizations/companies').then(setCompanies)
    api.get<Function[]>('/organizations/functions').then(setFunctions)
    api.get<Department[]>('/organizations/departments').then(setDepartments)
    api.get<string[]>('/privileged-roles').then(setPrivileged)
    api.get<string[]>('/all-roles').then(setAllRoles)
    // Fetch email logs (Ensure backend endpoint exists)
    api.get<EmailLog[]>('/notifications/email-logs').then(setEmailLogs).catch((e) => console.warn('Could not load email logs', e))
  }

  useEffect(load, [])

  const addRole = () => run(async () => {
    if (!newRole.trim()) return
    await api.post('/privileged-roles', { role: newRole.trim().toLowerCase().replace(/\s+/g, '_') })
    clearPrivilegedCache()
    setNewRole('')
    load()
  })

  const removeRole = (role: string) => run(async () => {
    await api.del(`/privileged-roles?role=${encodeURIComponent(role)}`)
    clearPrivilegedCache()
    load()
  })

  const projectName = (id?: number) => projects.find((p) => p.id === id)?.name ?? '—'
  const set = (k: keyof UserForm, v: string | number | null) => setForm((f) => ({ ...f, [k]: v }))

  // COO: add an SBU to the overseen list (a copy of one already there counts as the same SBU)
  const addSbu = (v: string) => {
    if (!v) return
    const id = Number(v)
    // an SBU picked for the first time was just created: reload the list so its name shows
    api.get<Company[]>('/organizations/companies').then(setCompanies).catch(() => {})
    setForm((f) => {
      const key = (cid: number) => { const c = companies.find((x) => x.id === cid); return c ? sbuKey(c.name) : `#${cid}` }
      return f.sbu_ids.some((x) => x === id || key(x) === key(id)) ? f : { ...f, sbu_ids: [...f.sbu_ids, id] }
    })
  }

  const openCreate = () => { setEditing(null); setForm(EMPTY_USER); setErr(''); setShowForm(true) }
  const openEdit = (u: User) => {
    setEditing(u)
    setForm({
      employee_id: u.employee_id, name: u.name, email: u.email, designation: u.designation ?? '',
      role: u.role, company_id: u.company_id ?? null, function_id: u.function_id ?? null,
      department_id: u.department_id ?? null, reports_to_id: u.reports_to_id ?? null,
      sbu_ids: u.sbu_ids ?? [],
    })
    setErr('')
    setShowForm(true)
  }

  const saveUser = async () => {
    setErr('')
    if (!form.name || !form.email || !form.employee_id) { setErr('Name, email and employee id are required'); return }
    if (editing && form.reports_to_id === editing.id) { setErr('A user cannot report to themselves'); return }
    if (form.role === 'coo' && form.sbu_ids.length === 0) { setErr('Choose at least one SBU this COO oversees'); return }
    // the overseen SBUs belong to the COO role only
    const sbu_ids = form.role === 'coo' ? form.sbu_ids : []
    try {
      if (editing) {
        await api.patch(`/organizations/users/${editing.id}`, {
          ...form,
          sbu_ids,
          company_id: form.company_id ?? null,
          function_id: form.function_id ?? null,
          department_id: form.department_id ?? null,
          reports_to_id: form.reports_to_id ?? null,
        })
        setMsg(`Updated ${form.name}`)
      } else {
        await api.post('/organizations/users', { ...form, sbu_ids })
        setMsg(`Created ${form.name}`)
      }
      setShowForm(false)
      load()
    } catch (e: any) { setErr(e.message) }
  }

  // Two-step: first click asks "Confirm?", second click deactivates.
  const deactivate = (u: User) => run(async () => {
    if (confirmDeactivate !== u.id) { setConfirmDeactivate(u.id); return }
    setConfirmDeactivate(null)
    await api.del(`/organizations/users/${u.id}`)
    setMsg(`Deactivated ${u.name}. They can no longer log in.`)
    load()
  })

  const removeUser = (u: User) => run(async () => {
    if (!confirm(`Permanently delete user "${u.name}" (${u.email})? This cannot be undone.`)) return
    await api.del(`/organizations/users/${u.id}/permanent`)
    setMsg(`Permanently deleted ${u.name}`)
    load()
  })

  // ---------------------------------------------------------------- Company / Function / Department
  const functionItems = functions.map((f) => ({ value: String(f.id), label: f.name }))
  const departmentItems = departments.map((dp) => ({ value: String(dp.id), label: dp.name }))

  const createdOrg = (kind: 'company' | 'function' | 'department', obj: any) => {
    if (kind === 'company') set('company_id', obj.id)
    if (kind === 'function') set('function_id', obj.id)
    if (kind === 'department') set('department_id', obj.id)
    setShowOrgModal(null)
    load()
  }

  const removeCompany = (value: string) => run(async () => {
    if (!confirm('Remove this SBU?')) return
    await api.del(`/organizations/companies/${value}`)
    if (String(form.company_id) === value) set('company_id', null)
    load()
  })
  const removeFunction = (value: string) => run(async () => {
    if (!confirm('Remove this function?')) return
    await api.del(`/organizations/functions/${value}`)
    if (String(form.function_id) === value) set('function_id', null)
    load()
  })
  const removeDepartment = (value: string) => run(async () => {
    if (!confirm('Remove this department?')) return
    await api.del(`/organizations/departments/${value}`)
    if (String(form.department_id) === value) set('department_id', null)
    load()
  })

  const removeTask = (t: Task) => run(async () => {
    if (!confirm(`Permanently delete ${t.code} — "${t.title}"? This cannot be undone.`)) return
    await api.del(`/tasks/${t.id}/permanent`)
    setMsg(`Permanently deleted ${t.code}`)
    load()
  })

  // ---------------------------------------------------------------- Quick "create manager" from inside the Reports To search
  const quickCreatedUser = (u: User) => {
    setUsers((prev) => [...prev, u])          // so the new manager shows up immediately, without a full reload
    set('reports_to_id', u.id)
    setShowQuickUser(false)
    setMsg(`Created ${u.name} and set as manager`)
  }

  const byManager = groupByManager(users)
  const roots = byManager.get(null) ?? []
  const unassignedCount = users.filter((u) => u.reports_to_id != null && !users.some((m) => m.id === u.reports_to_id)).length

  // Reports To options exclude the user currently being edited (can't report to self)
  const managerItems = users
    .filter((u) => u.id !== editing?.id)
    .map((u) => ({ value: String(u.id), label: `${u.name} — ${label(u.role)}` }))

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Admin Panel</h1>
          <div className="crumb">User management &amp; enterprise task administration</div>
        </div>
      </div>

      {msg && <div className="alert success" role="status">{msg}</div>}
      {pageErr && <div className="alert error" role="alert">{pageErr}</div>}

      <div className="row mb">
        <button className={`btn ${tab === 'users' ? 'primary' : ''}`} onClick={() => setTab('users')}>Users ({users.length})</button>
        <button className={`btn ${tab === 'tasks' ? 'primary' : ''}`} onClick={() => setTab('tasks')}>All Tasks ({tasks.length})</button>
        <button className={`btn ${tab === 'roles' ? 'primary' : ''}`} onClick={() => setTab('roles')}>Privileged Roles</button>
        <button className={`btn ${tab === 'hierarchy' ? 'primary' : ''}`} onClick={() => setTab('hierarchy')}>Hierarchy Mapping</button>
        <button className={`btn ${tab === 'emails' ? 'primary' : ''}`} onClick={() => setTab('emails')}>System Emails</button>
        <button className={`btn ${tab === 'duplicates' ? 'primary' : ''}`} onClick={() => setTab('duplicates')}>Duplicates</button>
      </div>

      {tab === 'duplicates' && (
        <DuplicatesPanel
          companies={companies} functions={functions} departments={departments}
          tasks={tasks} projects={projects} users={users} onDone={load}
        />
      )}

      {tab === 'emails' && (
        <div className="card" style={{ padding: 0 }}>
          <div className="section-title" style={{ margin: '14px 0 0 14px' }}>Automated Email Dispatch Log</div>
          <div className="small muted" style={{ margin: '0 0 12px 14px' }}>
            A historical record of all automated notifications sent by the system scheduler. Used to verify deduplication.
          </div>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Target Reference</th>
                <th>Title / Description</th>
                <th>Recipients</th>
                <th>Sent On</th>
              </tr>
            </thead>
            <tbody>
              {emailLogs.map((log) => (
                <tr key={log.id}>
                  <td>
                    <span className={`badge ${log.email_type === 'overdue' || log.email_type === 'stale' ? 'red' : log.email_type === 'completed' ? 'green' : 'gold'}`}>
                      {label(log.email_type)}
                    </span>
                  </td>
                  <td className="small font-mono">
                    {log.entity_code ?? `${log.entity_type === 'backlog' ? 'Backlog' : 'Task'} #${log.entity_id}`}
                  </td>
                  <td className="small muted">{log.entity_title ?? '—'}</td>
                  <td className="small muted">{log.recipients || '—'}</td>
                  <td className="small">{fmtDate(log.sent_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {emailLogs.length === 0 && <div className="empty">No emails have been dispatched by the system yet.</div>}
        </div>
      )}

      {tab === 'hierarchy' && (
        <>
          <div className="card mb">
            <div className="section-title" style={{ marginTop: 0 }}>Organization chart</div>
            <div className="small muted" style={{ marginBottom: 12 }}>
              Click <strong>Edit</strong> on any person to change their manager — it uses the same user form as the Users tab, so nothing else changes.
            </div>
            {roots.length === 0 && <div className="empty">No one has "reports to" left empty — set at least one top-level user (e.g. the CEO) to see the tree.</div>}
            {roots.map((r) => (
              <OrgTreeNode key={r.id} user={r} byManager={byManager} depth={0} onEdit={openEdit} />
            ))}
            {unassignedCount > 0 && (
              <div className="small" style={{ color: 'var(--red)', marginTop: 12 }}>
                {unassignedCount} user(s) report to someone who no longer exists — please re-check their manager.
              </div>
            )}
          </div>

          <div className="card" style={{ padding: 0 }}>
            <div className="section-title" style={{ margin: '14px 0 0 14px' }}>Detail table</div>
            <table>
              <thead>
                <tr><th>Employee</th><th>Role</th><th>Reports To</th><th>Full Chain</th></tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const manager = users.find((m) => m.id === u.reports_to_id)
                  const chain = reportingChain(users, u.id)
                  return (
                    <tr key={u.id}>
                      <td>{u.name}</td>
                      <td><span className={`badge ${u.role === 'admin' ? 'gold' : 'gray'}`}>{label(u.role)}</span></td>
                      <td className="small">{manager ? manager.name : '—'}</td>
                      <td className="small muted">{chain.map((c) => c.name).join(' → ')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'roles' && (
        <div className="card">
          <div className="section-title" style={{ marginTop: 0 }}>Privileged Roles</div>
          <div className="small muted" style={{ marginBottom: 12 }}>
            These roles can view all group-wide tasks and approve date-revision / completion requests.
          </div>
          <div className="row mb" style={{ flexWrap: 'wrap' }}>
            {privileged.map((r) => (
              <span key={r} className="badge gold" style={{ padding: '6px 12px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {label(r)}
                {r !== 'admin' && (
                  <span style={{ cursor: 'pointer', fontWeight: 700 }} onClick={() => removeRole(r)} title="Remove">✕</span>
                )}
              </span>
            ))}
          </div>
          <div className="row" style={{ alignItems: 'end' }}>
            <div className="field" style={{ minWidth: 260 }}>
              <label>Add role</label>
              <SearchableSelect
                value={newRole}
                items={allRoles.map((r) => ({ value: r, label: label(r) }))}
                onChange={(v) => setNewRole(v)}
                placeholder="Search or type new role…"
                allowCustom
              />
            </div>
            <button className="btn primary" onClick={addRole}>Add Role</button>
          </div>
          <div className="small muted" style={{ marginTop: 12 }}>
            Available roles: {allRoles.filter((r) => !privileged.includes(r)).map(label).join(', ') || 'all roles are privileged'}
          </div>
        </div>
      )}

      {tab === 'users' && (
        <>
          <div className="mb">
            <button className="btn primary" onClick={openCreate}>+ New User</button>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr><th>ID</th><th>Name</th><th>Email</th><th>Designation</th><th>Role</th><th>Active</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="muted small">{u.employee_id}</td>
                    <td>
                      {u.name}
                      {u.pending_manager_employee_id && (
                        <div className="small muted" title="Linked automatically when a user with this Employee ID joins">
                          Waiting for manager {u.pending_manager_employee_id}
                        </div>
                      )}
                    </td>
                    <td className="small">{u.email}</td>
                    <td className="small">{u.designation ?? '—'}</td>
                    <td>
                      <span className={`badge ${u.role === 'admin' ? 'gold' : 'gray'}`}>{label(u.role)}</span>
                      {u.role === 'coo' && (
                        <div className="small muted">{(u.sbu_ids ?? []).map((id) => sbuName(companies, id) ?? `SBU #${id}`).join(', ') || 'No SBU assigned'}</div>
                      )}
                    </td>
                    <td>{u.is_active ? <span className="badge green">Active</span> : <span className="badge red">Inactive</span>}</td>
                    <td>
                      <div className="row">
                        <button className="btn sm" onClick={() => openEdit(u)}>Edit</button>
                        {u.role !== 'admin' && (
                          <>
                            {u.is_active && <button className="btn sm danger" onClick={() => deactivate(u)} onBlur={() => setConfirmDeactivate((id) => (id === u.id ? null : id))}>{confirmDeactivate === u.id ? 'Click again to confirm' : 'Deactivate'}</button>}
                            <button className="btn sm danger" onClick={() => removeUser(u)}>Remove</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'tasks' && (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr><th>Code</th><th>Task</th><th>Project</th><th>Responsible</th><th>Status</th><th>Due</th><th>Action</th></tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td className="muted small">{t.code}</td>
                  <td>{t.title}</td>
                  <td className="small">{projectName(t.project_id)}</td>
                  <td className="small">{users.find((u) => u.id === t.responsible_id)?.name ?? '—'}</td>
                  <td><span className="badge gray">{label(t.status)}</span></td>
                  <td className="small">{fmtDate(t.approved_due_date || t.baseline_due_date)}</td>
                  <td><button className="btn sm danger" onClick={() => removeTask(t)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {tasks.length === 0 && <div className="empty">No tasks.</div>}
        </div>
      )}

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editing ? `Edit User — ${editing.name}` : 'New User'}</h2>
            {err && <div className="badge red" style={{ marginBottom: 12 }}>{err}</div>}
            <div className="form-row">
              <div><label>Employee ID *</label><input value={form.employee_id} onChange={(e) => set('employee_id', e.target.value)} /></div>
              <div><label>Name *</label><input value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
            </div>
            <div className="form-row">
              <div><label>Email *</label><input value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
              <div><label>Designation</label><input value={form.designation} onChange={(e) => set('designation', e.target.value)} /></div>
            </div>
            <div className="form-row">
              <div>
                <label>SBU</label>
                <SbuSelect
                  value={form.company_id != null ? String(form.company_id) : ''}
                  companies={companies}
                  onChange={(v) => set('company_id', v ? Number(v) : null)}
                  placeholder="Search SBU…"
                  onAddNew={() => setShowOrgModal('company')}
                  addLabel="new SBU"
                  onRemove={removeCompany}
                />
              </div>
              <div>
                <label>Function</label>
                <SearchableSelect
                  value={form.function_id != null ? String(form.function_id) : ''}
                  items={functionItems}
                  onChange={(v) => set('function_id', v ? Number(v) : null)}
                  placeholder="Search function…"
                  onAddNew={() => setShowOrgModal('function')}
                  addLabel="new function"
                  onRemove={removeFunction}
                />
              </div>
            </div>
            <div className="form-row">
              <div>
                <label>Department</label>
                <SearchableSelect
                  value={form.department_id != null ? String(form.department_id) : ''}
                  items={departmentItems}
                  onChange={(v) => set('department_id', v ? Number(v) : null)}
                  placeholder="Search department…"
                  onAddNew={() => setShowOrgModal('department')}
                  addLabel="new department"
                  onRemove={removeDepartment}
                />
              </div>
              <div>
                <label>Reports To (manager)</label>
                <SearchableSelect
                  value={form.reports_to_id != null ? String(form.reports_to_id) : ''}
                  items={managerItems}
                  onChange={(v) => set('reports_to_id', v ? Number(v) : null)}
                  placeholder="Search employee by name…"
                  onAddNew={() => setShowQuickUser(true)}
                  addLabel="new user"
                />
              </div>
            </div>
            <label>Role</label>
            <select value={form.role} onChange={(e) => set('role', e.target.value)}>
              {allRoles.map((r) => <option key={r} value={r}>{label(r)}</option>)}
            </select>
            {form.role === 'coo' && (
              <>
                <label>SBUs overseen *</label>
                <div className="small muted" style={{ marginBottom: 6 }}>
                  The COO sees and manages every project and task of these SBUs, and can approve their requests.
                </div>
                <div className="row" style={{ flexWrap: 'wrap', marginBottom: 6 }}>
                  {form.sbu_ids.map((id) => (
                    <span key={id} className="badge gold" style={{ padding: '6px 12px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      {sbuName(companies, id) ?? `SBU #${id}`}
                      <span style={{ cursor: 'pointer', fontWeight: 700 }} title="Remove"
                        onClick={() => setForm((f) => ({ ...f, sbu_ids: f.sbu_ids.filter((x) => x !== id) }))}>✕</span>
                    </span>
                  ))}
                </div>
                <SbuSelect
                  value=""
                  companies={companies}
                  onChange={addSbu}
                  placeholder="Add an SBU…"
                />
              </>
            )}
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn primary" onClick={saveUser}>{editing ? 'Save Changes' : 'Create User'}</button>
            </div>
          </div>
        </div>
      )}

      {showOrgModal && (
        <OrgModal kind={showOrgModal} onClose={() => setShowOrgModal(null)} onCreated={(o) => createdOrg(showOrgModal, o)} />
      )}

      {showQuickUser && (
        <QuickUserModal onClose={() => setShowQuickUser(false)} onCreated={quickCreatedUser} allRoles={allRoles} />
      )}
    </div>
  )
}

function OrgModal({ kind, onClose, onCreated }: { kind: 'company' | 'function' | 'department'; onClose: () => void; onCreated: (o: any) => void }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const titles = { company: 'New SBU', function: 'New Function', department: 'New Department' }

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

// ---------------------------------------------------------------- Quick-create-user modal
// Opened from inside "Reports To (manager)" search when the desired manager
// isn't in the list yet — lets the admin create them without losing the
// New/Edit User form they were already filling in.
function QuickUserModal({
  onClose, onCreated, allRoles,
}: {
  onClose: () => void
  onCreated: (u: User) => void
  allRoles: string[]
}) {
  const [employeeId, setEmployeeId] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('employee')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!employeeId.trim() || !name.trim() || !email.trim()) {
      setErr('Employee ID, name and email are required')
      return
    }
    setBusy(true)
    setErr('')
    try {
      const u = await api.post<User>('/organizations/users', {
        employee_id: employeeId.trim(),
        name: name.trim(),
        email: email.trim(),
        role,
      })
      onCreated(u)
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 440 }} onClick={(e) => e.stopPropagation()}>
        <h2>New User (as manager)</h2>
        <div className="small muted" style={{ marginBottom: 12 }}>
          Create a minimal user record — you can add company/department/designation later by editing them from the Users tab.
        </div>
        {err && <div className="badge red" style={{ marginBottom: 12 }}>{err}</div>}
        <label>Employee ID *</label>
        <input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} autoFocus />
        <label>Name *</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
        <label>Email *</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} />
        <label>Role</label>
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          {allRoles.map((r) => <option key={r} value={r}>{label(r)}</option>)}
        </select>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Create User'}</button>
        </div>
      </div>
    </div>
  )
}