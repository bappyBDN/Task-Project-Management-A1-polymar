import { useEffect, useState } from 'react'
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

  const load = () => {
    api.get<Approval[]>('/approvals').then(setApprovals)
  }

  useEffect(() => {
    load()
    api.get<Task[]>('/tasks').then(setTasks)
    api.get<User[]>('/organizations/users').then(setUsers)
  }, [])

  const decide = async (a: Approval, status: 'approved' | 'rejected') => {
    await api.post(`/approvals/${a.id}/decision`, { status, reason: status === 'approved' ? 'Approved' : 'Rejected' })
    load()
  }

  const taskOf = (id: number) => tasks.find((t) => t.id === id)
  const nameOf = (id?: number) => users.find((u) => u.id === id)?.name

  const visible = mineOnly
    ? approvals.filter((a) => a.approver_id === user?.id || a.requested_by_id === user?.id)
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

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Type</th><th>Entity</th><th>Requested By</th><th>Approver</th><th>Status</th><th>Requested</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((a) => {
              const t = taskOf(a.entity_id)
              return (
                <tr key={a.id}>
                  <td><span className="badge gold">{label(a.approval_type)}</span></td>
                  <td className="small">{t ? `${t.code} — ${t.title}` : `${a.entity_type} #${a.entity_id}`}</td>
                  <td className="small">{nameOf(a.requested_by_id) ?? '—'}</td>
                  <td className="small">{nameOf(a.approver_id) ?? '—'}</td>
                  <td>
                    <span className={`badge ${a.status === 'approved' ? 'green' : a.status === 'rejected' ? 'red' : 'amber'}`}>{label(a.status)}</span>
                  </td>
                  <td className="small">{fmtDate(a.created_at?.slice(0, 10))}</td>
                  <td>
                    {a.status === 'pending' ? (
                      <div className="row">
                        <button className="btn sm" onClick={() => decide(a, 'approved')}>Approve</button>
                        <button className="btn sm danger" onClick={() => decide(a, 'rejected')}>Reject</button>
                      </div>
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
