import { useEffect, useState } from 'react'
import { api } from '../api'
import SearchableSelect from './SearchableSelect'
import SbuSelect, { isPendingSbu } from './SbuSelect'

// The sign-up form, shared by the Sign Up page and "Add new employee" (e.g. on a
// project's Associated People), so both save exactly the same way: role is always
// employee (an admin can change it), no password - they get an email with a link
// to set it. A typed-in function / department is added to the lists, and a manager
// may be given by Employee ID (linked now, or when that manager joins).

interface Option { id: number; name: string }
interface SignupOptions { companies: Option[]; functions: Option[]; departments: Option[]; users: Option[] }

const EMPTY = { employee_id: '', name: '', email: '', designation: '', company_id: '', function_id: '', department_id: '', reports_to_id: '' }

interface Props {
  /** after the account is created: the server's message and the new Employee ID */
  onSuccess: (message: string, employeeId: string) => void
  /** someone logged in is adding another person (wording; a missing SBU can then be created) */
  forOther?: boolean
  submitLabel?: string
  onCancel?: () => void
}

export default function SignupForm({ onSuccess, forOther = false, submitLabel = 'Sign Up', onCancel }: Props) {
  const [form, setForm] = useState(EMPTY)
  const [opts, setOpts] = useState<SignupOptions>({ companies: [], functions: [], departments: [], users: [] })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.get<SignupOptions>('/auth/signup-options').then(setOpts).catch(() => {})
  }, [])

  const set = (k: keyof typeof EMPTY, v: string) => setForm((f) => ({ ...f, [k]: v }))
  // picked items are tagged "id:<n>" so typed text (e.g. a numeric Employee ID) is never taken for one
  const items = (list: Option[]) => list.map((o) => ({ value: `id:${o.id}`, label: o.name }))
  // typed in with "+ Add" rather than picked from the list
  const isNew = (v: string) => v.trim() !== '' && !v.startsWith('id:')
  const asTyped = (v: string) => v
  const their = forOther ? 'their' : 'your'
  const they = forOther ? 'they' : 'you'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation() // may sit inside another form / modal
    setError('')
    if (!form.name.trim() || !form.email.trim() || !form.employee_id.trim()) { setError('Name, email and employee id are required'); return }
    const num = (v: string) => (v.startsWith('id:') ? Number(v.slice(3)) : null)
    setBusy(true)
    try {
      const res = await api.post<{ message: string }>('/auth/signup', {
        employee_id: form.employee_id.trim(),
        name: form.name.trim(),
        email: form.email.trim(),
        designation: form.designation.trim() || null,
        // an SBU not in the database yet can't be linked from here - an admin sets it later
        company_id: form.company_id && !isPendingSbu(form.company_id) ? Number(form.company_id) : null,
        function_id: num(form.function_id),
        department_id: num(form.department_id),
        reports_to_id: num(form.reports_to_id),
        // typed in rather than picked: added to the lists / looked up by the server
        new_function: isNew(form.function_id) ? form.function_id.trim() : null,
        new_department: isNew(form.department_id) ? form.department_id.trim() : null,
        reports_to_employee_id: isNew(form.reports_to_id) ? form.reports_to_id.trim() : null,
      })
      const employeeId = form.employee_id.trim()
      setForm(EMPTY)
      onSuccess(res.message, employeeId)
    } catch (err: any) {
      setError(err.message || 'Sign up failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="alert error" role="alert">{error}</div>}

      <div className="form-row">
        <div><label>Employee ID *</label><input value={form.employee_id} onChange={(e) => set('employee_id', e.target.value)} autoFocus /></div>
        <div><label>Name *</label><input value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
      </div>
      <div className="form-row">
        <div><label>Email *</label><input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
        <div><label>Designation</label><input value={form.designation} onChange={(e) => set('designation', e.target.value)} /></div>
      </div>
      <div className="form-row">
        <div>
          <label>SBU</label>
          <SbuSelect value={form.company_id} companies={opts.companies} onChange={(v) => set('company_id', v)} canCreate={forOther} />
          {isPendingSbu(form.company_id) && (
            <div className="small muted" style={{ marginTop: 4 }}>This SBU isn't set up yet - your admin will assign it to {their} account.</div>
          )}
        </div>
        <div>
          <label>Function</label>
          <SearchableSelect value={form.function_id} items={items(opts.functions)} onChange={(v) => set('function_id', v)} placeholder="Search or type a new function…" allowCustom customLabel={asTyped} />
          {isNew(form.function_id) && <div className="small muted" style={{ marginTop: 4 }}>New function - it will be added to the list.</div>}
        </div>
      </div>
      <div className="form-row">
        <div>
          <label>Department</label>
          <SearchableSelect value={form.department_id} items={items(opts.departments)} onChange={(v) => set('department_id', v)} placeholder="Search or type a new department…" allowCustom customLabel={asTyped} />
          {isNew(form.department_id) && <div className="small muted" style={{ marginTop: 4 }}>New department - it will be added to the list.</div>}
        </div>
        <div>
          <label>Reports To (manager)</label>
          <SearchableSelect value={form.reports_to_id} items={items(opts.users)} onChange={(v) => set('reports_to_id', v)} placeholder="Search name, or type manager's Employee ID…" allowCustom customLabel={asTyped} />
          <div className="small muted" style={{ marginTop: 4 }}>
            {isNew(form.reports_to_id)
              ? `Manager's Employee ID: ${form.reports_to_id.trim()}. If they have no account yet, ${they}'ll be linked to them when they join.`
              : 'Manager not in the list? Type their Employee ID and press Enter.'}
          </div>
        </div>
      </div>

      {onCancel ? (
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Creating account…' : submitLabel}</button>
        </div>
      ) : (
        <button type="submit" className="btn primary mt" style={{ width: '100%', padding: '10px', justifyContent: 'center' }} disabled={busy}>
          {busy ? 'Creating account…' : submitLabel}
        </button>
      )}
    </form>
  )
}
