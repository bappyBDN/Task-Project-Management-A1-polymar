import { useEffect, useState } from 'react'
import { api } from '../api'
import { AuditEntry } from '../types'
import { label } from '../constants'

export default function Audit() {
  const [entries, setEntries] = useState<AuditEntry[]>([])

  useEffect(() => {
    api.get<AuditEntry[]>('/audit').then(setEntries)
  }, [])

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Audit Trail</h1>
          <div className="crumb">Immutable record of who changed what, and why</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>When</th><th>Actor</th><th>Entity</th><th>Action</th><th>Previous</th><th>New</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="small muted">{new Date(e.happened_at).toLocaleString('en-GB')}</td>
                <td className="small">{e.actor ?? '—'}</td>
                <td className="small">{e.entity_type}{e.entity_id ? ` #${e.entity_id}` : ''}</td>
                <td><span className="badge gray">{label(e.action)}</span></td>
                <td className="small muted">{e.previous_value ?? '—'}</td>
                <td className="small">{e.new_value ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {entries.length === 0 && <div className="empty">No audit entries.</div>}
      </div>
    </div>
  )
}
