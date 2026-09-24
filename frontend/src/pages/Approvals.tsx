import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { Approval, Task, User } from '../types'
import { fmtDate, label } from '../constants'

export default function Approvals() {
  const { user } = useAuth()
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [mineOnly, setMineOnly] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState('')

  const isAdmin = user?.role === 'admin'

  // The server already returns only approvals this user is related to (admins get all).
  const load = () => {
    api.get<Approval[]>('/approvals').then(setApprovals).catch(() => setApprovals([]))
  }

  useEffect(() => {
    load()
    api.get<Task[]>('/tasks').then(setTasks).catch(() => {})
    api.get<User[]>('/organizations/users').then(setUsers).catch(() => {})
  }, [])

  const decide = async (a: Approval, status: 'approved' | 'rejected') => {
    setError('')
    setBusyId(a.id)
    try {
      await api.post(`/approvals/${a.id}/decision`, { status, reason: status === 'approved' ? 'Approved' : 'Rejected' })
    } catch (e: any) {
      setError(e?.message || 'Could not save the decision.')
    } finally {
      setBusyId(null)
      load()
    }
  }

  const taskOf = (a: Approval) => (a.entity_type === 'task' ? tasks.find((t) => t.id === a.entity_id) : undefined)
  const nameOf = (id?: number) => users.find((u) => u.id === id)?.name

  // Same rule the server enforces: admin, assigned approver, or the task's
  // reviewer / accountable (date revisions: reviewer only) - but never the
  // person who requested it.
  const canDecide = (a: Approval) => {
    if (!user || a.status !== 'pending') return false
    if (isAdmin) return true
    if (a.requested_by_id === user.id) return false
    const t = taskOf(a)
    // Date revisions: only the task's Reviewer decides.
    if (a.approval_type === 'revised_date' && a.entity_type === 'task') return !!t && t.reviewer_id === user.id
    if (a.approver_id === user.id) return true
    return !!t && (t.reviewer_id === user.id || t.accountable_id === user.id)
  }

  const visible = mineOnly
    ? approvals.filter((a) => a.approver_id === user?.id || a.requested_by_id === user?.id || canDecide(a))
    : approvals

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Approvals</h1>
          <div className="crumb">Completion, revised-date and project approvals</div>
        </div>
      </div>

      <div className="row mb">
        <button className={`btn sm ${mineOnly ? 'primary' : ''}`} onClick={() => setMineOnly(true)}>My Approvals</button>
        <button className={`btn sm ${!mineOnly ? 'primary' : ''}`} onClick={() => setMineOnly(false)}>All Approvals ({approvals.length})</button>
      </div>

      {error && <div className="card mb" style={{ background: '#fbe5e5', color: 'var(--red)' }}>{error}</div>}

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Type</th><th>Entity</th><th>Requested By</th><th>Approver</th><th>Status</th><th>Requested</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((a) => {
              const t = taskOf(a)
              return (
                <tr key={a.id}>
                  <td><span className="badge gold">{label(a.approval_type)}</span></td>
                  <td className="small">
                    <Link to={`/approvals/${a.id}`} title="Open full details" style={{ color: 'var(--navy)', fontWeight: 600, textDecoration: 'underline' }}>
                      {t ? `${t.code} — ${t.title}` : `${a.entity_type} #${a.entity_id}`}
                    </Link>
                  </td>
                  <td className="small">{nameOf(a.requested_by_id) ?? '—'}</td>
                  <td className="small">{nameOf(a.approver_id) ?? '—'}</td>
                  <td>
                    <span className={`badge ${a.status === 'approved' ? 'green' : a.status === 'rejected' ? 'red' : 'amber'}`}>{label(a.status)}</span>
                  </td>
                  <td className="small">{fmtDate(a.created_at?.slice(0, 10))}</td>
                  <td>
                    {a.status === 'pending' && canDecide(a) ? (
                      <div className="row">
                        <button className="btn sm" disabled={busyId === a.id} onClick={() => decide(a, 'approved')}>Approve</button>
                        <button className="btn sm danger" disabled={busyId === a.id} onClick={() => decide(a, 'rejected')}>Reject</button>
                      </div>
                    ) : a.status === 'pending' ? (
                      <span className="small muted">Awaiting {nameOf(a.approver_id) ?? 'approver'}</span>
                    ) : (
                      <span className="small muted">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {visible.length === 0 && <div className="empty">{mineOnly ? 'No approvals assigned to or requested by you.' : 'No approvals yet. Submit a task for completion to create one.'}</div>}
      </div>
    </div>
  )
}