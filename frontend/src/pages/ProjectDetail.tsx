import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { Company, Milestone, Project, Task, User } from '../types'
import { HEALTH_COLORS, PRIORITY_COLORS, STATUS_COLORS, fmtDate, label } from '../constants'

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [companies, setCompanies] = useState<Company[]>([])

  useEffect(() => {
    api.get<User[]>('/organizations/users').then(setUsers)
    api.get<Company[]>('/organizations/companies').then(setCompanies)
  }, [])

  useEffect(() => {
    if (!id) return
    api.get<Project>(`/projects/${id}`).then(setProject)
    api.get<Task[]>(`/tasks?project_id=${id}`).then(setTasks)
    api.get<Milestone[]>(`/projects/${id}/milestones`).then(setMilestones)
  }, [id])

  const userName = (uid?: number) => users.find((u) => u.id === uid)?.name

  // ---------------------------------------------------------------- Team: everyone touching this project
  const team = useMemo(() => {
    const roles = new Map<number, Set<string>>()
    const add = (uid: number | undefined | null, role: string) => {
      if (!uid) return
      if (!roles.has(uid)) roles.set(uid, new Set())
      roles.get(uid)!.add(role)
    }
    if (project) {
      add(project.manager_id, 'Manager')
      add(project.sponsor_id, 'Sponsor')
      add(project.owner_id, 'Owner')
    }
    tasks.forEach((t) => {
      add(t.responsible_id, 'Responsible')
      add(t.accountable_id, 'Accountable')
      add(t.reviewer_id, 'Reviewer')
    })
    return Array.from(roles.entries())
      .map(([uid, roleSet]) => ({ user: users.find((u) => u.id === uid), roles: Array.from(roleSet) }))
      .filter((r) => r.user)
      .sort((a, b) => (a.user!.name > b.user!.name ? 1 : -1))
  }, [project, tasks, users])

  if (!project) return <div className="empty">Loading…</div>

  const companyName = companies.find((c) => c.id === project.company_id)?.name ?? '—'

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
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr', alignItems: 'start', gap: 16 }}>
        <div>
          <div className="card">
            <div className="section-title" style={{ marginTop: 0 }}>Overview</div>
            <div className="form-row">
              <div><label>Strategic Objective</label><div className="small">{project.strategic_objective || '—'}</div></div>
              <div><label>Objective</label><div className="small">{project.objective || '—'}</div></div>
            </div>
            <div className="form-row" style={{ marginTop: 12 }}>
              <div><label>Expected Outcome</label><div className="small">{project.expected_outcome || '—'}</div></div>
              <div><label>Type / Methodology</label><div className="small">{label(project.project_type)} · {label(project.methodology)}</div></div>
            </div>
            <div className="form-row three" style={{ marginTop: 12 }}>
              <div><label>Priority</label><span className={`badge ${PRIORITY_COLORS[project.priority] ?? 'gray'}`}>{label(project.priority)}</span></div>
              <div><label>Criticality</label><div className="small">{label(project.criticality)}</div></div>
              <div><label>Budget</label><div className="small">{project.budget ? project.budget.toLocaleString() : '—'}</div></div>
            </div>
          </div>

          <div className="card mt">
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

          <div className="card mt">
            <div className="section-title" style={{ marginTop: 0 }}>Milestones</div>
            <table>
              <thead><tr><th>Milestone</th><th>Due</th><th>Status</th><th>Completion</th></tr></thead>
              <tbody>
                {milestones.map((m) => (
                  <tr key={m.id}>
                    <td>{m.name}</td>
                    <td className="small">{fmtDate(m.due_date)}</td>
                    <td><span className="badge gray">{label(m.status)}</span></td>
                    <td className="small">{m.completion_pct}%</td>
                  </tr>
                ))}
                {milestones.length === 0 && <tr><td colSpan={4} className="muted small">No milestones</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="card mt">
            <div className="section-title" style={{ marginTop: 0 }}>Tasks ({tasks.length})</div>
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

        <div>
          <div className="card">
            <div className="section-title" style={{ marginTop: 0 }}>Project Team ({team.length})</div>
            {team.length === 0 && <div className="small muted">No one assigned yet.</div>}
            {team.map(({ user, roles }) => (
              <div
                key={user!.id}
                className="row spread"
                style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}
              >
                <div>
                  <div className="small" style={{ fontWeight: 600 }}>{user!.name}</div>
                  <div className="muted" style={{ fontSize: 11 }}>{user!.designation || label(user!.role)}</div>
                </div>
                <div className="row" style={{ gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {roles.map((r) => (
                    <span key={r} className="badge gray" style={{ fontSize: 10 }}>{r}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}