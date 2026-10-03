import { useEffect, useState } from 'react'
import { api } from '../api'
import type { User } from '../types'
import { label } from '../constants'
import InviteUserModal from './InviteUserModal'
import { fmtDateTime } from './CommentsPanel'

// Methodology approval on the project page (server: app/routers/methodology.py).
// The Project Manager adds the methodology document (a Google Drive / Docs link) and
// picks the Group Executive, Function Head and Team Lead approvers. Each approver opens
// the document and records Approve / Under Review / Reject with a note. Only the
// approvers, the Project Manager and admin / PMO can open the document or read the
// notes; everyone else sees who approves and the status.

type Decision = 'unassigned' | 'pending' | 'approved' | 'rejected' | 'review'

interface Slot {
  role: 'group_executive' | 'function_head' | 'team_lead'
  label: string
  approver_id: number | null
  approver_name: string | null
  decision: Decision
  note: string | null
  decided_at: string | null
  is_me: boolean
}

interface Methodology {
  project_id: number
  has_link: boolean
  doc_link: string | null
  link_updated_by_name: string | null
  link_updated_at: string | null
  status: 'not_started' | 'pending' | 'review' | 'rejected' | 'approved'
  approved_count: number
  total: number
  can_manage: boolean
  can_open: boolean
  approvals: Slot[]
}

const STATUS: Record<Methodology['status'], { text: string; badge: string }> = {
  not_started: { text: 'Awaiting document', badge: 'gray' },
  pending: { text: 'Pending approval', badge: 'gold' },
  review: { text: 'Changes requested', badge: 'amber' },
  rejected: { text: 'Rejected', badge: 'red' },
  approved: { text: 'Approved', badge: 'green' },
}

const DECISION: Record<Decision, { text: string; badge: string; color: string }> = {
  unassigned: { text: 'Not assigned', badge: 'gray', color: '#d5dbe4' },
  pending: { text: 'Pending', badge: 'gray', color: '#d5dbe4' },
  approved: { text: 'Approved', badge: 'green', color: 'var(--green)' },
  review: { text: 'Under Review', badge: 'amber', color: 'var(--warn, #b7791f)' },
  rejected: { text: 'Rejected', badge: 'red', color: 'var(--red)' },
}

const CHOICES: { value: 'approved' | 'review' | 'rejected'; text: string; badge: string }[] = [
  { value: 'approved', text: '✓ Approve', badge: 'green' },
  { value: 'review', text: '↻ Under Review', badge: 'amber' },
  { value: 'rejected', text: '✕ Reject', badge: 'red' },
]

// the user role that usually fills each slot (listed first in the picker)
const SUGGESTED_ROLE: Record<Slot['role'], string> = {
  group_executive: 'group_executive', function_head: 'functional_head', team_lead: 'team_lead',
}

const CSS = `
.mth-steps{display:flex;gap:4px;margin:10px 0 4px}
.mth-steps span{flex:1;height:6px;border-radius:999px}
.mth-doc{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:12px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#fafbfd}
.mth-doc-open{display:inline-flex;align-items:center;gap:8px;text-decoration:none;font-weight:600;color:var(--navy)}
.mth-doc-open:hover{text-decoration:underline}
.mth-slot{padding:12px 0;border-top:1px solid var(--line)}
.mth-slot:first-of-type{border-top:0}
.mth-slot-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap}
.mth-role{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
.mth-name{font-weight:600;margin-top:2px;overflow-wrap:anywhere}
.mth-you{font-size:10.5px;font-weight:700;background:var(--gold-soft);color:#8a6d1f;border-radius:999px;padding:1px 7px;margin-left:6px}
.mth-note{margin-top:8px;padding:8px 10px;background:#f4f6fa;border-left:3px solid var(--gold);border-radius:4px;font-size:12.5px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.45}
.mth-box{margin-top:10px;padding:10px;border:1px solid var(--line);border-radius:10px;background:#fff}
.mth-choices{display:flex;gap:6px;flex-wrap:wrap}
.mth-choice{flex:1;min-width:110px;padding:7px 8px;border-radius:8px;border:1px solid var(--line);background:#fff;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;color:var(--muted)}
.mth-choice.on.green{background:#e3f5ea;border-color:var(--green);color:var(--green)}
.mth-choice.on.amber{background:#fdf3d7;border-color:#e3b341;color:var(--warn,#b7791f)}
.mth-choice.on.red{background:#fbe5e5;border-color:var(--red);color:var(--red)}
.mth-link{background:none;border:0;padding:0;font:inherit;font-size:12px;font-weight:600;color:var(--navy);cursor:pointer;text-decoration:underline}
.mth-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:8px;flex-wrap:wrap}
.mth-trigger{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;box-sizing:border-box;padding:8px 11px;border:1px solid var(--line);border-radius:8px;background:#fff;font:inherit;font-size:13px;cursor:pointer;text-align:left;min-height:38px}
.mth-trigger:hover{border-color:#c8d2e0}
.mth-menu{margin-top:6px;border:1px solid var(--line);border-radius:10px;background:#fff;box-shadow:0 8px 24px rgba(16,30,54,.10);overflow:hidden}
.mth-menu input{border:0;border-bottom:1px solid var(--line);border-radius:0;width:100%;box-sizing:border-box;padding:9px 12px;font:inherit;font-size:13px}
.mth-menu input:focus{box-shadow:none}
.mth-opts{max-height:280px;overflow-y:auto}
.mth-group{padding:7px 12px 4px;font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);background:#fafbfd;border-top:1px solid var(--line)}
.mth-opt{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;padding:8px 12px;border:0;background:#fff;font:inherit;text-align:left;cursor:pointer}
.mth-opt:hover{background:#f5f7fb}
.mth-opt.on{background:var(--gold-soft)}
.mth-opt-name{display:block;font-size:13px;font-weight:600;overflow-wrap:anywhere}
.mth-opt-sub{display:block;font-size:11.5px;color:var(--muted);overflow-wrap:anywhere}
.mth-add{color:#8a6d1f;font-weight:600;font-size:13px;background:var(--gold-soft)}
.mth-add:hover{background:#ebdcb9}
`

export default function MethodologyApproval({ projectId, users, reloadUsers }: {
  projectId: number; users: User[]; reloadUsers: () => Promise<User[]>
}) {
  const [data, setData] = useState<Methodology | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [msg, setMsg] = useState('')

  const load = () => {
    setLoadErr('')
    api.get<Methodology>(`/methodology/${projectId}`).then(setData).catch((e) => setLoadErr(e.message || 'Could not load the methodology approval.'))
  }
  useEffect(load, [projectId])

  const saved = (d: Methodology, text: string) => { setData(d); setMsg(text) }

  if (!data) {
    return (
      <div className="card mt">
        <div className="section-title" style={{ marginTop: 0 }}>Methodology Approval</div>
        {loadErr ? <div className="small" style={{ color: 'var(--red)' }}>{loadErr} <button className="btn sm" onClick={load}>Retry</button></div>
          : <div className="small muted">Loading…</div>}
      </div>
    )
  }

  const st = STATUS[data.status]
  return (
    <div className="card mt">
      <style>{CSS}</style>
      <div className="row spread" style={{ flexWrap: 'wrap', gap: 6 }}>
        <div className="section-title" style={{ margin: 0 }}>Methodology Approval</div>
        <span className={`badge ${st.badge}`}>{st.text}</span>
      </div>
      <div className="mth-steps" aria-hidden>
        {data.approvals.map((a) => <span key={a.role} style={{ background: DECISION[a.decision].color }} title={`${a.label}: ${DECISION[a.decision].text}`} />)}
      </div>
      <div className="small muted">{data.approved_count} of {data.total} approved · Group Executive, Function Head and Team Lead</div>

      {msg && <div className="alert success mt" role="status">{msg}</div>}

      <DocumentLink data={data} onSaved={saved} />

      <div style={{ marginTop: 6 }}>
        {data.approvals.map((a) => (
          <ApproverSlot key={a.role} slot={a} data={data} users={users} reloadUsers={reloadUsers} onSaved={saved} />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- document link
function DocumentLink({ data, onSaved }: { data: Methodology; onSaved: (d: Methodology, msg: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const anyDecided = data.approvals.some((a) => ['approved', 'review', 'rejected'].includes(a.decision))

  const save = async (value: string | null) => {
    const v = (value ?? '').trim()
    if (value !== null && !/^https?:\/\/\S+$/i.test(v)) { setErr('Paste the full link, starting with https://'); return }
    setBusy(true); setErr('')
    try {
      const d = await api.patch<Methodology>(`/methodology/${data.project_id}/link`, { doc_link: value === null ? null : v })
      setEditing(false)
      onSaved(d, value === null ? 'Methodology document removed.'
        : d.approvals.some((a) => a.approver_id) ? 'Document saved. The approvers have been asked to review it.' : 'Document saved. Now choose the approvers below.')
    } catch (e: any) {
      setErr(e.message || 'Could not save the link.')
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <div className="mth-box">
        <label style={{ marginTop: 0 }}>Methodology document link</label>
        <input type="url" autoFocus value={link} onChange={(e) => setLink(e.target.value)} disabled={busy}
          placeholder="https://docs.google.com/document/d/…" onKeyDown={(e) => { if (e.key === 'Enter') save(link) }} />
        <div className="small muted" style={{ marginTop: 4 }}>
          Paste a Google Drive or Google Docs share link, and share the file with the approvers in Google Drive.
          {anyDecided && <b> Changing the link sends the methodology back to every approver for a fresh approval.</b>}
        </div>
        {err && <div className="alert error mt" role="alert">{err}</div>}
        <div className="mth-actions">
          {data.has_link && <button className="btn sm danger" onClick={() => save(null)} disabled={busy} style={{ marginRight: 'auto' }}>Remove link</button>}
          <button className="btn sm" onClick={() => { setEditing(false); setErr('') }} disabled={busy}>Cancel</button>
          <button className="btn sm primary" onClick={() => save(link)} disabled={busy || !link.trim()}>{busy ? 'Saving…' : 'Save Link'}</button>
        </div>
      </div>
    )
  }

  const startEdit = () => { setLink(data.doc_link ?? ''); setErr(''); setEditing(true) }
  return (
    <div className="mth-doc">
      <div style={{ minWidth: 0 }}>
        {data.has_link && data.can_open && data.doc_link ? (
          <a className="mth-doc-open" href={data.doc_link} target="_blank" rel="noopener noreferrer">
            <DocIcon /> Open Methodology Document ↗
          </a>
        ) : data.has_link ? (
          <span className="small" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <DocIcon /> 🔒 Only the approvers and the Project Manager can open the document.
          </span>
        ) : (
          <span className="small muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <DocIcon /> No methodology document yet{data.can_manage ? '' : ' — the Project Manager will add it'}.
          </span>
        )}
        {data.has_link && data.link_updated_at && (
          <div className="small muted" style={{ marginTop: 3, fontSize: 11 }}>
            Updated {fmtDateTime(data.link_updated_at)}{data.link_updated_by_name ? ` by ${data.link_updated_by_name}` : ''}
          </div>
        )}
      </div>
      {data.can_manage && (
        <button className={`btn sm ${data.has_link ? '' : 'primary'}`} onClick={startEdit}>
          {data.has_link ? 'Edit link' : '+ Add document link'}
        </button>
      )}
    </div>
  )
}

function DocIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" />
    </svg>
  )
}

// ---------------------------------------------------------------- one approver
function ApproverSlot({ slot, data, users, reloadUsers, onSaved }: {
  slot: Slot; data: Methodology; users: User[]; reloadUsers: () => Promise<User[]>
  onSaved: (d: Methodology, msg: string) => void
}) {
  const [mode, setMode] = useState<'view' | 'assign' | 'decide'>('view')
  const d = DECISION[slot.decision]
  const decided = ['approved', 'review', 'rejected'].includes(slot.decision)

  return (
    <div className="mth-slot">
      <div className="mth-slot-head">
        <div style={{ minWidth: 0 }}>
          <div className="mth-role">{slot.label}</div>
          <div className="mth-name">
            {slot.approver_name ?? <span className="muted" style={{ fontWeight: 400 }}>Not assigned</span>}
            {slot.is_me && <span className="mth-you">You</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span className={`badge ${d.badge}`}>{d.text}</span>
          {decided && slot.decided_at && <div className="small muted" style={{ fontSize: 11, marginTop: 3 }}>{fmtDateTime(slot.decided_at)}</div>}
        </div>
      </div>

      {slot.note && (
        <div className="mth-note"><b style={{ fontSize: 11, color: 'var(--muted)' }}>{decided ? 'NOTE / FINDINGS' : 'EARLIER NOTE'}</b><br />{slot.note}</div>
      )}

      {mode === 'view' && (
        <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
          {slot.is_me && data.has_link && (
            <button className="btn sm primary" onClick={() => setMode('decide')}>{decided ? 'Update my decision' : 'Review & decide'}</button>
          )}
          {slot.is_me && !data.has_link && <span className="small muted">You can decide once the Project Manager adds the document.</span>}
          {data.can_manage && (
            <button className="mth-link" onClick={() => setMode('assign')}>{slot.approver_id ? 'Change approver' : `+ Assign ${slot.label}`}</button>
          )}
        </div>
      )}
      {mode === 'assign' && <AssignForm slot={slot} data={data} users={users} reloadUsers={reloadUsers} onDone={(nd, m) => { setMode('view'); if (nd) onSaved(nd, m) }} />}
      {mode === 'decide' && <DecisionForm slot={slot} data={data} onDone={(nd, m) => { setMode('view'); if (nd) onSaved(nd, m) }} />}
    </div>
  )
}

function AssignForm({ slot, data, users, reloadUsers, onDone }: {
  slot: Slot; data: Methodology; users: User[]; reloadUsers: () => Promise<User[]>
  onDone: (d: Methodology | null, msg: string) => void
}) {
  const [userId, setUserId] = useState(slot.approver_id ? String(slot.approver_id) : '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [addingEmployee, setAddingEmployee] = useState(false)
  // someone just added may not be in `users` until the parent re-renders
  const [added, setAdded] = useState<User | null>(null)

  const pool = (added && !users.some((u) => u.id === added.id) ? [...users, added] : users).filter((u) => u.is_active !== false) // the users API may omit is_active

  const employeeAdded = (u: User) => {
    setAddingEmployee(false); setErr('')
    setAdded(u); setUserId(String(u.id))
    setInfo(`${u.name} is selected - press Save to make them the ${slot.label} approver.`)
    reloadUsers().catch(() => {})
  }

  const save = async (id: string | null) => {
    if (id !== null && !id) { setErr('Choose the employee.'); return }
    setBusy(true); setErr('')
    try {
      const d = await api.patch<Methodology>(`/methodology/${data.project_id}/approvers/${slot.role}`, { approver_id: id === null ? null : Number(id) })
      const name = pool.find((u) => String(u.id) === id)?.name
      onDone(d, id === null ? `${slot.label} approver removed.`
        : `${name ?? 'The employee'} is now the ${slot.label} approver${d.has_link ? ' and has been asked to review the document' : ''}.`)
    } catch (e: any) {
      setErr(e.message || 'Could not save the approver.')
      setBusy(false)
    }
  }

  return (
    <div className="mth-box">
      <label style={{ marginTop: 0 }}>{slot.label} approver</label>
      <ApproverPicker slot={slot} users={pool} value={userId} onChange={setUserId}
        onAddNew={() => { setInfo(''); setAddingEmployee(true) }} />
      {slot.decision !== 'unassigned' && slot.decision !== 'pending' && <div className="small" style={{ marginTop: 4, color: 'var(--warn, #b7791f)' }}>Changing the approver clears the current decision.</div>}
      {info && <div className="alert success mt" role="status">{info}</div>}
      {err && <div className="alert error mt" role="alert">{err}</div>}
      <div className="mth-actions">
        {slot.approver_id && <button className="btn sm danger" onClick={() => save(null)} disabled={busy} style={{ marginRight: 'auto' }}>Remove</button>}
        <button className="btn sm" onClick={() => onDone(null, '')} disabled={busy}>Cancel</button>
        <button className="btn sm primary" onClick={() => save(userId)} disabled={busy || !userId || userId === String(slot.approver_id ?? '')}>{busy ? 'Saving…' : 'Save'}</button>
      </div>

      {addingEmployee && <InviteUserModal onClose={() => setAddingEmployee(false)} onInvited={employeeAdded} />}
    </div>
  )
}

// colour of each user role in the picker
const ROLE_BADGE: Record<string, string> = {
  group_executive: 'gold', functional_head: 'amber', team_lead: 'green', admin: 'black', pmo: 'gold',
}

/** Dropdown of every active employee showing name, designation and role. People whose
 *  role matches the slot (e.g. group_executive for the Group Executive) are listed first.
 *  Opens straight away; the search box filters by name, designation, role or Employee ID. */
function ApproverPicker({ slot, users, value, onChange, onAddNew }: {
  slot: Slot; users: User[]; value: string; onChange: (id: string) => void; onAddNew: () => void
}) {
  const [open, setOpen] = useState(true)
  const [q, setQ] = useState('')
  const suggestedRole = SUGGESTED_ROLE[slot.role]
  const selected = users.find((u) => String(u.id) === value)

  const term = q.trim().toLowerCase()
  const matches = users
    .filter((u) => !term || [u.name, u.designation, label(u.role), u.employee_id].some((s) => (s ?? '').toLowerCase().includes(term)))
    .sort((a, b) => a.name.localeCompare(b.name))
  const suggested = matches.filter((u) => u.role === suggestedRole)
  const others = matches.filter((u) => u.role !== suggestedRole)

  const pick = (u: User) => { onChange(String(u.id)); setOpen(false); setQ('') }
  const row = (u: User) => (
    <button key={u.id} type="button" className={`mth-opt ${String(u.id) === value ? 'on' : ''}`} onClick={() => pick(u)}>
      <span style={{ minWidth: 0 }}>
        <span className="mth-opt-name">{u.name}</span>
        <span className="mth-opt-sub">{[u.designation, u.employee_id].filter(Boolean).join(' · ')}</span>
      </span>
      <span className={`badge ${ROLE_BADGE[u.role] ?? 'gray'}`} style={{ flexShrink: 0 }}>{label(u.role)}</span>
    </button>
  )

  return (
    <div>
      <button type="button" className="mth-trigger" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {selected ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.name}</b>
            <span className={`badge ${ROLE_BADGE[selected.role] ?? 'gray'}`}>{label(selected.role)}</span>
          </span>
        ) : <span className="muted">Choose the {slot.label}…</span>}
        <span aria-hidden style={{ color: 'var(--muted)' }}>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="mth-menu">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, designation, role or Employee ID…"
            onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }} />
          <button type="button" className="mth-opt mth-add" onClick={() => { setOpen(false); onAddNew() }}>
            + Add new employee (not in the system)
          </button>
          <div className="mth-opts">
            {suggested.length > 0 && <div className="mth-group">{label(suggestedRole)} — suggested</div>}
            {suggested.map(row)}
            {others.length > 0 && <div className="mth-group">{suggested.length ? 'All other employees' : 'All employees'}</div>}
            {others.map(row)}
            {!matches.length && <div className="small muted" style={{ padding: '10px 12px' }}>No employee matches “{q}”. Use “+ Add new employee” above.</div>}
          </div>
        </div>
      )}
    </div>
  )
}

function DecisionForm({ slot, data, onDone }: {
  slot: Slot; data: Methodology; onDone: (d: Methodology | null, msg: string) => void
}) {
  const initial = ['approved', 'review', 'rejected'].includes(slot.decision) ? slot.decision as 'approved' | 'review' | 'rejected' : null
  const [decision, setDecision] = useState<'approved' | 'review' | 'rejected' | null>(initial)
  const [note, setNote] = useState(slot.note ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const noteRequired = decision === 'rejected' || decision === 'review'

  const submit = async () => {
    if (!decision) { setErr('Choose Approve, Under Review or Reject.'); return }
    if (noteRequired && !note.trim()) { setErr('Write your findings so the Project Manager knows what to change.'); return }
    setBusy(true); setErr('')
    try {
      const d = await api.patch<Methodology>(`/methodology/${data.project_id}/decision/${slot.role}`, { decision, note: note.trim() || null })
      onDone(d, `Your decision (${DECISION[decision].text}) is saved. The Project Manager has been notified.`)
    } catch (e: any) {
      setErr(e.message || 'Could not save your decision.')
      setBusy(false)
    }
  }

  return (
    <div className="mth-box">
      {data.doc_link && (
        <div className="small" style={{ marginBottom: 8 }}>
          Review the <a href={data.doc_link} target="_blank" rel="noopener noreferrer">methodology document ↗</a> first, then record your decision as the {slot.label}.
        </div>
      )}
      <div className="mth-choices" role="radiogroup" aria-label="Decision">
        {CHOICES.map((c) => (
          <button key={c.value} type="button" role="radio" aria-checked={decision === c.value}
            className={`mth-choice ${c.badge} ${decision === c.value ? 'on' : ''}`} onClick={() => setDecision(c.value)} disabled={busy}>
            {c.text}
          </button>
        ))}
      </div>
      <label>Note / findings{noteRequired ? ' *' : ' (optional)'}</label>
      <textarea rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} disabled={busy}
        placeholder={decision === 'approved' ? 'Any remarks for the Project Manager…' : 'What needs to change in the methodology?'} />
      <div className="small muted">{note.length}/2000</div>
      {err && <div className="alert error mt" role="alert">{err}</div>}
      <div className="mth-actions">
        <button className="btn sm" onClick={() => onDone(null, '')} disabled={busy}>Cancel</button>
        <button className="btn sm primary" onClick={submit} disabled={busy || !decision}>{busy ? 'Saving…' : 'Submit Decision'}</button>
      </div>
    </div>
  )
}
