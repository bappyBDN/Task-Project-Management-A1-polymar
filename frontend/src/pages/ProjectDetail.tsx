import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { useIsPrivileged } from '../usePrivileged'
import ProjectForm from '../components/ProjectForm'
import ProjectContribution from '../components/ProjectContribution'
import ProjectRaci from '../components/ProjectRaci'
import CommentsPanel from '../components/CommentsPanel'
import { Company, Project, Task, User } from '../types'
import { HEALTH_COLORS, PRIORITY_COLORS, STATUS_COLORS, fmtDate, label } from '../constants'
import { RichTextView } from '../components/RichText'
import { sbuName } from '../org'

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loadErr, setLoadErr] = useState('')
  const [showEdit, setShowEdit] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const { user } = useAuth()
  const isPrivileged = useIsPrivileged(user?.role)

  const reloadUsers = () => api.get<User[]>('/organizations/users').then((u) => { setUsers(u); return u })

  useEffect(() => {
    reloadUsers().catch(() => {})
    api.get<Company[]>('/organizations/companies').then(setCompanies).catch(() => {})
  }, [])

  useEffect(() => {
    if (!id) return
    setLoadErr('')
    api.get<Project>(`/projects/${id}`).then(setProject).catch((e) => setLoadErr(e.message || 'Could not load this project.'))
    api.get<Task[]>(`/tasks?project_id=${id}`).then(setTasks).catch(() => {})
  }, [id])

  const userName = (uid?: number) => users.find((u) => u.id === uid)?.name

  if (!project) {
    if (loadErr) {
      return (
        <div className="card empty" style={{ marginTop: 40 }}>
          <h2 style={{ color: 'var(--navy)', marginTop: 0 }}>Project not available</h2>
          <p>{/not found/i.test(loadErr) ? 'This project does not exist or was deleted.' : loadErr}</p>
          <button className="btn primary" onClick={() => navigate('/projects')}>Back to Projects</button>
        </div>
      )
    }
    return <div className="empty">Loading…</div>
  }

  const companyName = sbuName(companies, project.company_id) ?? '—'
  // Admin / PMO, or anyone Responsible / Accountable on one of this project's tasks, can edit
  // the whole project (same rule as app/permissions.py on the server).
  const isProjectRA = !!user && tasks.some((t) => t.responsible_id === user.id || t.accountable_id === user.id)
  const canEdit = isPrivileged || isProjectRA
  // associated people: also the project's Manager / Owner / Sponsor (same rule as the server)
  const canManageAssociates = canEdit || (!!user && [project.manager_id, project.owner_id, project.sponsor_id].includes(user.id))

  // headline numbers for the KPI strip
  const todayStr = new Date().toISOString().slice(0, 10)
  const isClosed = (t: Task) => ['completed', 'closed', 'cancelled'].includes(t.status)
  const doneCount = tasks.filter((t) => ['completed', 'closed'].includes(t.status)).length
  const overdueCount = tasks.filter((t) => {
    const due = t.approved_due_date || t.baseline_due_date
    return !isClosed(t) && !!due && due < todayStr
  }).length
  const openCount = tasks.filter((t) => !isClosed(t)).length
  const people = new Set([project.manager_id,
    ...tasks.flatMap((t) => [t.responsible_id, t.accountable_id, t.reviewer_id])].filter(Boolean)).size
  const dueDate = project.approved_due_date || project.baseline_due_date
  const daysLeft = dueDate && !project.actual_due_date
    ? Math.round((new Date(dueDate).getTime() - new Date(todayStr).getTime()) / 86400000)
    : null

  return (
    <div>
      <div className="topbar">
        <div>
          <button className="btn sm" onClick={() => navigate('/projects')} style={{ marginBottom: 8 }}>← Projects</button>
          <h1>{project.name}</h1>
          <div className="crumb">
            {project.code} · {companyName} ·{' '}
            <span className={`badge ${STATUS_COLORS[project.status] ?? 'gray'}`}>{label(project.status)}</span>{' '}
            <span className={`health-dot ${HEALTH_COLORS[project.health]}`} /> {label(project.health)}
          </div>
        </div>
        {canEdit && <button className="btn sm" onClick={() => { setSavedMsg(''); setShowEdit(true) }}>✎ Edit Project</button>}
      </div>

      {savedMsg && <div className="alert success" role="status">{savedMsg}</div>}
      {showEdit && (
        <ProjectForm
          project={project}
          companies={companies}
          users={users}
          types={[project.project_type]}
          onClose={() => setShowEdit(false)}
          onSaved={(p) => { setProject(p); setShowEdit(false); setSavedMsg('Project updated.') }}
        />
      )}

      <div className="grid kpi-strip">
        <div className="card kpi">
          <div className="label">Completion</div>
          <div className="value">{project.completion_pct ?? 0}%</div>
          <div className="progress" style={{ marginTop: 6 }}><span style={{ width: `${project.completion_pct ?? 0}%` }} /></div>
        </div>
        <div className="card kpi">
          <div className="label">Tasks Done</div>
          <div className="value green">{doneCount}<span className="small muted" style={{ fontWeight: 400 }}> / {tasks.length}</span></div>
        </div>
        <div className="card kpi">
          <div className="label">Open Tasks</div>
          <div className="value">{openCount}</div>
        </div>
        <div className="card kpi">
          <div className="label">Overdue</div>
          <div className={`value ${overdueCount ? 'red' : ''}`}>{overdueCount}</div>
        </div>
        <div className="card kpi">
          <div className="label">People</div>
          <div className="value">{people}</div>
          <div className="hint">on roles &amp; tasks</div>
        </div>
        <div className="card kpi">
          <div className="label">{project.actual_due_date ? 'Completed' : 'Due'}</div>
          <div className={`value sm ${daysLeft !== null && daysLeft < 0 ? 'red' : ''}`}>
            {project.actual_due_date ? fmtDate(project.actual_due_date)
              : daysLeft === null ? '—'
              : daysLeft < 0 ? `${-daysLeft} day(s) late`
              : daysLeft === 0 ? 'Today' : `${daysLeft} day(s) left`}
          </div>
          {!project.actual_due_date && dueDate && <div className="hint">{fmtDate(dueDate)}</div>}
        </div>
      </div>

      <div className="grid detail-grid" style={{ alignItems: 'start', gap: 16 }}>
        <div>
          <div className="card">
            <div className="section-title" style={{ marginTop: 0 }}>Overview</div>
            <div className="form-row">
              <div><label>Strategic Objective</label><div className="small"><RichTextView text={project.strategic_objective} /></div></div>
              <div><label>Objective</label><div className="small"><RichTextView text={project.objective} /></div></div>
            </div>
            <div className="form-row" style={{ marginTop: 12 }}>
              <div><label>Expected Outcome</label><div className="small"><RichTextView text={project.expected_outcome} /></div></div>
              <div><label>Type / Methodology</label><div className="small">{label(project.project_type)} · {label(project.methodology)}</div></div>
            </div>
            <div className="form-row three" style={{ marginTop: 12 }}>
              <div><label>Priority</label><span className={`badge ${PRIORITY_COLORS[project.priority] ?? 'gray'}`}>{label(project.priority)}</span></div>
              <div><label>Criticality</label><div className="small">{label(project.criticality)}</div></div>
              <div><label>Budget</label><div className="small">{project.budget ? project.budget.toLocaleString() : '—'}</div></div>
            </div>
          </div>

        </div>

        <div>
          <div className="card">
            <div className="section-title" style={{ marginTop: 0 }}>Deadline Governance</div>
            <table>
              <tbody>
                <tr><td className="muted">Start</td><td>{fmtDate(project.start_date)}</td></tr>
                <tr><td className="muted">Baseline Due</td><td>{fmtDate(project.baseline_due_date)}</td></tr>
                <tr><td className="muted">Approved Due</td><td>{fmtDate(project.approved_due_date)}</td></tr>
                <tr><td className="muted">Forecast</td><td>{fmtDate(project.forecast_due_date)}</td></tr>
                <tr><td className="muted">Actual Completion</td><td>{fmtDate(project.actual_due_date)}</td></tr>
              </tbody>
            </table>
          </div>

          <ProjectRaci projectId={project.id} tasks={tasks} />
        </div>
      </div>

      <ProjectContribution project={project} tasks={tasks} users={users} canManage={canManageAssociates} reloadUsers={reloadUsers} />

          <div className="card mt">
            <div className="section-title" style={{ marginTop: 0 }}>Tasks ({tasks.length})</div>
            <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Code</th><th>Task</th><th>Responsible</th><th>Priority</th>
                  <th>Status</th><th>Health</th><th>Progress</th><th>Due</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id} onClick={() => navigate(`/tasks/${t.id}`)} style={{ cursor: 'pointer' }}>
                    <td className="muted small">{t.code}</td>
                    <td><Link to={`/tasks/${t.id}`}>{t.title}</Link>{t.blocker && <span className="badge red" style={{ marginLeft: 8 }}>Blocked</span>}</td>
                    <td className="small">{userName(t.responsible_id) ?? '—'}</td>
                    <td><span className={`badge ${PRIORITY_COLORS[t.priority]}`}>{label(t.priority)}</span></td>
                    <td><span className={`badge ${STATUS_COLORS[t.status]}`}>{label(t.status)}</span></td>
                    <td><span className={`health-dot ${HEALTH_COLORS[t.health] ?? 'gray'}`} /></td>
                    <td style={{ minWidth: 110 }}>
                      <div className="progress"><span style={{ width: `${t.progress_pct}%` }} /></div>
                      <span className="small muted">{t.progress_pct}%</span>
                    </td>
                    <td className="small">{fmtDate(t.approved_due_date || t.baseline_due_date)}</td>
                  </tr>
                ))}
                {tasks.length === 0 && <tr><td colSpan={8} className="muted small">No tasks under this project</td></tr>}
              </tbody>
            </table>
            </div>
          </div>

      <CommentsPanel kind="project" id={project.id} recipientId={project.manager_id} recipientName={userName(project.manager_id)} />
    </div>
  )
}