import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { store } from '../store'
import { Approval, Company, DelayRca, Department, Function, ProgressUpdate, Project, Task, User } from '../types'
import { DELAY_CATEGORIES, HEALTH_COLORS, PRIORITY_COLORS, STATUS_COLORS, fmtDate, label } from '../constants'
import TaskForm from '../components/TaskForm'

export default function TaskDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [task, setTask] = useState<Task | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [functions, setFunctions] = useState<Function[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [progress, setProgress] = useState<ProgressUpdate[]>([])
  const [delays, setDelays] = useState<DelayRca[]>([])
  const [showRca, setShowRca] = useState(false)
  const [showProgress, setShowProgress] = useState(false)
  const [showRevise, setShowRevise] = useState(false)
  const [showEdit, setShowEdit] = useState(false)

  const load = () => {
    if (!id) return
    api.get<Task>(`/tasks/${id}`).then(setTask)
    api.get<ProgressUpdate[]>(`/tasks/${id}/progress`).then(setProgress)
    api.get<DelayRca[]>(`/delays?task_id=${id}`).then(setDelays)
  }

  useEffect(() => {
    api.get<Project[]>('/projects').then(setProjects)
    api.get<User[]>('/organizations/users').then(setUsers)
    api.get<Company[]>('/organizations/companies').then(setCompanies)
    api.get<Function[]>('/organizations/functions').then(setFunctions)
    api.get<Department[]>('/organizations/departments').then(setDepartments)
  }, [])
  useEffect(load, [id])

  if (!task) return <div className="empty">Loading…</div>

  const proj = projects.find((p) => p.id === task.project_id)
  const owner = users.find((u) => u.id === task.responsible_id)
  const acc = users.find((u) => u.id === task.accountable_id)

  // pending delay with a proposed revised date (feeds the revised-date approval)
  const pendingRevisedDelay = delays
    .filter((d) => d.revised_due_date && d.approval_status === 'pending')
    .sort((a, b) => b.id - a.id)[0]

  const isMine = user?.id === task.responsible_id || user?.id === task.accountable_id
  const isPrivileged = user ? store.isPrivileged(user.role) : false

  const requestApproval = async (type: string, revisedDate?: string) => {
    const approver = store.approverFor(task)
    await api.post('/approvals', {
      approval_type: type,
      entity_type: 'task',
      entity_id: task.id,
      requested_by_id: user?.id ?? task.responsible_id,
      approver_id: approver?.id ?? null,
      reason: type === 'revised_date' && revisedDate
        ? `Requesting revised due date ${fmtDate(revisedDate)} for ${task.code}`
        : `Requesting ${label(type)} for ${task.code}`,
    })
    load()
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <button className="btn sm" onClick={() => navigate('/tasks')} style={{ marginBottom: 8 }}>← Tasks</button>
          <h1>{task.title}</h1>
          <div className="crumb">{task.code} · {proj?.name ?? 'Standalone'} · <span className={`badge ${STATUS_COLORS[task.status]}`}>{label(task.status)}</span> <span className={`health-dot ${HEALTH_COLORS[task.health]}`} /> {label(task.health)}</div>
        </div>
        <div className="row">
          <button className="btn sm" onClick={() => setShowProgress(true)} disabled={!isMine && !isPrivileged}>+ Update Progress</button>
          <button className="btn sm gold" onClick={() => requestApproval('completion')} disabled={!isMine && !isPrivileged}>Submit for Completion</button>
          {isPrivileged && <button className="btn sm" onClick={() => setShowEdit(true)}>✎ Edit Task</button>}
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr', alignItems: 'start' }}>
        <div>
          <div className="card">
            <div className="section-title" style={{ marginTop: 0 }}>Details</div>
            <div className="form-row">
              <div><label>Description</label><div className="small">{task.description || '—'}</div></div>
              <div><label>Expected Deliverable</label><div className="small">{task.expected_deliverable || '—'}</div></div>
            </div>
            <div className="form-row" style={{ marginTop: 12 }}>
              <div><label>Category</label><div className="small">{label(task.category)}</div></div>
              <div><label>Priority</label><span className={`badge ${PRIORITY_COLORS[task.priority]}`}>{label(task.priority)}</span></div>
            </div>
            <div className="form-row three" style={{ marginTop: 12 }}>
              <div><label>SBU</label><div className="small">{store.companies().find((c) => c.id === task.company_id)?.name ?? '—'}</div></div>
              <div><label>Function</label><div className="small">{store.functions().find((f) => f.id === task.function_id)?.name ?? '—'}</div></div>
              <div><label>Department</label><div className="small">{store.departments().find((d) => d.id === task.department_id)?.name ?? '—'}</div></div>
            </div>
            {task.blocker && (
              <div style={{ marginTop: 12, padding: 10, background: '#fbe5e5', borderRadius: 8 }}>
                <strong className="small" style={{ color: 'var(--red)' }}>Blocker:</strong> <span className="small">{task.blocker_details}</span>
              </div>
            )}
          </div>

          <div className="card mt">
            <div className="section-title" style={{ marginTop: 0 }}>Deadline Governance</div>
            <table>
              <tbody>
                <tr><td className="muted">Baseline Due</td><td>{fmtDate(task.baseline_due_date)}</td></tr>
                <tr><td className="muted">Approved Due</td><td>{fmtDate(task.approved_due_date)}</td></tr>
                <tr><td className="muted">Forecast</td><td>{fmtDate(task.forecast_due_date)}</td></tr>
                <tr><td className="muted">Actual Completion</td><td>{fmtDate(task.actual_due_date)}</td></tr>
              </tbody>
            </table>
          </div>

          <div className="card mt">
            <div className="section-title" style={{ marginTop: 0 }}>Progress Updates</div>
            {progress.length === 0 && <div className="small muted">No updates yet.</div>}
            {progress.map((p) => (
              <div key={p.id} className="small" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                <strong>{p.progress_pct}%</strong>{p.status ? ` · ${label(p.status)}` : ''} · {p.remarks}
                <div className="muted" style={{ fontSize: 11 }}>{fmtDate(p.created_at?.slice(0, 10))}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="card">
            <div className="section-title" style={{ marginTop: 0 }}>RACI</div>
            <div className="small" style={{ padding: '4px 0' }}><strong>R</strong> — {owner?.name ?? '—'}</div>
            <div className="small" style={{ padding: '4px 0' }}><strong>A</strong> — {acc?.name ?? '—'}</div>
            <div className="small" style={{ padding: '4px 0' }}><strong>Reviewer</strong> — {users.find((u) => u.id === task.reviewer_id)?.name ?? '—'}</div>
          </div>

          <div className="card mt">
            <div className="spread">
              <div className="section-title" style={{ marginTop: 0 }}>Delay / RCA</div>
              <button className="btn sm" onClick={() => setShowRca(true)}>+ Log Delay</button>
            </div>
            {delays.length === 0 && <div className="small muted">No delay records.</div>}
            {delays.map((d) => (
              <div key={d.id} className="small" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                <strong>{label(d.delay_category ?? 'other')}</strong> — {d.delay_reason}
                <div className="muted" style={{ fontSize: 11 }}>
                  Root cause: {d.root_cause || '—'} · <span className={`badge ${d.approval_status === 'approved' ? 'green' : d.approval_status === 'rejected' ? 'red' : 'amber'}`}>{label(d.approval_status)}</span>
                </div>
                {d.revised_due_date && <div className="muted" style={{ fontSize: 11 }}>Proposed revised date: {fmtDate(d.revised_due_date)}</div>}
              </div>
            ))}
          </div>

          {task.status !== 'completed' && task.status !== 'closed' && (
            <div className="card mt">
              <div className="section-title" style={{ marginTop: 0 }}>Date Revision</div>
              <button className="btn sm" style={{ width: '100%' }} onClick={() => setShowRevise(true)} disabled={!isMine && !isPrivileged}>
                Request Date Revision
              </button>
              <div className="small muted" style={{ marginTop: 8 }}>
                Sent to: {store.approverFor(task)?.name ?? 'Privileged approver'}
              </div>
              {pendingRevisedDelay && (
                <div className="small muted" style={{ marginTop: 8 }}>
                  Already proposed: <strong>{fmtDate(pendingRevisedDelay.revised_due_date)}</strong>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showRca && <RcaForm task={task} users={users} onClose={() => setShowRca(false)} onSaved={() => { setShowRca(false); load() }} />}
      {showProgress && <ProgressForm task={task} onClose={() => setShowProgress(false)} onSaved={() => { setShowProgress(false); load() }} />}
      {showRevise && <ReviseForm task={task} onClose={() => setShowRevise(false)} onSaved={() => { setShowRevise(false); load() }} />}
      {showEdit && (
        <TaskForm
          projects={projects}
          users={users}
          companies={companies}
          functions={functions}
          departments={departments}
          task={task}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); load() }}
        />
      )}
    </div>
  )
}

function ReviseForm({ task, onClose, onSaved }: { task: Task; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth()
  const [f, setF] = useState<any>({ proposed_date: '', reason: '' })
  const [err, setErr] = useState('')
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }))

  const submit = async () => {
    if (!f.proposed_date) { setErr('Proposed date is required'); return }
    if (!f.reason.trim()) { setErr('Reason is required'); return }
    const approver = store.approverFor(task)
    try {
      // record the delay/RCA with proposed date
      await api.post('/delays', {
        task_id: task.id,
        delay_category: 'decision_pending',
        delay_reason: f.reason.trim(),
        root_cause: f.reason.trim(),
        is_internal: true,
        dependency_related: false,
        management_intervention: false,
        revised_due_date: f.proposed_date,
        approval_status: 'pending',
      })
      // request approval to the privileged approver
      await api.post('/approvals', {
        approval_type: 'revised_date',
        entity_type: 'task',
        entity_id: task.id,
        requested_by_id: user?.id ?? task.responsible_id,
        approver_id: approver?.id ?? null,
        reason: `Requesting revised due date ${fmtDate(f.proposed_date)} — ${f.reason.trim()}`,
      })
      onSaved()
    } catch (e: any) { setErr(e.message) }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
        <h2>Request Date Revision — {task.code}</h2>
        {err && <div className="badge red" style={{ marginBottom: 12 }}>{err}</div>}
        <label>Proposed New Due Date *</label>
        <input type="date" value={f.proposed_date} onChange={(e) => set('proposed_date', e.target.value)} />
        <label>Reason *</label>
        <textarea rows={3} value={f.reason} onChange={(e) => set('reason', e.target.value)} placeholder="Explain why the date needs to change…" />
        <div className="small muted" style={{ marginTop: 8 }}>
          This request will be sent to <strong>{store.approverFor(task)?.name ?? 'the privileged approver'}</strong> for approval.
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit}>Submit Request</button>
        </div>
      </div>
    </div>
  )
}

function RcaForm({ task, users, onClose, onSaved }: { task: Task; users: User[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<any>({ task_id: task.id, is_internal: true, dependency_related: false, management_intervention: false, approval_status: 'pending' })
  const [err, setErr] = useState('')
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }))
  const submit = async () => {
    if (!f.delay_category || !f.delay_reason) { setErr('Delay category and reason are required'); return }
    await api.post('/delays', { ...f, task_id: task.id, revised_due_date: f.revised_due_date || null, schedule_impact_days: f.schedule_impact_days ? Number(f.schedule_impact_days) : null, recovery_owner_id: f.recovery_owner_id ? Number(f.recovery_owner_id) : null })
    onSaved()
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Log Delay / RCA — {task.code}</h2>
        {err && <div className="badge red" style={{ marginBottom: 12 }}>{err}</div>}
        <div className="form-row">
          <div>
            <label>Delay Category *</label>
            <select value={f.delay_category} onChange={(e) => set('delay_category', e.target.value)}>
              <option value="">—</option>
              {DELAY_CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
            </select>
          </div>
          <div>
            <label>Schedule Impact (days)</label>
            <input type="number" value={f.schedule_impact_days ?? ''} onChange={(e) => set('schedule_impact_days', e.target.value)} />
          </div>
        </div>
        <label>Delay Reason *</label>
        <textarea rows={2} value={f.delay_reason} onChange={(e) => set('delay_reason', e.target.value)} />
        <label>Root Cause</label>
        <textarea rows={2} value={f.root_cause} onChange={(e) => set('root_cause', e.target.value)} />
        <label>Recovery Action</label>
        <textarea rows={2} value={f.recovery_action} onChange={(e) => set('recovery_action', e.target.value)} />
        <div className="form-row">
          <div>
            <label>Proposed Revised Date</label>
            <input type="date" value={f.revised_due_date} onChange={(e) => set('revised_due_date', e.target.value)} />
          </div>
          <div>
            <label>Recovery Owner</label>
            <select value={f.recovery_owner_id} onChange={(e) => set('recovery_owner_id', e.target.value)}>
              <option value="">—</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit}>Submit Delay</button>
        </div>
      </div>
    </div>
  )
}

function ProgressForm({ task, onClose, onSaved }: { task: Task; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<any>({ progress_pct: task.progress_pct, status: task.status, blocker: task.blocker })
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }))
  const submit = async () => {
    await api.post(`/tasks/${task.id}/progress`, {
      task_id: task.id,
      progress_pct: Number(f.progress_pct),
      status: f.status,
      remarks: f.remarks,
      blocker: f.blocker,
      blocker_details: f.blocker_details,
      next_action: f.next_action,
      forecast_due_date: f.forecast_due_date || null,
      support_required: f.support_required,
    })
    onSaved()
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Update Progress — {task.code}</h2>
        <div className="form-row">
          <div>
            <label>Progress %</label>
            <input type="number" min={0} max={100} value={f.progress_pct} onChange={(e) => set('progress_pct', e.target.value)} />
          </div>
          <div>
            <label>Status</label>
            <select value={f.status} onChange={(e) => set('status', e.target.value)}>
              {['backlog', 'ready', 'in_progress', 'in_review', 'completed', 'blocked', 'on_hold'].map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </select>
          </div>
        </div>
        <label>Remarks</label>
        <textarea rows={2} value={f.remarks} onChange={(e) => set('remarks', e.target.value)} />
        <label>Next Action</label>
        <input value={f.next_action} onChange={(e) => set('next_action', e.target.value)} />
        <div className="row" style={{ marginTop: 12 }}>
          <label style={{ margin: 0 }}><input type="checkbox" checked={f.blocker} onChange={(e) => set('blocker', e.target.checked)} style={{ width: 'auto' }} /> Blocker</label>
        </div>
        {f.blocker && <><label>Blocker Details</label><input value={f.blocker_details} onChange={(e) => set('blocker_details', e.target.value)} /></>}
        <label>Forecast Completion</label>
        <input type="date" value={f.forecast_due_date} onChange={(e) => set('forecast_due_date', e.target.value)} />
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit}>Save Update</button>
        </div>
      </div>
    </div>
  )
}
