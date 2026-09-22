import { useEffect, useState } from 'react'
import { api } from '../api'
import { Decision, Issue, ManagementAction, Meeting, Project, Risk, User } from '../types'
import { fmtDate, label } from '../constants'

export default function Governance() {
  const [tab, setTab] = useState<'actions' | 'decisions' | 'risks' | 'issues'>('actions')
  const [actions, setActions] = useState<ManagementAction[]>([])
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [risks, setRisks] = useState<Risk[]>([])
  const [issues, setIssues] = useState<Issue[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [users, setUsers] = useState<User[]>([])

  const load = () => {
    api.get<ManagementAction[]>('/actions').then(setActions)
    api.get<Decision[]>('/decisions').then(setDecisions)
    api.get<Meeting[]>('/meetings').then(setMeetings)
    api.get<Risk[]>('/risks').then(setRisks)
    api.get<Issue[]>('/issues').then(setIssues)
  }

  useEffect(() => {
    load()
    api.get<Project[]>('/projects').then(setProjects)
    api.get<User[]>('/organizations/users').then(setUsers)
  }, [])

  const name = (id?: number) => users.find((u) => u.id === id)?.name ?? '—'
  const projectName = (id?: number) => projects.find((p) => p.id === id)?.name ?? '—'
  const meetingName = (id?: number) => meetings.find((m) => m.id === id)?.title ?? '—'

  const convert = async (a: ManagementAction) => {
    await api.post(`/actions/${a.id}/convert-to-task`)
    load()
  }

  const closeAction = async (a: ManagementAction) => {
    await api.patch(`/actions/${a.id}`, { ...a, status: 'closed' })
    load()
  }

  const closeDecision = async (d: Decision) => {
    await api.patch(`/decisions/${d.id}`, { ...d, status: 'closed' })
    load()
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Management Actions &amp; Decisions</h1>
          <div className="crumb">Meeting → Decision → Action → Task → Evidence → Closure</div>
        </div>
      </div>

      <div className="row mb">
        <button className={`btn ${tab === 'actions' ? 'primary' : ''}`} onClick={() => setTab('actions')}>Actions ({actions.length})</button>
        <button className={`btn ${tab === 'decisions' ? 'primary' : ''}`} onClick={() => setTab('decisions')}>Decisions ({decisions.length})</button>
        <button className={`btn ${tab === 'risks' ? 'primary' : ''}`} onClick={() => setTab('risks')}>Risks ({risks.length})</button>
        <button className={`btn ${tab === 'issues' ? 'primary' : ''}`} onClick={() => setTab('issues')}>Issues ({issues.length})</button>
      </div>

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
                  <td>{a.action}</td>
                  <td className="small">{meetingName(a.meeting_id)}</td>
                  <td className="small">{name(a.responsible_id)}</td>
                  <td className="small">{name(a.accountable_id)}</td>
                  <td className="small">{fmtDate(a.due_date)}</td>
                  <td><span className={`badge ${a.status === 'closed' ? 'green' : a.status === 'open' ? 'amber' : 'gray'}`}>{label(a.status)}</span></td>
                  <td>
                    <div className="row">
                      {a.status === 'open' && (
                        <>
                          <button className="btn sm" onClick={() => convert(a)}>→ Task</button>
                          <button className="btn sm" onClick={() => closeAction(a)}>Close</button>
                        </>
                      )}
                      {a.converted_task_id && <span className="small muted">TSK #{a.converted_task_id}</span>}
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
                    {d.status === 'open' && <button className="btn sm" onClick={() => closeDecision(d)}>Close</button>}
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
    </div>
  )
}
