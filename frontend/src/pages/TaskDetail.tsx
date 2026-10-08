import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { useIsPrivileged } from '../usePrivileged'
import { Approval, Company, DelayRca, Department, Function, ProgressUpdate, Project, Task, User } from '../types'
import { DELAY_CATEGORIES, HEALTH_COLORS, PRIORITY_COLORS, STATUS_COLORS, fmtDate, label } from '../constants'
import { RichTextEditor, RichTextView } from '../components/RichText'
import TaskForm from '../components/TaskForm'
import CommentsPanel from '../components/CommentsPanel'
import { overseesSbu, sbuIdsOf, sbuNames } from '../org'

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

  // New states for success message and button cooldown
  const [successMsg, setSuccessMsg] = useState('')
  const [actionErr, setActionErr] = useState('')
  const [cooldown, setCooldown] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  const hasPrivilegedRole = useIsPrivileged(user?.role)

  // Where "back" goes: the Tasks page is for admins only, so everyone else returns to the
  // task's project (or My Dashboard for a task without one).
  const isAdmin = user?.role === 'admin'
  const backTo = isAdmin ? '/tasks' : task?.project_id ? `/projects/${task.project_id}` : '/'
  const backLabel = isAdmin ? 'Tasks' : task?.project_id ? 'Project' : 'My Dashboard'

  const load = () => {
    if (!id) return
    setLoadErr('')
    api.get<Task>(`/tasks/${id}`).then(setTask).catch((e) => setLoadErr(e.message || 'Could not load this task.'))
    api.get<ProgressUpdate[]>(`/tasks/${id}/progress`).then(setProgress).catch(() => {})
    api.get<DelayRca[]>(`/delays?task_id=${id}`).then(setDelays).catch(() => {})
  }

  useEffect(() => {
    // Lookups only fill in names; a failure just shows "—".
    api.get<Project[]>('/projects').then(setProjects).catch(() => {})
    api.get<User[]>('/organizations/users').then(setUsers).catch(() => {})
    api.get<Company[]>('/organizations/companies').then(setCompanies).catch(() => {})
    api.get<Function[]>('/organizations/functions').then(setFunctions).catch(() => {})
    api.get<Department[]>('/organizations/departments').then(setDepartments).catch(() => {})
  }, [])
  useEffect(load, [id])

  if (!task) {
    if (loadErr) {
      return (
        <div className="card empty" style={{ marginTop: 40 }}>
          <h2 style={{ color: 'var(--navy)', marginTop: 0 }}>Task not available</h2>
          <p>{/not found/i.test(loadErr) ? 'This task does not exist or was deleted.' : loadErr}</p>
          <button className="btn" onClick={load} style={{ marginRight: 8 }}>Try again</button>
          <button className="btn primary" onClick={() => navigate(backTo)}>Back to {backLabel}</button>
        </div>
      )
    }
    return <div className="empty">Loading…</div>
  }

  const proj = projects.find((p) => p.id === task.project_id)
  const owner = users.find((u) => u.id === task.responsible_id)
  const acc = users.find((u) => u.id === task.accountable_id)
  const reviewer = users.find((u) => u.id === task.reviewer_id)

  const pendingRevisedDelay = delays
    .filter((d) => d.revised_due_date && d.approval_status === 'pending')
    .sort((a, b) => b.id - a.id)[0]

  const isMine = user?.id === task.responsible_id || user?.id === task.accountable_id
  // the COO of the task's SBU (its own, or its project's) manages it like an admin / PMO
  const isPrivileged = hasPrivilegedRole || overseesSbu(user, companies, sbuIdsOf(task).length ? sbuIdsOf(task) : sbuIdsOf(proj))
  // Admin / PMO edit everything; the Responsible / Accountable person edits the task details (limited).
  // The Responsible person also sets the task's people (Responsible, Accountable, Reviewer, Informed).
  const isResponsible = user?.id === task.responsible_id
  const canEdit = isPrivileged || isMine

  // An admin or the project's Manager deletes permanently. Anyone else sends a delete request:
  // the task is hidden and the project's Manager restores it or deletes it permanently.
  const isProjectManager = !!user && !!proj?.manager_id && proj.manager_id === user.id
  const deletesNow = user?.role === 'admin' || isProjectManager
  const canDelete = canEdit || isProjectManager
  const removeTask = async () => {
    if (deleting) return
    let reason = ''
    if (deletesNow) {
      if (!confirm(`Delete task ${task.code} — "${task.title}"?\n\nThis permanently removes the task and its progress history. It cannot be undone.`)) return
    } else {
      const decider = users.find((u) => u.id === proj?.manager_id)?.name
      const answer = prompt(`Delete task ${task.code} — "${task.title}"?\n\nThe task will be hidden and sent to ${decider ? `${decider} (Project Manager)` : 'an admin'}, who will restore it or delete it permanently.\n\nReason for deleting:`, '')
      if (answer === null) return
      reason = answer.trim()
    }
    setDeleting(true)
    setActionErr('')
    try {
      const res = await api.del<{ status?: string } | undefined>(`/tasks/${task.id}${reason ? `?reason=${encodeURIComponent(reason)}` : ''}`)
      if (res?.status === 'pending_approval') alert('Delete request sent. You can follow it on the Approvals page.')
      navigate(backTo)
    } catch (e: any) {
      setActionErr(e.message || 'Could not delete the task. Please try again.')
      setDeleting(false)
    }
  }

  const requestApproval = async (type: string, revisedDate?: string) => {
    if (cooldown) return // Prevent double clicks during cooldown

    setCooldown(true)
    setSuccessMsg('')
    setActionErr('')
    try {
      // The server picks the approver (Reviewer -> Accountable -> line manager)
      // from the real database; the old code sent one from browser demo data.
      await api.post('/approvals', {
        approval_type: type,
        entity_type: 'task',
        entity_id: task.id,
        reason: type === 'revised_date' && revisedDate
          ? `Requesting revised due date ${fmtDate(revisedDate)} for ${task.code}`
          : `Requesting ${label(type)} for ${task.code}`,
      })

      setSuccessMsg('Task is submitted for approval.')
      load()

      // Reset the button after 20 seconds
      setTimeout(() => {
        setCooldown(false)
        setSuccessMsg('')
      }, 20000)
    } catch (e: any) {
      setActionErr(e.message || 'Could not submit for approval. Please try again.')
      setCooldown(false)
    }
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <button className="btn sm" onClick={() => navigate(backTo)} style={{ marginBottom: 8 }}>← {backLabel}</button>
          <h1>{task.title}</h1>
          <div className="crumb">{task.code} · {proj?.name ?? 'Standalone'} · <span className={`badge ${STATUS_COLORS[task.status]}`}>{label(task.status)}</span> <span className={`health-dot ${HEALTH_COLORS[task.health]}`} /> {label(task.health)}</div>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn sm" onClick={() => setShowProgress(true)} disabled={!isMine && !isPrivileged}>+ Update Progress</button>
          <button
            className="btn sm gold"
            onClick={() => requestApproval('completion')}
            disabled={(!isMine && !isPrivileged) || cooldown}
          >
            {cooldown ? 'Submitted...' : 'Submit for Completion'}
          </button>
          {canEdit && <button className="btn sm" onClick={() => setShowEdit(true)}>✎ Edit Task</button>}
          {canDelete && <button className="btn sm danger" onClick={removeTask} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete Task'}</button>}
        </div>
      </div>

      {/* Success Message Banner */}
      {successMsg && (
        <div className="alert success" role="status">
          <strong>Success:</strong> {successMsg}
        </div>
      )}
      {actionErr && <div className="alert error" role="alert">{actionErr}</div>}

      <div className="grid detail-grid" style={{ alignItems: 'start' }}>
        <div>
          <div className="card">
            <div className="section-title" style={{ marginTop: 0 }}>Details</div>
            <div className="form-row">
              <div><label>Description</label><div className="small"><RichTextView text={task.description} /></div></div>
              <div><label>Expected Deliverable</label><div className="small"><RichTextView text={task.expected_deliverable} /></div></div>
            </div>
            <div className="form-row" style={{ marginTop: 12 }}>
              <div><label>Category</label><div className="small">{label(task.category)}</div></div>
              <div><label>Priority</label><span className={`badge ${PRIORITY_COLORS[task.priority]}`}>{label(task.priority)}</span></div>
            </div>
            <div className="form-row three" style={{ marginTop: 12 }}>
              <div><label>SBU</label><div className="small">{sbuNames(companies, sbuIdsOf(task)) ?? '—'}</div></div>
              <div><label>Function</label><div className="small">{functions.find((f) => f.id === task.function_id)?.name ?? '—'}</div></div>
              <div><label>Department</label><div className="small">{departments.find((d) => d.id === task.department_id)?.name ?? '—'}</div></div>
            </div>
            <div className="form-row" style={{ marginTop: 12 }}>
              <div><label>Created By</label><div className="small">{task.created_by || '—'}</div></div>
              <div><label>Created On</label><div className="small">{fmtDate(task.created_at?.slice(0, 10))}</div></div>
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
                <strong>{p.progress_pct}%</strong>{p.status ? ` · ${label(p.status)}` : ''}
                {p.remarks && <RichTextView text={p.remarks} />}
                {p.next_action && <div className="muted"><strong>Next:</strong> <RichTextView text={p.next_action} /></div>}
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
            <div className="small" style={{ padding: '4px 0' }}><strong>I</strong> — {users.find((u) => u.id === task.informed_id)?.name ?? '—'}</div>
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
                Sent to: {reviewer ? `${reviewer.name} (Reviewer)` : 'No reviewer assigned'}
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

      <CommentsPanel kind="task" id={task.id} recipients={[{ id: task.responsible_id, name: owner?.name }, { id: task.accountable_id, name: acc?.name }]} />

      {showRca && <RcaForm task={task} users={users} onClose={() => setShowRca(false)} onSaved={() => { setShowRca(false); load() }} />}
      {showProgress && <ProgressForm task={task} canComplete={isPrivileged} onClose={() => setShowProgress(false)} onSaved={() => { setShowProgress(false); load() }} />}
      {showRevise && <ReviseForm task={task} users={users} onClose={() => setShowRevise(false)} onSaved={() => { setShowRevise(false); load() }} />}
      {showEdit && (
        <TaskForm
          projects={projects}
          users={users}
          companies={companies}
          functions={functions}
          departments={departments}
          task={task}
          limited={!isPrivileged}
          lockApprovers={!isPrivileged && !isResponsible}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); load() }}
        />
      )}
    </div>
  )
}

function ReviseForm({ task, users, onClose, onSaved }: { task: Task; users: User[]; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth()
  // Date revisions always go to the task's Reviewer only.
  const reviewer = users.find((u) => u.id === task.reviewer_id)
  const [f, setF] = useState<any>({ proposed_date: '', reason: '' })
  const [err, setErr] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }))

  const submit = async () => {
    if (!f.proposed_date) { setErr('Proposed date is required'); return }
    if (!f.reason.trim()) { setErr('Reason is required'); return }
    if (!task.reviewer_id) { setErr('This task has no reviewer. Ask an admin to assign one first.'); return }

    setIsSubmitting(true)
    setErr('')
    try {
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
      await api.post('/approvals', {
        approval_type: 'revised_date',
        entity_type: 'task',
        entity_id: task.id,
        approver_id: task.reviewer_id,
        reason: `Requesting revised due date ${fmtDate(f.proposed_date)} — ${f.reason.trim()}`,
      })

      setSuccessMsg('Date revision request submitted.')
      setTimeout(onSaved, 1500)
    } catch (e: any) {
      setErr(e.message)
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
        <h2>Request Date Revision — {task.code}</h2>
        {err && <div className="alert error" role="alert">{err}</div>}
        {successMsg && <div className="alert success" role="status">{successMsg}</div>}
        <label>Proposed New Due Date *</label>
        <input type="date" value={f.proposed_date} onChange={(e) => set('proposed_date', e.target.value)} disabled={isSubmitting} />
        <label>Reason *</label>
        <textarea rows={3} value={f.reason} onChange={(e) => set('reason', e.target.value)} placeholder="Explain why the date needs to change…" disabled={isSubmitting} />
        {reviewer ? (
          <div className="small muted" style={{ marginTop: 8 }}>
            This request will be sent to <strong>{reviewer.name}</strong> (Reviewer) for approval.
          </div>
        ) : (
          <div className="small" style={{ marginTop: 8, color: 'var(--red)' }}>
            This task has no reviewer assigned. Ask an admin to set a reviewer before requesting a date revision.
          </div>
        )}
        <div className="modal-actions">
          <button className="btn" onClick={onClose} disabled={isSubmitting}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={isSubmitting || !reviewer}>{isSubmitting ? 'Submitting...' : 'Submit Request'}</button>
        </div>
      </div>
    </div>
  )
}

function RcaForm({ task, users, onClose, onSaved }: { task: Task; users: User[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<any>({ task_id: task.id, is_internal: true, dependency_related: false, management_intervention: false, approval_status: 'pending' })
  const [err, setErr] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }))

  const submit = async () => {
    if (!f.delay_category || !f.delay_reason) { setErr('Delay category and reason are required'); return }

    setIsSubmitting(true)
    setErr('')
    try {
      await api.post('/delays', { ...f, task_id: task.id, revised_due_date: f.revised_due_date || null, schedule_impact_days: f.schedule_impact_days ? Number(f.schedule_impact_days) : null, recovery_owner_id: f.recovery_owner_id ? Number(f.recovery_owner_id) : null })
      setSuccessMsg('Delay logged successfully.')
      setTimeout(onSaved, 1500)
    } catch (e: any) {
      setErr(e.message || 'Failed to submit')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Log Delay / RCA — {task.code}</h2>
        {err && <div className="alert error" role="alert">{err}</div>}
        {successMsg && <div className="alert success" role="status">{successMsg}</div>}
        <div className="form-row">
          <div>
            <label>Delay Category *</label>
            <select value={f.delay_category} onChange={(e) => set('delay_category', e.target.value)} disabled={isSubmitting}>
              <option value="">—</option>
              {DELAY_CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
            </select>
          </div>
          <div>
            <label>Schedule Impact (days)</label>
            <input type="number" value={f.schedule_impact_days ?? ''} onChange={(e) => set('schedule_impact_days', e.target.value)} disabled={isSubmitting} />
          </div>
        </div>
        <label>Delay Reason *</label>
        <textarea rows={2} value={f.delay_reason} onChange={(e) => set('delay_reason', e.target.value)} disabled={isSubmitting} />
        <label>Root Cause</label>
        <textarea rows={2} value={f.root_cause} onChange={(e) => set('root_cause', e.target.value)} disabled={isSubmitting} />
        <label>Recovery Action</label>
        <textarea rows={2} value={f.recovery_action} onChange={(e) => set('recovery_action', e.target.value)} disabled={isSubmitting} />
        <div className="form-row">
          <div>
            <label>Proposed Revised Date</label>
            <input type="date" value={f.revised_due_date} onChange={(e) => set('revised_due_date', e.target.value)} disabled={isSubmitting} />
          </div>
          <div>
            <label>Recovery Owner</label>
            <select value={f.recovery_owner_id} onChange={(e) => set('recovery_owner_id', e.target.value)} disabled={isSubmitting}>
              <option value="">—</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose} disabled={isSubmitting}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={isSubmitting}>{isSubmitting ? 'Submitting...' : 'Submit Delay'}</button>
        </div>
      </div>
    </div>
  )
}

function ProgressForm({ task, canComplete, onClose, onSaved }: { task: Task; canComplete: boolean; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<any>({ progress_pct: task.progress_pct, status: task.status, blocker: task.blocker })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [err, setErr] = useState('')
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }))

  const submit = async () => {
    const pct = Number(f.progress_pct)
    if (f.progress_pct === '' || !Number.isFinite(pct) || pct < 0 || pct > 100) { setErr('Progress must be a number from 0 to 100.'); return }
    if (f.blocker && !(f.blocker_details || '').trim()) { setErr('Please describe the blocker.'); return }
    setErr('')
    setIsSubmitting(true)
    try {
      await api.post(`/tasks/${task.id}/progress`, {
        task_id: task.id,
        progress_pct: pct,
        status: f.status,
        remarks: f.remarks,
        blocker: f.blocker,
        blocker_details: f.blocker_details,
        next_action: f.next_action,
        forecast_due_date: f.forecast_due_date || null,
        support_required: f.support_required,
      })
      setSuccessMsg('Progress updated successfully.')
      setTimeout(onSaved, 1500)
    } catch (e: any) {
      setErr(e.message || 'Could not save the update. Please try again.')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Update Progress — {task.code}</h2>
        {err && <div className="alert error" role="alert">{err}</div>}
        {successMsg && <div className="alert success" role="status">{successMsg}</div>}
        <div className="form-row">
          <div>
            <label>Progress %</label>
            <input type="number" min={0} max={100} value={f.progress_pct} onChange={(e) => set('progress_pct', e.target.value)} disabled={isSubmitting} />
          </div>
          <div>
            <label>Status</label>
            <select value={f.status} onChange={(e) => set('status', e.target.value)} disabled={isSubmitting}>
              {['backlog', 'ready', 'in_progress', 'in_review', 'completed', 'blocked', 'on_hold']
                .filter((s) => canComplete || s !== 'completed' || task.status === 'completed')
                .map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </select>
            {!canComplete && <div className="small muted" style={{ marginTop: 4 }}>To finish the task, use "Submit for Completion".</div>}
          </div>
        </div>
        <label>Remarks</label>
        <RichTextEditor rows={2} value={f.remarks ?? ''} onChange={(v) => set('remarks', v)} placeholder="What was done? Use Link to attach a document or page." disabled={isSubmitting} />
        <label>Next Action</label>
        <RichTextEditor rows={2} value={f.next_action ?? ''} onChange={(v) => set('next_action', v)} placeholder="What happens next?" disabled={isSubmitting} />
        <div className="row" style={{ marginTop: 12 }}>
          <label style={{ margin: 0 }}><input type="checkbox" checked={f.blocker} onChange={(e) => set('blocker', e.target.checked)} style={{ width: 'auto' }} disabled={isSubmitting} /> Blocker</label>
        </div>
        {f.blocker && <><label>Blocker Details</label><input value={f.blocker_details} onChange={(e) => set('blocker_details', e.target.value)} disabled={isSubmitting} /></>}
        <label>Forecast Completion</label>
        <input type="date" value={f.forecast_due_date} onChange={(e) => set('forecast_due_date', e.target.value)} disabled={isSubmitting} />
        <div className="modal-actions">
          <button className="btn" onClick={onClose} disabled={isSubmitting}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Save Update'}</button>
        </div>
      </div>
    </div>
  )
}