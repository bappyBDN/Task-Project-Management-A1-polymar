import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { AuditEntry } from '../types'
import { label } from '../constants'

export default function Audit() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [entity, setEntity] = useState('')

  useEffect(() => {
    api.get<AuditEntry[]>('/audit?limit=500')
      .then(setEntries)
      .catch((e) => setErr(`Could not load the audit trail: ${e.message || e}`))
      .finally(() => setLoading(false))
  }, [])

  const entityTypes = useMemo(() => [...new Set(entries.map((e) => e.entity_type))].sort(), [entries])
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return entries.filter((e) => {
      if (entity && e.entity_type !== entity) return false
      if (!needle) return true
      return [e.actor, e.action, e.previous_value, e.new_value, e.entity_type, e.entity_id]
        .some((v) => v != null && String(v).toLowerCase().includes(needle))
    })
  }, [entries, q, entity])

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Audit Trail</h1>
          <div className="crumb">Immutable record of who changed what, and why</div>
        </div>
      </div>

      {err && <div className="alert error" role="alert">{err}</div>}

      <div className="filters">
        <div className="field" style={{ minWidth: 260 }}>
          <label htmlFor="audit-q">Search</label>
          <input id="audit-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Actor, action, value…" />
        </div>
        <div className="field">
          <label htmlFor="audit-entity">Entity</label>
          <select id="audit-entity" value={entity} onChange={(e) => setEntity(e.target.value)}>
            <option value="">All</option>
            {entityTypes.map((t) => <option key={t} value={t}>{label(t)}</option>)}
          </select>
        </div>
      </div>
      <div className="small muted" style={{ margin: '0 0 10px 2px' }}>
        {loading ? 'Loading…' : `${shown.length} of ${entries.length} most recent entries`}
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>When</th><th>Actor</th><th>Entity</th><th>Action</th><th>Previous</th><th>New</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => (
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
        {shown.length === 0 && <div className="empty">{loading ? 'Loading…' : err ? 'The audit trail could not be loaded.' : entries.length ? 'No entries match your search.' : 'No audit entries.'}</div>}
      </div>
    </div>
  )
}
