import { ReactNode, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { Approval, DelayRca, ProgressUpdate, Project, Task, User } from '../types'
import { HEALTH_COLORS, PRIORITY_COLORS, STATUS_COLORS, fmtDate, label } from '../constants'

// The detail endpoint adds `can_decide` (the server decides who may approve).
type ApprovalWithRights = Approval & { can_decide: boolean }
type DelayWithDate = DelayRca & { created_at?: string }

const statusBadge = (s?: string) => (s === 'approved' ? 'green' : s === 'rejected' ? 'red' : 'amber')

function Field({ name, children, wide }: { name: string; children: ReactNode; wide?: boolean }) {
  return (
    <div style={wide ? { gridColumn: '1 / -1' } : undefined}>
      <label style={{ marginTop: 0 }}>{name}</label>
      <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{children ?? '—'}</div>
    </div>
  )
}

function Grid({ children }: { children: ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px 18px' }}>{children}</div>
}

const text = (v?: string | null) => (v && v.trim() ? v : '—')
const yesNo = (v?: boolean) => (v ? 'Yes' : 'No')

/** Days between two ISO dates (b - a). */
function dayShift(a?: string, b?: string) {
  if (!a || !b) return null
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000)
}

export default function ApprovalDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [approval, setApproval] = useState<ApprovalWithRights | null>(null)
  const [task, setTask] = useState<Task | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [delays, setDelays] = useState<DelayWithDate[]>([])
  const [progress, setProgress] = useState<ProgressUpdate[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loadError, setLoadError] = useState('')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = () => {
    if (!id) return
    setLoadError('')
    api.get<ApprovalWithRights>(`/approvals/${id}`)
      .then((a) => {
        setApproval(a)
        if (a.entity_type === 'task') {
          api.get<Task>(`/tasks/${a.entity_id}`).then(setTask).catch(() => setTask(null))
          api.get<DelayWithDate[]>(`/delays?task_id=${a.entity_id}`).then(setDelays).catch(() => setDelays([]))
          api.get<ProgressUpdate[]>(`/tasks/${a.entity_id}/progress`).then(setProgress).catch(() => setProgress([]))
        } else if (a.entity_type === 'project') {
          api.get<Project>(`/projects/${a.entity_id}`).then(setProject).catch(() => setProject(null))
        }
      })
      .catch((e: any) => setLoadError(e?.message || 'Could not open this approval.'))
  }

  useEffect(load, [id])
  useEffect(() => {
    api.get<User[]>('/organizations/users').then(setUsers).catch(() => {})
    api.get<Project[]>('/projects').then(setProjects).catch(() => {})
  }, [])

  const nameOf = (uid?: number | null) => (uid ? users.find((u) => u.id === uid)?.name ?? '—' : '—')

  if (loadError) {
    return (
      <div>
        <button className="btn sm" onClick={() => navigate('/approvals')} style={{ marginBottom: 12 }}>← Approvals</button>
        <div className="card" style={{ background: '#fbe5e5', color: 'var(--red)' }}>{loadError}</div>
      </div>
    )
  }
  if (!approval) return <div className="empty">Loading…</div>

  const isRevision = approval.approval_type === 'revised_date'

  // The delay record that belongs to this revision request: the one with a
  // proposed date saved closest before the request (same click saves both).
  const withDate = delays.filter((d) => d.revised_due_date)
  const reqTime = Date.parse(approval.created_at)
  const linkedDelay: DelayWithDate | undefined = isRevision
    ? withDate
        .filter((d) => d.created_at && Date.parse(d.created_at) <= reqTime + 120000)
        .sort((a, b) => Date.parse(b.created_at!) - Date.parse(a.created_at!))[0]
      ?? withDate.filter((d) => d.approval_status === 'pending').sort((a, b) => b.id - a.id)[0]
    : undefined
  const otherDelays = delays.filter((d) => d.id !== linkedDelay?.id).sort((a, b) => b.id - a.id)

  const currentDue = task?.approved_due_date || task?.baseline_due_date
  const shift = linkedDelay ? dayShift(currentDue, linkedDelay.revised_due_date) : null
  const taskProject = task ? projects.find((p) => p.id === task.project_id) : undefined

  const decide = async (status: 'approved' | 'rejected') => {
    if (status === 'rejected' && !comment.trim()) {
      setMsg({ ok: false, text: 'Please write a reason before rejecting.' })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      await api.post(`/approvals/${approval.id}/decision`, {
        status,
        reason: comment.trim() || (status === 'approved' ? 'Approved' : 'Rejected'),
      })
      setMsg({ ok: true, text: status === 'approved' ? 'Approved.' : 'Rejected.' })
      setComment('')
      load()
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || 'Could not save the decision.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <button className="btn sm" onClick={() => navigate('/approvals')} style={{ marginBottom: 8 }}>← Approvals</button>
          <h1>{label(approval.approval_type)} request</h1>
          <div className="crumb">
            Approval #{approval.id} · {task ? `${task.code} — ${task.title}` : project ? `${project.code} — ${project.name}` : `${approval.entity_type} #${approval.entity_id}`}
            {' · '}<span className={`badge ${statusBadge(approval.status)}`}>{label(approval.status)}</span>
          </div>
        </div>
      </div>

      {msg && (
        <div className="card mb" style={{ background: msg.ok ? '#e3f5ea' : '#fbe5e5', color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.text}</div>
      )}

      <div className="grid" style={{ gridTemplateColumns: '1.5fr 1fr', gap: 16, alignItems: 'start' }}>
        {/* ------------------------------------------------ LEFT: what is being asked */}
        <div>
          <div className="card">
            <div className="section-title" style={{ marginTop: 0 }}>Request</div>
            <Grid>
              <Field name="Type">{label(approval.approval_type)}</Field>
              <Field name="Status"><span className={`badge ${statusBadge(approval.status)}`}>{label(approval.status)}</span></Field>
              <Field name="Requested By">{nameOf(approval.requested_by_id)}</Field>
              <Field name="Approver">{nameOf(approval.approver_id)}</Field>
              <Field name="Requested On">{fmtDate(approval.created_at?.slice(0, 10))}</Field>
              <Field name="Decided On">{approval.decided_at ? fmtDate(approval.decided_at.slice(0, 10)) : '—'}</Field>
              <Field name="Reason" wide>{text(approval.reason)}</Field>
            </Grid>
          </div>

          {isRevision && (
            <div className="card mt">
              <div className="section-title" style={{ marginTop: 0 }}>Date Revision</div>
              <Grid>
                <Field name="Baseline Due">{fmtDate(task?.baseline_due_date)}</Field>
                <Field name="Current Approved Due">{fmtDate(task?.approved_due_date)}</Field>
                <Field name="Proposed New Due">
                  <strong>{linkedDelay ? fmtDate(linkedDelay.revised_due_date) : '—'}</strong>
                </Field>
                <Field name="Shift">
                  {shift === null ? '—' : (
                    <span style={{ color: shift > 0 ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>
                      {shift > 0 ? `+${shift}` : shift} day{Math.abs(shift) === 1 ? '' : 's'}
                    </span>
                  )}
                </Field>
              </Grid>
            </div>
          )}

          {isRevision && (
            <div className="card mt">
              <div className="section-title" style={{ marginTop: 0 }}>Delay / RCA Details</div>
              {!linkedDelay && <div className="small muted">No delay record was found for this request.</div>}
              {linkedDelay && (
                <Grid>
                  <Field name="Delay Category">{label(linkedDelay.delay_category ?? 'other')}</Field>
                  <Field name="RCA Status"><span className={`badge ${statusBadge(linkedDelay.approval_status)}`}>{label(linkedDelay.approval_status)}</span></Field>
                  <Field name="Schedule Impact">{linkedDelay.schedule_impact_days != null ? `${linkedDelay.schedule_impact_days} days` : '—'}</Field>
                  <Field name="Delay Reason" wide>{text(linkedDelay.delay_reason)}</Field>
                  <Field name="Root Cause" wide>{text(linkedDelay.root_cause)}</Field>
                  <Field name="Internal Delay">{yesNo(linkedDelay.is_internal)}</Field>
                  <Field name="Dependency Related">{yesNo(linkedDelay.dependency_related)}</Field>
                  <Field name="Management Intervention">{yesNo(linkedDelay.management_intervention)}</Field>
                  <Field name="Responsible Party">{text(linkedDelay.responsible_party)}</Field>
                  <Field name="Recovery Owner">{nameOf(linkedDelay.recovery_owner_id)}</Field>
                  <Field name="Business Impact" wide>{text(linkedDelay.business_impact)}</Field>
                  <Field name="Recovery Action" wide>{text(linkedDelay.recovery_action)}</Field>
                  <Field name="Support Required" wide>{text(linkedDelay.support_required)}</Field>
                  <Field name="Preventive Action" wide>{text(linkedDelay.preventive_action)}</Field>
                </Grid>
              )}
            </div>
          )}

          {task && (
            <div className="card mt">
              <div className="spread">
                <div className="section-title" style={{ marginTop: 0 }}>Task</div>
                <Link to={`/tasks/${task.id}`} className="small">Open task page →</Link>
              </div>
              <Grid>
                <Field name="Code">{task.code}</Field>
                <Field name="Title">{task.title}</Field>
                <Field name="Project">{taskProject?.name ?? 'Standalone'}</Field>
                <Field name="Status"><span className={`badge ${STATUS_COLORS[task.status]}`}>{label(task.status)}</span></Field>
                <Field name="Priority"><span className={`badge ${PRIORITY_COLORS[task.priority]}`}>{label(task.priority)}</span></Field>
                <Field name="Health"><span className={`health-dot ${HEALTH_COLORS[task.health] ?? ''}`} /> {label(task.health)}</Field>
                <Field name="Progress">
                  <div className="progress" style={{ maxWidth: 160 }}><span style={{ width: `${task.progress_pct}%` }} /></div>
                  {task.progress_pct}%
                </Field>
                <Field name="Responsible">{nameOf(task.responsible_id)}</Field>
                <Field name="Accountable">{nameOf(task.accountable_id)}</Field>
                <Field name="Reviewer">{nameOf(task.reviewer_id)}</Field>
                <Field name="Baseline Due">{fmtDate(task.baseline_due_date)}</Field>
                <Field name="Approved Due">{fmtDate(task.approved_due_date)}</Field>
                <Field name="Forecast">{fmtDate(task.forecast_due_date)}</Field>
                <Field name="Actual Completion">{fmtDate(task.actual_due_date)}</Field>
                <Field name="Description" wide>{text(task.description)}</Field>
                <Field name="Expected Deliverable" wide>{text(task.expected_deliverable)}</Field>
                <Field name="Acceptance Criteria" wide>{text(task.acceptance_criteria)}</Field>
                <Field name="Completion Evidence" wide>{text(task.completion_evidence)}</Field>
                <Field name="Completion Remarks" wide>{text(task.completion_remarks)}</Field>
                {task.blocker && <Field name="Blocker" wide><span style={{ color: 'var(--red)' }}>{text(task.blocker_details)}</span></Field>}
              </Grid>
            </div>
          )}

          {project && (
            <div className="card mt">
              <div className="spread">
                <div className="section-title" style={{ marginTop: 0 }}>Project</div>
                <Link to={`/projects/${project.id}`} className="small">Open project page →</Link>
              </div>
              <Grid>
                <Field name="Code">{project.code}</Field>
                <Field name="Name">{project.name}</Field>
                <Field name="Status">{label(project.status)}</Field>
                <Field name="Health">{label(project.health)}</Field>
                <Field name="Manager">{nameOf(project.manager_id)}</Field>
                <Field name="Sponsor">{nameOf(project.sponsor_id)}</Field>
                <Field name="Approved Due">{fmtDate(project.approved_due_date)}</Field>
                <Field name="Completion">{project.completion_pct}%</Field>
                <Field name="Objective" wide>{text(project.objective)}</Field>
              </Grid>
            </div>
          )}
        </div>

        {/* ------------------------------------------------ RIGHT: decision + history */}
        <div>
          <div className="card">
            <div className="section-title" style={{ marginTop: 0 }}>Decision</div>
            {approval.status !== 'pending' ? (
              <div className="small">
                This request was <span className={`badge ${statusBadge(approval.status)}`}>{label(approval.status)}</span>
                {approval.decided_at ? ` on ${fmtDate(approval.decided_at.slice(0, 10))}` : ''}.
              </div>
            ) : approval.can_decide ? (
              <>
                <label style={{ marginTop: 0 }}>Comment {`(required to reject)`}</label>
                <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write your decision note…" disabled={busy} />
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn primary" disabled={busy} onClick={() => decide('approved')}>Approve</button>
                  <button className="btn danger" disabled={busy} onClick={() => decide('rejected')}>Reject</button>
                </div>
              </>
            ) : (
              <div className="small muted">Awaiting decision from {nameOf(approval.approver_id)}.</div>
            )}
          </div>

          {task && (
            <div className="card mt">
              <div className="section-title" style={{ marginTop: 0 }}>Progress Updates</div>
              {progress.length === 0 && <div className="small muted">No updates yet.</div>}
              {progress.map((p) => (
                <div key={p.id} className="small" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                  <strong>{p.progress_pct}%</strong>{p.status ? ` · ${label(p.status)}` : ''}{p.blocker ? <span className="badge red" style={{ marginLeft: 6 }}>Blocker</span> : null}
                  {p.remarks && <div>{p.remarks}</div>}
                  {p.next_action && <div className="muted">Next: {p.next_action}</div>}
                  {p.support_required && <div className="muted">Support: {p.support_required}</div>}
                  <div className="muted" style={{ fontSize: 11 }}>{fmtDate(p.created_at?.slice(0, 10))}</div>
                </div>
              ))}
            </div>
          )}

          {task && otherDelays.length > 0 && (
            <div className="card mt">
              <div className="section-title" style={{ marginTop: 0 }}>Other Delay Records</div>
              {otherDelays.map((d) => (
                <div key={d.id} className="small" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                  <strong>{label(d.delay_category ?? 'other')}</strong> — {d.delay_reason}
                  <div className="muted" style={{ fontSize: 11 }}>
                    Root cause: {d.root_cause || '—'} · <span className={`badge ${statusBadge(d.approval_status)}`}>{label(d.approval_status)}</span>
                    {d.revised_due_date ? ` · Proposed ${fmtDate(d.revised_due_date)}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}