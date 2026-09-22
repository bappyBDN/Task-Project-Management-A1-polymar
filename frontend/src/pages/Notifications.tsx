import { useEffect, useState } from 'react'
import { api } from '../api'
import { Notification, User } from '../types'

const KIND_COLORS: Record<string, string> = {
  reminder: 'gray', warning: 'amber', escalation: 'red', assignment: 'gold',
  approval: 'green', action: 'gold', info: 'gray',
}

export default function Notifications() {
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [userId, setUserId] = useState<number | ''>('')
  const [scanMsg, setScanMsg] = useState('')

  const load = () => {
    const q = userId ? `?user_id=${userId}` : ''
    api.get<Notification[]>(`/audit/notifications${q}`).then(setNotifs)
  }

  useEffect(() => {
    load()
    api.get<User[]>('/organizations/users').then(setUsers)
  }, [userId])

  const markRead = async (n: Notification) => {
    await api.post(`/audit/notifications/${n.id}/read`)
    load()
  }

  const scan = async () => {
    const r = await api.post<{ events: { code: string; kind: string }[] }>('/audit/escalations/scan')
    setScanMsg(`Escalation scan complete — ${r.events.length} event(s) generated.`)
    load()
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Notification Center</h1>
          <div className="crumb">Event-driven reminders, warnings and escalations</div>
        </div>
        <button className="btn gold" onClick={scan}>Run Escalation Scan</button>
      </div>

      {scanMsg && <div className="card mb" style={{ background: '#e3f5ea' }}>{scanMsg}</div>}

      <div className="filters">
        <div className="field" style={{ minWidth: 280 }}>
          <label>Filter by user</label>
          <select value={userId} onChange={(e) => setUserId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">All users</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr><th>Kind</th><th>Title</th><th>Recipient</th><th>Read</th><th>When</th><th>Action</th></tr>
          </thead>
          <tbody>
            {notifs.map((n) => (
              <tr key={n.id} style={{ opacity: n.is_read ? 0.55 : 1 }}>
                <td><span className={`badge ${KIND_COLORS[n.kind] ?? 'gray'}`}>{n.kind}</span></td>
                <td>
                  <div className="small" style={{ fontWeight: n.is_read ? 400 : 600 }}>{n.title}</div>
                  {n.body && <div className="muted" style={{ fontSize: 11 }}>{n.body}</div>}
                </td>
                <td className="small">{users.find((u) => u.id === n.user_id)?.name ?? '—'}</td>
                <td>{n.is_read ? <span className="badge green">Read</span> : <span className="badge gray">Unread</span>}</td>
                <td className="small muted">{new Date(n.created_at).toLocaleString('en-GB')}</td>
                <td>
                  {!n.is_read && <button className="btn sm" onClick={() => markRead(n)}>Mark read</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {notifs.length === 0 && <div className="empty">No notifications. Run an escalation scan to generate them.</div>}
      </div>
    </div>
  )
}
