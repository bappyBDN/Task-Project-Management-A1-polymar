import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import type { Project, ProjectAssociate, Task, User } from '../types'
import { label } from '../constants'
import SearchableSelect from './SearchableSelect'

// Who contributes to a project, and how much.
// Task work is counted from the tasks: each person's share is the part of the
// project's tasks they are Responsible for; Accountable / Reviewer are shown
// alongside. People who help without being on a task are added as "associated"
// with a short description of their contribution (stored on the server).

const DONE = ['completed', 'closed']
const CLOSED = [...DONE, 'cancelled']
const today = () => new Date().toISOString().slice(0, 10)

interface Row {
  user: User
  roles: string[] // Manager / Owner / Sponsor
  resp: Task[]
  acc: number
  rev: number
  associate?: ProjectAssociate
}

interface Props {
  project: Project
  tasks: Task[]
  users: User[]
  canManage: boolean
}

export default function ProjectContribution({ project, tasks, users, canManage }: Props) {
  const [associates, setAssociates] = useState<ProjectAssociate[]>([])
  const [loadErr, setLoadErr] = useState('')
  const [editing, setEditing] = useState<ProjectAssociate | 'new' | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null)
  const [msg, setMsg] = useState('')

  const load = () =>
    api.get<ProjectAssociate[]>(`/projects/${project.id}/associates`)
      .then((a) => { setAssociates(a); setLoadErr('') })
      .catch((e) => setLoadErr(`Could not load associated people: ${e.message || e}`))
  useEffect(() => { load() }, [project.id])

  const rows = useMemo(() => {
    const map = new Map<number, Row>()
    const row = (uid?: number | null) => {
      if (!uid) return undefined
      const user = users.find((u) => u.id === uid)
      if (!user) return undefined
      if (!map.has(uid)) map.set(uid, { user, roles: [], resp: [], acc: 0, rev: 0 })
      return map.get(uid)!
    }
    ;([[project.manager_id, 'Project Manager'], [project.owner_id, 'Owner'], [project.sponsor_id, 'Sponsor']] as const)
      .forEach(([uid, r]) => { const x = row(uid); if (x && !x.roles.includes(r)) x.roles.push(r) })
    tasks.forEach((t) => {
      row(t.responsible_id)?.resp.push(t)
      const a = row(t.accountable_id); if (a) a.acc++
      const v = row(t.reviewer_id); if (v) v.rev++
    })
    associates.forEach((a) => { const x = row(a.user_id); if (x) x.associate = a })
    // most task work first, then Accountable / Reviewer, then the rest by name
    return [...map.values()].sort((a, b) =>
      b.resp.length - a.resp.length
      || b.resp.filter((t) => DONE.includes(t.status)).length - a.resp.filter((t) => DONE.includes(t.status)).length
      || b.acc - a.acc || b.rev - a.rev || a.user.name.localeCompare(b.user.name))
  }, [project, tasks, users, associates])

  const withResp = tasks.filter((t) => t.responsible_id).length
  const onTasks = rows.filter((r) => r.resp.length || r.acc || r.rev).length
  const maxResp = Math.max(1, ...rows.map((r) => r.resp.length))

  const remove = async (a: ProjectAssociate) => {
    if (confirmRemove !== a.id) { setConfirmRemove(a.id); return }
    setConfirmRemove(null)
    try {
      await api.del(`/projects/${project.id}/associates/${a.id}`)
      setMsg('Removed from the project.')
      load()
    } catch (e: any) { setLoadErr(e.message || 'Could not remove.') }
  }

  return (
    <div className="card mt">
      <div className="row spread" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="section-title" style={{ margin: 0 }}>Contribution &amp; Association ({rows.length})</div>
          <div className="small muted" style={{ marginTop: 4 }}>
            {onTasks} on tasks · {associates.length} associated · share = part of the project's {withResp} task(s) they are Responsible for
          </div>
        </div>
        {canManage && <button className="btn primary sm" onClick={() => { setMsg(''); setEditing('new') }}>+ Add Associated Person</button>}
      </div>
      {msg && <div className="alert success mt" role="status">{msg}</div>}
      {loadErr && <div className="alert error mt" role="alert">{loadErr}</div>}

      {rows.length === 0 ? <div className="small muted mt">No one is on this project yet.</div> : (
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Employee</th><th>Responsible (share)</th><th>Done</th><th>Open</th><th>Overdue</th>
                <th>Avg Progress</th><th>Accountable</th><th>Reviewer</th><th>Contribution</th>{canManage && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const done = r.resp.filter((t) => DONE.includes(t.status)).length
                const open = r.resp.filter((t) => !CLOSED.includes(t.status)).length
                const overdue = r.resp.filter((t) => {
                  const due = t.approved_due_date || t.baseline_due_date
                  return !CLOSED.includes(t.status) && !!due && due < today()
                }).length
                const avg = r.resp.length ? Math.round(r.resp.reduce((s, t) => s + (t.progress_pct || 0), 0) / r.resp.length) : null
                const share = withResp ? Math.round((r.resp.length / withResp) * 100) : 0
                const auto = [r.resp.length && `Responsible for ${r.resp.length} task(s)`, r.acc && `accountable for ${r.acc}`, r.rev && `reviews ${r.rev}`].filter(Boolean).join(', ')
                return (
                  <tr key={r.user.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.user.name}</div>
                      <div className="muted" style={{ fontSize: 11 }}>{r.user.designation || label(r.user.role)}</div>
                      <div className="row" style={{ gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                        {r.roles.map((x) => <span key={x} className="badge gold" style={{ fontSize: 10 }}>{x}</span>)}
                        {r.associate && <span className="badge gray" style={{ fontSize: 10 }}>Associated</span>}
                      </div>
                    </td>
                    <td style={{ minWidth: 150 }}>
                      {r.resp.length ? (
                        <>
                          <div className="progress"><span style={{ width: `${(r.resp.length / maxResp) * 100}%` }} /></div>
                          <span className="small"><b>{r.resp.length}</b> task(s) · {share}%</span>
                        </>
                      ) : <span className="muted small">—</span>}
                    </td>
                    <td className="small">{r.resp.length ? done : '—'}</td>
                    <td className="small">{r.resp.length ? open : '—'}</td>
                    <td className="small" style={{ color: overdue ? 'var(--red)' : undefined, fontWeight: overdue ? 700 : undefined }}>{r.resp.length ? overdue : '—'}</td>
                    <td className="small">{avg === null ? '—' : `${avg}%`}</td>
                    <td className="small">{r.acc || '—'}</td>
                    <td className="small">{r.rev || '—'}</td>
                    <td className="small" style={{ minWidth: 200, maxWidth: 360, whiteSpace: 'pre-wrap' }}>
                      {r.associate ? r.associate.contribution : <span className="muted">{auto ? auto[0].toUpperCase() + auto.slice(1) : '—'}</span>}
                    </td>
                    {canManage && (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {r.associate && (
                          <div className="row" style={{ gap: 4 }}>
                            <button className="btn sm" onClick={() => { setMsg(''); setEditing(r.associate!) }}>Edit</button>
                            <button className="btn sm" onClick={() => remove(r.associate!)} onBlur={() => setConfirmRemove(null)}>
                              {confirmRemove === r.associate.id ? 'Click to confirm' : 'Remove'}
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <AssociateModal
          projectId={project.id}
          existing={editing === 'new' ? null : editing}
          users={users.filter((u) => u.is_active !== false && (editing !== 'new' || !associates.some((a) => a.user_id === u.id)))}
          onClose={() => setEditing(null)}
          onSaved={(text) => { setEditing(null); setMsg(text); load() }}
        />
      )}
    </div>
  )
}

function AssociateModal({ projectId, existing, users, onClose, onSaved }: {
  projectId: number
  existing: ProjectAssociate | null
  users: User[]
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [userId, setUserId] = useState(existing ? String(existing.user_id) : '')
  const [contribution, setContribution] = useState(existing?.contribution ?? '')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const person = users.find((u) => String(u.id) === userId)

  const save = async () => {
    if (!userId) { setErr('Choose the employee'); return }
    if (!contribution.trim()) { setErr('Describe their contribution to the project'); return }
    setSaving(true); setErr('')
    try {
      if (existing) await api.patch(`/projects/${projectId}/associates/${existing.id}`, { contribution: contribution.trim() })
      else await api.post(`/projects/${projectId}/associates`, { user_id: Number(userId), contribution: contribution.trim() })
      onSaved(existing ? 'Contribution updated.' : `${person?.name ?? 'Employee'} associated with the project.`)
    } catch (e: any) {
      setErr(e.message || 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{existing ? `Contribution - ${person?.name ?? ''}` : 'Add Associated Person'}</h2>
        {err && <div className="alert error" role="alert">{err}</div>}
        <label>Employee *</label>
        {existing
          ? <input value={person?.name ?? ''} disabled />
          : <SearchableSelect value={userId} items={users.map((u) => ({ value: String(u.id), label: u.designation ? `${u.name} - ${u.designation}` : u.name }))} onChange={setUserId} placeholder="Search employee…" />}
        <label>Contribution *</label>
        <textarea rows={4} maxLength={1000} value={contribution} onChange={(e) => setContribution(e.target.value)}
          placeholder="e.g. Provided vendor quotations and negotiated the supply contract" />
        <div className="small muted">{contribution.length}/1000</div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}
