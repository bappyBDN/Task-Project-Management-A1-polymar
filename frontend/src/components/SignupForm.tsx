import { useEffect, useState } from 'react'
import { api } from '../api'
import SearchableSelect from './SearchableSelect'
import PasswordInput from './PasswordInput'
import { isPendingSbu } from './SbuSelect'
import SbuMultiSelect from './SbuMultiSelect'
import InviteUserModal from './InviteUserModal'

// The sign-up form, shared by the Sign Up page and "Add new employee" (e.g. on a
// project's Associated People), so both save exactly the same way: role is always
// employee (an admin can change it). Signing up yourself, you choose your password
// here and no email is sent; added by someone else (forOther), there is no password -
// they get an email with a link to set it. A typed-in function / department is added
// to the lists, and a manager may be given by Employee ID (linked now, or when that
// manager joins).

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
  // an invitation email links to /signup?email=... : start with that email filled in
  const [form, setForm] = useState(() => (forOther ? EMPTY : { ...EMPTY, email: new URLSearchParams(window.location.search).get('email') ?? '' }))
  const [opts, setOpts] = useState<SignupOptions>({ companies: [], functions: [], departments: [], users: [] })
  // every SBU picked (company ids, or a pending value for one not in the database yet)
  const [sbus, setSbus] = useState<string[]>([])
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
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
  // Reports To: picked from the list ("id:<n>") or, with "+ Add new user", a manager known
  // only by email ("email:<address>") - the server adds and invites them on sign-up
  const [addingManager, setAddingManager] = useState(false)
  const managerEmail = form.reports_to_id.startsWith('email:') ? form.reports_to_id.slice(6) : ''
  const managerItems = managerEmail
    ? [{ value: form.reports_to_id, label: `${managerEmail} (will be invited)` }, ...items(opts.users)]
    : items(opts.users)
  const their = forOther ? 'their' : 'your'
  const they = forOther ? 'they' : 'you'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation() // may sit inside another form / modal
    setError('')
    if (!form.name.trim() || !form.email.trim() || !form.employee_id.trim()) { setError('Name, email and employee id are required'); return }
    if (managerEmail && managerEmail.toLowerCase() === form.email.trim().toLowerCase()) { setError(`${forOther ? 'Their' : 'Your'} manager's email can't be ${their} own.`); return }
    if (!forOther) {
      if (password.length < 6) { setError('Password must be at least 6 characters'); return }
      if (password !== confirmPassword) { setError('Passwords do not match'); return }
    }
    const num = (v: string) => (v.startsWith('id:') ? Number(v.slice(3)) : null)
    // an SBU not in the database yet can't be linked from here - an admin sets it later
    const companyIds = sbus.filter((v) => !isPendingSbu(v)).map(Number)
    setBusy(true)
    try {
      const res = await api.post<{ message: string }>('/auth/signup', {
        employee_id: form.employee_id.trim(),
        name: form.name.trim(),
        email: form.email.trim(),
        designation: form.designation.trim() || null,
        company_id: companyIds[0] ?? null,
        company_ids: companyIds,
        function_id: num(form.function_id),
        department_id: num(form.department_id),
        reports_to_id: num(form.reports_to_id),
        // typed in rather than picked: added to the lists / looked up by the server
        new_function: isNew(form.function_id) ? form.function_id.trim() : null,
        new_department: isNew(form.department_id) ? form.department_id.trim() : null,
        reports_to_email: managerEmail || null,
        password: forOther ? null : password,
      })
      const employeeId = form.employee_id.trim()
      setForm(EMPTY)
      setSbus([])
      setPassword('')
      setConfirmPassword('')
      onSuccess(res.message, employeeId)
    } catch (err: any) {
      setError(err.message || 'Sign up failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
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
          <SbuMultiSelect values={sbus} companies={opts.companies} onChange={setSbus} canCreate={forOther} />
          {sbus.some(isPendingSbu) && (
            <div className="small muted" style={{ marginTop: 4 }}>
              {sbus.filter(isPendingSbu).map((v) => v.slice(v.indexOf(':') + 1)).join(', ')} isn't set up yet - your admin will assign it to {their} account.
            </div>
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
          <SearchableSelect value={form.reports_to_id} items={managerItems} onChange={(v) => set('reports_to_id', v)} placeholder="Search manager by name…"
            onAddNew={() => setAddingManager(true)} addLabel="new user" />
          <div className="small muted" style={{ marginTop: 4 }}>
            {managerEmail
              ? `${managerEmail} will get an email asking them to sign up, and ${they}'ll be linked to them.`
              : 'Manager not in the list? Choose "+ Add new user" and enter their email.'}
          </div>
        </div>
      </div>
      {!forOther && (
        <div className="form-row">
          <div><label>Password *</label><PasswordInput autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <div><label>Confirm Password *</label><PasswordInput autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></div>
        </div>
      )}

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
    {/* outside the <form>: a form cannot sit inside another one */}
    {addingManager && (
      <InviteUserModal title="Add Your Manager" onClose={() => setAddingManager(false)}
        onEmail={(email) => { set('reports_to_id', `email:${email}`); setAddingManager(false) }} />
    )}
    </>
  )
}
