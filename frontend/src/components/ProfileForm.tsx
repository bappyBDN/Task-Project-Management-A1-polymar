import { useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import type { Company, Department, Function, User } from '../types'
import { label } from '../constants'
import SbuSelect from './SbuSelect'
import SearchableSelect from './SearchableSelect'

// "Edit My Profile": the signed-in user edits their own details with the same
// fields as the admin's user form. Employee ID, email (the login) and role can
// only be changed by an admin, so for everyone else they are shown read-only
// (the server enforces this: PATCH /organizations/users/me ignores them).
// Closes only with Cancel, like the other forms.

export default function ProfileForm({ onClose, onSaved }: { onClose: () => void; onSaved: (msg: string) => void }) {
  const { user, setMe } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [companies, setCompanies] = useState<Company[]>([])
  const [functions, setFunctions] = useState<Function[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<string[]>([])
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    employee_id: user?.employee_id ?? '',
    name: user?.name ?? '',
    email: user?.email ?? '',
    designation: user?.designation ?? '',
    company_id: user?.company_id ?? null as number | null,
    function_id: user?.function_id ?? null as number | null,
    department_id: user?.department_id ?? null as number | null,
    reports_to_id: user?.reports_to_id ?? null as number | null,
    role: user?.role ?? 'employee',
  })
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    api.get<Company[]>('/organizations/companies').then(setCompanies).catch(() => {})
    api.get<Function[]>('/organizations/functions').then(setFunctions).catch(() => {})
    api.get<Department[]>('/organizations/departments').then(setDepartments).catch(() => {})
    api.get<User[]>('/organizations/users').then(setUsers).catch(() => {})
    if (isAdmin) api.get<string[]>('/all-roles').then(setRoles).catch(() => {})
  }, [isAdmin])

  if (!user) return null

  const save = async () => {
    setErr('')
    if (!form.name.trim()) { setErr('Name is required'); return }
    if (isAdmin && (!form.email.trim() || !form.employee_id.trim())) { setErr('Employee ID and email are required'); return }
    if (form.reports_to_id === user.id) { setErr('You cannot report to yourself'); return }
    setSaving(true)
    try {
      const mine = {
        name: form.name.trim(),
        designation: form.designation.trim() || null,
        company_id: form.company_id,
        function_id: form.function_id,
        department_id: form.department_id,
        reports_to_id: form.reports_to_id,
      }
      // an admin uses the admin route, which can also change Employee ID, email and role
      const saved = isAdmin
        ? await api.patch<User>(`/organizations/users/${user.id}`, { ...mine, employee_id: form.employee_id.trim(), email: form.email.trim(), role: form.role })
        : await api.patch<User>('/organizations/users/me', mine)
      setMe({ ...user, ...saved })
      onSaved('Your profile was updated.')
    } catch (e: any) {
      setErr(e?.message || 'Could not save your profile.')
    } finally {
      setSaving(false)
    }
  }

  const adminOnly = isAdmin ? undefined : 'Only an admin can change this'
  const managerItems = users.filter((u) => u.id !== user.id && u.is_active !== false)
    .map((u) => ({ value: String(u.id), label: `${u.name} — ${label(u.role)}` }))
  // a department belongs to a function: once a function is chosen, list only its departments
  const deptItems = departments
    .filter((d) => !form.function_id || !d.function_id || d.function_id === form.function_id)
    .map((d) => ({ value: String(d.id), label: d.name }))

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxHeight: '92vh', overflowY: 'auto' }}>
        <h2>Edit My Profile</h2>
        {err && <div className="alert error" role="alert">{err}</div>}

        <div className="form-row">
          <div>
            <label>Employee ID *</label>
            <input value={form.employee_id} onChange={(e) => set('employee_id', e.target.value)} disabled={!isAdmin} title={adminOnly} />
          </div>
          <div>
            <label>Name *</label>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />
          </div>
        </div>
        <div className="form-row">
          <div>
            <label>Email *</label>
            <input value={form.email} onChange={(e) => set('email', e.target.value)} disabled={!isAdmin} title={adminOnly} />
          </div>
          <div>
            <label>Designation</label>
            <input value={form.designation} onChange={(e) => set('designation', e.target.value)} placeholder="e.g. Senior Engineer" />
          </div>
        </div>
        <div className="form-row">
          <div>
            <label>SBU</label>
            <SbuSelect
              value={form.company_id != null ? String(form.company_id) : ''}
              companies={companies}
              onChange={(v) => set('company_id', v ? Number(v) : null)}
              placeholder="Search SBU…"
            />
          </div>
          <div>
            <label>Function</label>
            <SearchableSelect
              value={form.function_id != null ? String(form.function_id) : ''}
              items={functions.map((f) => ({ value: String(f.id), label: f.name }))}
              onChange={(v) => setForm((f) => ({ ...f, function_id: v ? Number(v) : null, department_id: null }))}
              placeholder="Search function…"
            />
          </div>
        </div>
        <div className="form-row">
          <div>
            <label>Department</label>
            <SearchableSelect
              value={form.department_id != null ? String(form.department_id) : ''}
              items={deptItems}
              onChange={(v) => set('department_id', v ? Number(v) : null)}
              placeholder="Search department…"
            />
          </div>
          <div>
            <label>Reports To (manager)</label>
            <SearchableSelect
              value={form.reports_to_id != null ? String(form.reports_to_id) : ''}
              items={managerItems}
              onChange={(v) => set('reports_to_id', v ? Number(v) : null)}
              placeholder="Search employee by name…"
            />
          </div>
        </div>
        <label>Role</label>
        {isAdmin ? (
          <select value={form.role} onChange={(e) => set('role', e.target.value)}>
            {(roles.includes(form.role) ? roles : [form.role, ...roles]).map((r) => <option key={r} value={r}>{label(r)}</option>)}
          </select>
        ) : (
          <input value={label(form.role)} disabled title={adminOnly} />
        )}
        {!isAdmin && <div className="small muted" style={{ marginTop: 6 }}>Employee ID, email and role can only be changed by an admin.</div>}

        <div className="modal-actions">
          <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  )
}
