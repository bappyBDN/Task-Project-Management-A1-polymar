import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { Decision, Issue, ManagementAction, Meeting, Project, Risk, User } from '../types'
import { fmtDate, label } from '../constants'

// Meetings come back with extra details (saved by the backend without a schema change).
interface MeetingFull extends Meeting {
  project_id?: number | null
  meeting_time?: string | null
  purpose?: string | null
  location?: string | null
  organizer_id?: number | null
  attendee_ids: number[]
  can_manage: boolean
}
interface Person { id: number; name: string; designation?: string | null; roles: string[] }
interface ProjectLite { id: number; code: string; name: string }

type Tab = 'meetings' | 'decisions' | 'actions' | 'risks' | 'issues'
const MEETING_TYPES = ['operational_review', 'project_review', 'steering_committee', 'management_meeting', 'other']

const pad = (n: number) => String(n).padStart(2, '0')
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

/** Upcoming / Today / Held, from the meeting's date and time. */
function meetingState(m: MeetingFull): { text: string; tone: string } {
  if (!m.meeting_date) return { text: '—', tone: 'gray' }
  const today = todayIso()
  if (m.meeting_date > today) return { text: 'Upcoming', tone: 'gold' }
  if (m.meeting_date < today) return { text: 'Held', tone: 'gray' }
  if (m.meeting_time) {
    const now = new Date()
    const nowHm = `${pad(now.getHours())}:${pad(now.getMinutes())}`
    return m.meeting_time > nowHm ? { text: 'Today', tone: 'amber' } : { text: 'Held', tone: 'gray' }
  }
  return { text: 'Today', tone: 'amber' }
}

export default function Governance() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('meetings')
  const [actions, setActions] = useState<ManagementAction[]>([])
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [risks, setRisks] = useState<Risk[]>([])
  const [issues, setIssues] = useState<Issue[]>([])
  const [meetings, setMeetings] = useState<MeetingFull[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [schedulable, setSchedulable] = useState<ProjectLite[]>([])
  const [error, setError] = useState('')

  // modals
  const [showSchedule, setShowSchedule] = useState(false)
  const [decisionFor, setDecisionFor] = useState<MeetingFull | null>(null)
  const [actionFor, setActionFor] = useState<Decision | null>(null)
  const [closing, setClosing] = useState<ManagementAction | null>(null)

  const load = () => {
    api.get<ManagementAction[]>('/actions').then(setActions).catch(() => {})
    api.get<Decision[]>('/decisions').then(setDecisions).catch(() => {})
    api.get<MeetingFull[]>('/meetings').then(setMeetings).catch(() => {})
    api.get<Risk[]>('/risks').then(setRisks).catch(() => {})
    api.get<Issue[]>('/issues').then(setIssues).catch(() => {})
    api.get<ProjectLite[]>('/meetings/schedulable-projects').then(setSchedulable).catch(() => setSchedulable([]))
  }

  useEffect(() => {
    load()
    api.get<Project[]>('/projects').then(setProjects).catch(() => {})
    api.get<User[]>('/organizations/users').then(setUsers).catch(() => {})
  }, [])

  const name = (id?: number | null) => users.find((u) => u.id === id)?.name ?? '—'
  const projectName = (id?: number | null) => projects.find((p) => p.id === id)?.name ?? '—'
  const meetingName = (id?: number | null) => meetings.find((m) => m.id === id)?.title ?? '—'
  const activeUsers = useMemo(() => users.filter((u) => u.is_active !== false), [users])

  const run = async (fn: () => Promise<unknown>) => {
    setError('')
    try { await fn(); load() } catch (e: any) { setError(e?.message || 'Something went wrong.') }
  }

  const convert = (a: ManagementAction) => run(() => api.post(`/actions/${a.id}/convert-to-task`))
  const closeDecision = (d: Decision) => run(() => api.patch(`/decisions/${d.id}`, { ...d, status: 'closed' }))

  // Pipeline counts: Meeting -> Decision -> Action -> Task -> Evidence -> Closure
  const stages: [string, number][] = [
    ['Meetings', meetings.length],
    ['Decisions', decisions.length],
    ['Actions', actions.length],
    ['Tasks', actions.filter((a) => a.converted_task_id).length],
    ['Evidence', actions.filter((a) => (a.evidence ?? '').trim()).length],
    ['Closed', actions.filter((a) => a.status === 'closed').length],
  ]

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Management Actions &amp; Decisions</h1>
          <div className="crumb">Meeting → Decision → Action → Task → Evidence → Closure</div>
        </div>
        <button
          className="btn primary"
          onClick={() => setShowSchedule(true)}
          disabled={schedulable.length === 0}
          title={schedulable.length === 0 ? 'Only admins and people who are Responsible, Accountable or Reviewer on a project can schedule its meetings' : ''}
        >
          + Schedule Meeting
        </button>
      </div>

      {/* pipeline */}
      <div className="row mb" style={{ flexWrap: 'wrap', gap: 6 }}>
        {stages.map(([s, n], i) => (
          <span key={s} className="row" style={{ gap: 6 }}>
            <span className="badge gray" style={{ fontSize: 12, padding: '4px 10px' }}>{s} <strong style={{ marginLeft: 4 }}>{n}</strong></span>
            {i < stages.length - 1 && <span className="muted">→</span>}
          </span>
        ))}
      </div>

      {error && <div className="card mb" style={{ background: '#fbe5e5', color: 'var(--red)' }}>{error}</div>}

      <div className="row mb">
        <button className={`btn ${tab === 'meetings' ? 'primary' : ''}`} onClick={() => setTab('meetings')}>Meetings ({meetings.length})</button>
        <button className={`btn ${tab === 'decisions' ? 'primary' : ''}`} onClick={() => setTab('decisions')}>Decisions ({decisions.length})</button>
        <button className={`btn ${tab === 'actions' ? 'primary' : ''}`} onClick={() => setTab('actions')}>Actions ({actions.length})</button>
        <button className={`btn ${tab === 'risks' ? 'primary' : ''}`} onClick={() => setTab('risks')}>Risks ({risks.length})</button>
        <button className={`btn ${tab === 'issues' ? 'primary' : ''}`} onClick={() => setTab('issues')}>Issues ({issues.length})</button>
      </div>

      {tab === 'meetings' && (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr><th>When</th><th>Meeting</th><th>Project</th><th>Purpose</th><th>Organiser</th><th>Attendees</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {meetings.map((m) => {
                const st = meetingState(m)
                const decCount = decisions.filter((d) => d.meeting_id === m.id).length
                return (
                  <tr key={m.id}>
                    <td className="small" style={{ whiteSpace: 'nowrap' }}>
                      <strong>{fmtDate(m.meeting_date)}</strong>
                      {m.meeting_time && <div className="muted">{m.meeting_time}</div>}
                    </td>
                    <td>
                      {m.title}
                      <div className="muted small">{label(m.meeting_type)}{m.location ? ` · ${m.location}` : ''}</div>
                    </td>
                    <td className="small">{projectName(m.project_id)}</td>
                    <td className="small" style={{ maxWidth: 260 }}>{m.purpose ?? '—'}</td>
                    <td className="small">{name(m.organizer_id)}</td>
                    <td className="small" title={m.attendee_ids.map((id) => name(id)).join(', ')}>
                      {m.attendee_ids.length ? `${m.attendee_ids.length} people` : '—'}
                    </td>
                    <td><span className={`badge ${st.tone}`}>{st.text}</span></td>
                    <td>
                      <div className="row">
                        <button className="btn sm" onClick={() => setDecisionFor(m)}>+ Decision</button>
                        {decCount > 0 && <span className="small muted">{decCount} decision{decCount > 1 ? 's' : ''}</span>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {meetings.length === 0 && <div className="empty">No meetings yet. Use “+ Schedule Meeting” to set one up.</div>}
        </div>
      )}

      {tab === 'actions' && (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr><th>Code</th><th>Action</th><th>Meeting</th><th>Responsible</th><th>Accountable</th><th>Due</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {actions.map((a) => (
                <tr key={a.id}>
                  <td className="muted small">{a.code}</td>
                  <td>
                    {a.action}
                    {a.evidence && <div className="small" style={{ color: 'var(--green)', marginTop: 2 }}>Evidence: {a.evidence}</div>}
                  </td>
                  <td className="small">{meetingName(a.meeting_id)}</td>
                  <td className="small">{name(a.responsible_id)}</td>
                  <td className="small">{name(a.accountable_id)}</td>
                  <td className="small">{fmtDate(a.due_date)}</td>
                  <td><span className={`badge ${a.status === 'closed' ? 'green' : a.status === 'open' ? 'amber' : 'gray'}`}>{label(a.status)}</span></td>
                  <td>
                    <div className="row">
                      {a.status === 'open' && (
                        <>
                          {!a.converted_task_id && <button className="btn sm" onClick={() => convert(a)}>→ Task</button>}
                          <button className="btn sm" onClick={() => setClosing(a)}>Close</button>
                        </>
                      )}
                      {a.converted_task_id && <Link className="small" to={`/tasks/${a.converted_task_id}`}>TSK #{a.converted_task_id}</Link>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {actions.length === 0 && <div className="empty">No management actions.</div>}
        </div>
      )}

      {tab === 'decisions' && (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr><th>Code</th><th>Decision</th><th>Meeting</th><th>Owner</th><th>Project</th><th>Date</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {decisions.map((d) => (
                <tr key={d.id}>
                  <td className="muted small">{d.code}</td>
                  <td>{d.statement}</td>
                  <td className="small">{meetingName(d.meeting_id)}</td>
                  <td className="small">{name(d.owner_id)}</td>
                  <td className="small">{projectName(d.project_id)}</td>
                  <td className="small">{fmtDate(d.decision_date)}</td>
                  <td><span className={`badge ${d.status === 'closed' ? 'green' : 'amber'}`}>{label(d.status)}</span></td>
                  <td>
                    {d.status === 'open' && (
                      <div className="row">
                        <button className="btn sm" onClick={() => setActionFor(d)}>+ Action</button>
                        <button className="btn sm" onClick={() => closeDecision(d)}>Close</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {decisions.length === 0 && <div className="empty">No decisions.</div>}
        </div>
      )}

      {tab === 'risks' && (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr><th>Project</th><th>Risk</th><th>Category</th><th>Likelihood</th><th>Impact</th><th>Mitigation</th><th>Owner</th><th>Status</th></tr>
            </thead>
            <tbody>
              {risks.map((r) => (
                <tr key={r.id}>
                  <td className="small">{projectName(r.project_id)}</td>
                  <td>{r.description}</td>
                  <td className="small">{label(r.category ?? '')}</td>
                  <td><span className="badge gray">{label(r.likelihood)}</span></td>
                  <td><span className={`badge ${r.impact === 'high' ? 'red' : r.impact === 'medium' ? 'amber' : 'gray'}`}>{label(r.impact)}</span></td>
                  <td className="small">{r.mitigation ?? '—'}</td>
                  <td className="small">{name(r.owner_id)}</td>
                  <td><span className={`badge ${r.status === 'open' ? 'amber' : 'green'}`}>{label(r.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {risks.length === 0 && <div className="empty">No risks.</div>}
        </div>
      )}

      {tab === 'issues' && (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr><th>Project</th><th>Issue</th><th>Category</th><th>Severity</th><th>Resolution</th><th>Owner</th><th>Status</th></tr>
            </thead>
            <tbody>
              {issues.map((i) => (
                <tr key={i.id}>
                  <td className="small">{projectName(i.project_id)}</td>
                  <td>{i.description}</td>
                  <td className="small">{label(i.category ?? '')}</td>
                  <td><span className={`badge ${i.severity === 'high' ? 'red' : i.severity === 'medium' ? 'amber' : 'gray'}`}>{label(i.severity)}</span></td>
                  <td className="small">{i.resolution ?? '—'}</td>
                  <td className="small">{name(i.owner_id)}</td>
                  <td><span className={`badge ${i.status === 'open' ? 'amber' : 'green'}`}>{label(i.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {issues.length === 0 && <div className="empty">No issues.</div>}
        </div>
      )}

      {showSchedule && (
        <ScheduleMeetingModal
          projects={schedulable}
          myId={user?.id}
          onClose={() => setShowSchedule(false)}
          onSaved={() => { setShowSchedule(false); setTab('meetings'); load() }}
        />
      )}
      {decisionFor && (
        <DecisionModal
          meeting={decisionFor}
          projects={projects}
          users={activeUsers}
          onClose={() => setDecisionFor(null)}
          onSaved={() => { setDecisionFor(null); setTab('decisions'); load() }}
        />
      )}
      {actionFor && (
        <ActionModal
          decision={actionFor}
          users={activeUsers}
          onClose={() => setActionFor(null)}
          onSaved={() => { setActionFor(null); setTab('actions'); load() }}
        />
      )}
      {closing && (
        <CloseActionModal
          action={closing}
          onClose={() => setClosing(null)}
          onSaved={() => { setClosing(null); load() }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Schedule meeting
function ScheduleMeetingModal({ projects, myId, onClose, onSaved }: {
  projects: ProjectLite[]; myId?: number; onClose: () => void; onSaved: () => void
}) {
  const [f, setF] = useState({
    project_id: projects.length === 1 ? String(projects[0].id) : '',
    title: '', meeting_type: 'project_review', meeting_date: '', meeting_time: '', purpose: '', location: '',
  })
  const [people, setPeople] = useState<Person[]>([])
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))

  // Load the project's people; everyone is ticked by default.
  useEffect(() => {
    setPeople([]); setPicked(new Set())
    if (!f.project_id) return
    api.get<Person[]>(`/meetings/project-people/${f.project_id}`)
      .then((list) => { setPeople(list); setPicked(new Set(list.map((p) => p.id))) })
      .catch((e: any) => setErr(e?.message || 'Could not load project members.'))
  }, [f.project_id])

  const toggle = (id: number) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const notifyCount = [...picked].filter((id) => id !== myId).length

  const submit = async () => {
    if (!f.project_id) return setErr('Choose a project')
    if (!f.title.trim()) return setErr('Meeting title is required')
    if (!f.meeting_date) return setErr('Date is required')
    if (!f.meeting_time) return setErr('Time is required')
    if (!f.purpose.trim()) return setErr('Purpose is required')
    if (notifyCount === 0) return setErr('Select at least one person to invite')
    setBusy(true); setErr('')
    try {
      await api.post('/meetings', {
        project_id: Number(f.project_id),
        title: f.title.trim(),
        meeting_type: f.meeting_type,
        meeting_date: f.meeting_date,
        meeting_time: f.meeting_time,
        purpose: f.purpose.trim(),
        location: f.location.trim() || null,
        attendee_ids: [...picked],
      })
      onSaved()
    } catch (e: any) {
      setErr(e?.message || 'Could not schedule the meeting.')
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Schedule Meeting</h2>
        {err && <div className="badge red" style={{ marginBottom: 12 }}>{err}</div>}
        <label>Project *</label>
        <select value={f.project_id} onChange={(e) => set('project_id', e.target.value)} disabled={busy}>
          <option value="">— Select project —</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
        </select>
        <div className="form-row">
          <div>
            <label>Title *</label>
            <input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Weekly progress review" disabled={busy} />
          </div>
          <div>
            <label>Type</label>
            <select value={f.meeting_type} onChange={(e) => set('meeting_type', e.target.value)} disabled={busy}>
              {MEETING_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div>
            <label>Date *</label>
            <input type="date" min={todayIso()} value={f.meeting_date} onChange={(e) => set('meeting_date', e.target.value)} disabled={busy} />
          </div>
          <div>
            <label>Time *</label>
            <input type="time" value={f.meeting_time} onChange={(e) => set('meeting_time', e.target.value)} disabled={busy} />
          </div>
        </div>
        <label>Purpose / Agenda *</label>
        <textarea rows={3} value={f.purpose} onChange={(e) => set('purpose', e.target.value)} placeholder="What will be discussed and decided?" disabled={busy} />
        <label>Location or meeting link</label>
        <input value={f.location} onChange={(e) => set('location', e.target.value)} placeholder="e.g. Board Room 2 or a Google Meet link" disabled={busy} />

        <label>Invite (people on this project)</label>
        {!f.project_id && <div className="small muted">Choose a project to see its people.</div>}
        {f.project_id && people.length === 0 && <div className="small muted">Loading…</div>}
        {people.length > 0 && (
          <div style={{ border: '1px solid var(--line)', borderRadius: 8, maxHeight: 190, overflowY: 'auto' }}>
            {people.map((p) => (
              <label key={p.id} className="row" style={{ margin: 0, padding: '7px 10px', borderBottom: '1px solid var(--line)', fontWeight: 400, cursor: 'pointer' }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={picked.has(p.id)} onChange={() => toggle(p.id)} disabled={busy || p.id === myId} />
                <span style={{ color: 'var(--ink)' }}>{p.name}{p.id === myId ? ' (you, organiser)' : ''}</span>
                <span className="small muted" style={{ marginLeft: 'auto' }}>{p.roles.join(', ')}</span>
              </label>
            ))}
          </div>
        )}
        {people.length > 0 && (
          <div className="small muted" style={{ marginTop: 8 }}>
            {notifyCount} {notifyCount === 1 ? 'person' : 'people'} will get a notification with the date, time and purpose. Nobody outside this project is notified.
          </div>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={busy}>{busy ? 'Scheduling…' : 'Schedule & Notify'}</button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Decision from a meeting
function DecisionModal({ meeting, projects, users, onClose, onSaved }: {
  meeting: MeetingFull; projects: Project[]; users: User[]; onClose: () => void; onSaved: () => void
}) {
  const [f, setF] = useState({
    statement: '', owner_id: '',
    project_id: meeting.project_id ? String(meeting.project_id) : '',
    decision_date: meeting.meeting_date ?? todayIso(),
  })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))

  const submit = async () => {
    if (!f.statement.trim()) return setErr('Write the decision')
    if (!f.owner_id) return setErr('Choose an owner')
    setBusy(true); setErr('')
    try {
      await api.post('/decisions', {
        meeting_id: meeting.id,
        statement: f.statement.trim(),
        owner_id: Number(f.owner_id),
        project_id: f.project_id ? Number(f.project_id) : null,
        decision_date: f.decision_date || null,
        status: 'open',
      })
      onSaved()
    } catch (e: any) { setErr(e?.message || 'Could not save the decision.'); setBusy(false) }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 560 }} onClick={(e) => e.stopPropagation()}>
        <h2>New Decision — {meeting.title}</h2>
        {err && <div className="badge red" style={{ marginBottom: 12 }}>{err}</div>}
        <label>Decision *</label>
        <textarea rows={3} value={f.statement} onChange={(e) => set('statement', e.target.value)} placeholder="What was decided?" disabled={busy} />
        <div className="form-row">
          <div>
            <label>Owner *</label>
            <select value={f.owner_id} onChange={(e) => set('owner_id', e.target.value)} disabled={busy}>
              <option value="">—</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label>Decision Date</label>
            <input type="date" value={f.decision_date} onChange={(e) => set('decision_date', e.target.value)} disabled={busy} />
          </div>
        </div>
        <label>Project</label>
        <select value={f.project_id} onChange={(e) => set('project_id', e.target.value)} disabled={busy}>
          <option value="">— None —</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
        </select>
        <div className="modal-actions">
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save Decision'}</button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Action from a decision
function ActionModal({ decision, users, onClose, onSaved }: {
  decision: Decision; users: User[]; onClose: () => void; onSaved: () => void
}) {
  const [f, setF] = useState({ action: '', responsible_id: '', accountable_id: decision.owner_id ? String(decision.owner_id) : '', due_date: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))

  const submit = async () => {
    if (!f.action.trim()) return setErr('Describe the action')
    if (!f.responsible_id) return setErr('Choose who is responsible')
    if (!f.due_date) return setErr('Due date is required')
    setBusy(true); setErr('')
    try {
      await api.post('/actions', {
        meeting_id: decision.meeting_id ?? null,
        decision_id: decision.id,
        action: f.action.trim(),
        responsible_id: Number(f.responsible_id),
        accountable_id: f.accountable_id ? Number(f.accountable_id) : null,
        due_date: f.due_date,
        status: 'open',
      })
      onSaved()
    } catch (e: any) { setErr(e?.message || 'Could not save the action.'); setBusy(false) }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 560 }} onClick={(e) => e.stopPropagation()}>
        <h2>New Action — {decision.code}</h2>
        <div className="small muted" style={{ marginBottom: 8 }}>{decision.statement}</div>
        {err && <div className="badge red" style={{ marginBottom: 12 }}>{err}</div>}
        <label>Action *</label>
        <textarea rows={2} value={f.action} onChange={(e) => set('action', e.target.value)} placeholder="What needs to be done?" disabled={busy} />
        <div className="form-row">
          <div>
            <label>Responsible *</label>
            <select value={f.responsible_id} onChange={(e) => set('responsible_id', e.target.value)} disabled={busy}>
              <option value="">—</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label>Accountable</label>
            <select value={f.accountable_id} onChange={(e) => set('accountable_id', e.target.value)} disabled={busy}>
              <option value="">—</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        </div>
        <label>Due Date *</label>
        <input type="date" value={f.due_date} onChange={(e) => set('due_date', e.target.value)} disabled={busy} />
        <div className="modal-actions">
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save Action'}</button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Evidence -> Closure
function CloseActionModal({ action, onClose, onSaved }: { action: ManagementAction; onClose: () => void; onSaved: () => void }) {
  const [evidence, setEvidence] = useState(action.evidence ?? '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!evidence.trim()) return setErr('Evidence is required to close an action')
    setBusy(true); setErr('')
    try {
      await api.patch(`/actions/${action.id}`, { ...action, evidence: evidence.trim(), status: 'closed' })
      onSaved()
    } catch (e: any) { setErr(e?.message || 'Could not close the action.'); setBusy(false) }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 520 }} onClick={(e) => e.stopPropagation()}>
        <h2>Close Action — {action.code}</h2>
        <div className="small muted" style={{ marginBottom: 8 }}>{action.action}</div>
        {err && <div className="badge red" style={{ marginBottom: 12 }}>{err}</div>}
        <label>Evidence of completion *</label>
        <textarea rows={3} value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="e.g. Report shared on 2 Oct, link to document, sign-off by…" disabled={busy} />
        <div className="modal-actions">
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={busy}>{busy ? 'Closing…' : 'Close with Evidence'}</button>
        </div>
      </div>
    </div>
  )
}