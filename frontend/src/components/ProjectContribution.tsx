import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '../api'
import type { Project, ProjectAssociate, Task, User } from '../types'
import { fmtDate, label } from '../constants'
import SearchableSelect from './SearchableSelect'
import SignupForm from './SignupForm'

// Who contributes to a project, and how much - shown as cards.
// Task work is counted from the tasks: each person's share is the part of the
// project's tasks they are Responsible for; Accountable / Reviewer (Consulted)
// are shown alongside. People who help without being on a task are added as
// "associated" with a short description of their contribution (stored on the server).

const DONE = ['completed', 'closed']
const CLOSED = [...DONE, 'cancelled']
const today = () => new Date().toISOString().slice(0, 10)

// one colour per contributor (fixed order, never cycled); beyond 8 -> grey "others"
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948']
const OTHER = '#9aa3b2'
const UNASSIGNED = '#d5dbe5'

interface Row {
  user: User
  roles: string[] // Project Manager
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
  /** reload the employee list (after adding a new employee); resolves to the new list */
  reloadUsers: () => Promise<User[]>
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')

function Avatar({ name, color }: { name: string; color?: string }) {
  return <div className="avatar" style={{ background: color ?? 'var(--navy)' }} aria-hidden>{initials(name)}</div>
}

function PersonHead({ user, color, children }: { user: User; color?: string; children?: ReactNode }) {
  return (
    <div className="person-head">
      <Avatar name={user.name} color={color} />
      <div className="who" style={{ flex: 1 }}>
        <div className="name" title={user.name}>{user.name}</div>
        <div className="sub">{user.designation || label(user.role)}</div>
      </div>
      {children}
    </div>
  )
}

export default function ProjectContribution({ project, tasks, users, canManage, reloadUsers }: Props) {
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
    row(project.manager_id)?.roles.push('Project Manager')
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

  const contributors = rows.filter((r) => r.resp.length || r.acc || r.rev)
  const associatedOnly = rows.filter((r) => r.associate && !(r.resp.length || r.acc || r.rev))
  const withResp = tasks.filter((t) => t.responsible_id).length

  // colour follows the person (ordered by id), not their rank, so it stays put when numbers change
  const colorOf = useMemo(() => {
    const ids = contributors.map((r) => r.user.id).sort((a, b) => a - b)
    return (uid: number) => { const i = ids.indexOf(uid); return i >= 0 && i < SERIES.length ? SERIES[i] : OTHER }
  }, [contributors])

  // task-share bar: each Responsible's tasks, anyone past 8 colours folded into "Others", then unassigned tasks
  const shareSegments = useMemo(() => {
    const segs: { key: string; name: string; count: number; color: string }[] = []
    let others = 0
    contributors.filter((r) => r.resp.length).forEach((r) => {
      const c = colorOf(r.user.id)
      if (c === OTHER) others += r.resp.length
      else segs.push({ key: String(r.user.id), name: r.user.name, count: r.resp.length, color: c })
    })
    if (others) segs.push({ key: 'others', name: 'Others', count: others, color: OTHER })
    const unassigned = tasks.length - withResp
    if (unassigned) segs.push({ key: 'none', name: 'No Responsible yet', count: unassigned, color: UNASSIGNED })
    return segs
  }, [contributors, colorOf, tasks, withResp])

  const manager = users.find((u) => u.id === project.manager_id)
  const managerRow = rows.find((r) => r.user.id === project.manager_id)

  const remove = async (a: ProjectAssociate) => {
    if (confirmRemove !== a.id) { setConfirmRemove(a.id); return }
    setConfirmRemove(null)
    try {
      await api.del(`/projects/${project.id}/associates/${a.id}`)
      setMsg('Removed from the project.')
      load()
    } catch (e: any) { setLoadErr(e.message || 'Could not remove.') }
  }

  const associateActions = (a: ProjectAssociate) => canManage && (
    <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
      <button className="btn sm" onClick={() => { setMsg(''); setEditing(a) }}>Edit</button>
      <button className="btn sm" onClick={() => remove(a)} onBlur={() => setConfirmRemove(null)}>
        {confirmRemove === a.id ? 'Click to confirm' : 'Remove'}
      </button>
    </div>
  )

  const addedBy = (a: ProjectAssociate) => {
    const by = users.find((u) => u.id === a.added_by_id)?.name
    const when = a.created_at ? fmtDate(a.created_at.slice(0, 10)) : ''
    return [by && `Added by ${by}`, when].filter(Boolean).join(' · ')
  }

  return (
    <div className="card mt">
      <div className="row spread" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="section-title" style={{ margin: 0 }}>Contributors &amp; Associates ({rows.length})</div>
          <div className="small muted" style={{ marginTop: 4 }}>
            {contributors.length} contributing on tasks · {associates.length} associated outside tasks
          </div>
        </div>
        {canManage && <button className="btn primary sm" onClick={() => { setMsg(''); setEditing('new') }}>+ Add Associated Person</button>}
      </div>
      {msg && <div className="alert success mt" role="status">{msg}</div>}
      {loadErr && <div className="alert error mt" role="alert">{loadErr}</div>}

      {/* ---- project manager ---- */}
      <div className="subhead">Project Manager</div>
      <div className="person-card key" style={{ maxWidth: 420 }}>
        {manager ? (
          <PersonHead user={manager} color={contributors.some((r) => r.user.id === manager.id) ? colorOf(manager.id) : undefined}>
            {managerRow && (managerRow.resp.length > 0 || managerRow.acc > 0 || managerRow.rev > 0) && (
              <div className="row" style={{ gap: 4 }}>
                <span className="raci-chip R" title="Responsible">R {managerRow.resp.length}</span>
                <span className="raci-chip A" title="Accountable">A {managerRow.acc}</span>
                <span className="raci-chip C" title="Consulted (Reviewer)">C {managerRow.rev}</span>
              </div>
            )}
          </PersonHead>
        ) : (
          <div className="person-head">
            <div className="avatar empty">?</div>
            <div className="who" style={{ flex: 1 }}><div className="name muted">Not set</div></div>
          </div>
        )}
      </div>

      {/* ---- task share across contributors ---- */}
      <div className="subhead">Task Share (who is Responsible for the {tasks.length} task{tasks.length === 1 ? '' : 's'})</div>
      {tasks.length === 0 ? <div className="small muted">No tasks yet.</div> : (
        <>
          <div className="stackbar lg" role="img"
            aria-label={shareSegments.map((s) => `${s.name} ${s.count}`).join(', ')}>
            {shareSegments.map((s) => (
              <span key={s.key} style={{ width: `${(s.count / tasks.length) * 100}%`, background: s.color }}
                title={`${s.name}: ${s.count} task(s) · ${Math.round((s.count / tasks.length) * 100)}%`} />
            ))}
          </div>
          <div className="legend" style={{ marginTop: 8 }}>
            {shareSegments.map((s) => (
              <span key={s.key}><i style={{ background: s.color }} /><b>{s.name}</b> {s.count} · {Math.round((s.count / tasks.length) * 100)}%</span>
            ))}
          </div>
        </>
      )}

      {/* ---- contributors (on tasks) ---- */}
      <div className="subhead">Contributors on Tasks ({contributors.length})</div>
      {contributors.length === 0 ? <div className="small muted">No one is assigned to a task yet.</div> : (
        <div className="people-grid">
          {contributors.map((r) => {
            const done = r.resp.filter((t) => DONE.includes(t.status)).length
            const overdue = r.resp.filter((t) => {
              const due = t.approved_due_date || t.baseline_due_date
              return !CLOSED.includes(t.status) && !!due && due < today()
            }).length
            const open = r.resp.filter((t) => !CLOSED.includes(t.status)).length - overdue
            const cancelled = r.resp.length - done - open - overdue
            const avg = r.resp.length ? Math.round(r.resp.reduce((s, t) => s + (t.progress_pct || 0), 0) / r.resp.length) : null
            const share = tasks.length ? Math.round((r.resp.length / tasks.length) * 100) : 0
            const status = [
              { k: 'Done', n: done, c: 'var(--green)' },
              { k: 'Open', n: open, c: 'var(--navy)' },
              { k: 'Overdue', n: overdue, c: 'var(--red)' },
              { k: 'Cancelled', n: cancelled, c: OTHER },
            ].filter((s) => s.n)
            return (
              <div key={r.user.id} className="person-card">
                <PersonHead user={r.user} color={colorOf(r.user.id)}>
                  {r.resp.length > 0 && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)', lineHeight: 1 }}>{share}%</div>
                      <div className="muted" style={{ fontSize: 10 }}>task share</div>
                    </div>
                  )}
                </PersonHead>

                {(r.roles.length > 0 || r.associate) && (
                  <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                    {r.roles.map((x) => <span key={x} className="badge gold" style={{ fontSize: 10 }}>{x}</span>)}
                    {r.associate && <span className="badge gray" style={{ fontSize: 10 }}>Associated</span>}
                  </div>
                )}

                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <span className="raci-chip R" title="Responsible">R {r.resp.length}</span>
                  <span className="raci-chip A" title="Accountable">A {r.acc}</span>
                  <span className="raci-chip C" title="Consulted (Reviewer)">C {r.rev}</span>
                </div>

                {r.resp.length > 0 ? (
                  <div>
                    <div className="stackbar" role="img" aria-label={status.map((s) => `${s.k} ${s.n}`).join(', ')}>
                      {status.map((s) => (
                        <span key={s.k} style={{ width: `${(s.n / r.resp.length) * 100}%`, background: s.c }} title={`${s.k}: ${s.n}`} />
                      ))}
                    </div>
                    <div className="legend" style={{ marginTop: 6 }}>
                      {status.map((s) => <span key={s.k}><i style={{ background: s.c }} />{s.k} <b>{s.n}</b></span>)}
                    </div>
                    <div className="row" style={{ gap: 8, marginTop: 8 }}>
                      <span className="small muted" style={{ whiteSpace: 'nowrap' }}>Avg progress</span>
                      <div className="progress" style={{ flex: 1, minWidth: 0 }}><span style={{ width: `${avg}%` }} /></div>
                      <span className="small" style={{ fontWeight: 600 }}>{avg}%</span>
                    </div>
                  </div>
                ) : (
                  <div className="small muted">
                    {[r.acc && `Accountable for ${r.acc} task(s)`, r.rev && `reviews ${r.rev}`].filter(Boolean).join(', ')}
                  </div>
                )}

                {r.associate && (
                  <>
                    <div className="contribution-note">{r.associate.contribution}</div>
                    {associateActions(r.associate)}
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ---- associated people (help outside tasks) ---- */}
      <div className="subhead">Associated People ({associatedOnly.length})</div>
      {associatedOnly.length === 0 ? (
        <div className="small muted">
          No one associated outside tasks yet.{canManage && ' Use "+ Add Associated Person" for people who help without being on a task.'}
        </div>
      ) : (
        <div className="people-grid">
          {associatedOnly.map((r) => (
            <div key={r.user.id} className="person-card associate">
              <PersonHead user={r.user} color="var(--gold)">
                <span className="badge gray" style={{ fontSize: 10 }}>Associated</span>
              </PersonHead>
              {r.roles.length > 0 && (
                <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                  {r.roles.map((x) => <span key={x} className="badge gold" style={{ fontSize: 10 }}>{x}</span>)}
                </div>
              )}
              <div>
                <div className="small muted" style={{ marginBottom: 4 }}>Contribution</div>
                <div className="contribution-note">{r.associate!.contribution}</div>
              </div>
              <div className="row spread" style={{ flexWrap: 'wrap', gap: 6 }}>
                <span className="muted" style={{ fontSize: 11 }}>{addedBy(r.associate!)}</span>
                {associateActions(r.associate!)}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <AssociateModal
          projectId={project.id}
          existing={editing === 'new' ? null : editing}
          users={users.filter((u) => u.is_active !== false && (editing !== 'new' || !associates.some((a) => a.user_id === u.id)))}
          reloadUsers={reloadUsers}
          onClose={() => setEditing(null)}
          onSaved={(text) => { setEditing(null); setMsg(text); load() }}
        />
      )}
    </div>
  )
}

function AssociateModal({ projectId, existing, users, reloadUsers, onClose, onSaved }: {
  projectId: number
  existing: ProjectAssociate | null
  users: User[]
  reloadUsers: () => Promise<User[]>
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [userId, setUserId] = useState(existing ? String(existing.user_id) : '')
  const [contribution, setContribution] = useState(existing?.contribution ?? '')
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [saving, setSaving] = useState(false)
  const [addingEmployee, setAddingEmployee] = useState(false)
  // someone just added may not be in `users` until the parent re-renders
  const [added, setAdded] = useState<User | null>(null)
  const person = users.find((u) => String(u.id) === userId) ?? (added && String(added.id) === userId ? added : undefined)
  const choices = added && !users.some((u) => u.id === added.id) ? [...users, added] : users

  // new employee created with the sign-up form: pick them here right away
  const employeeAdded = async (message: string, employeeId: string) => {
    setAddingEmployee(false)
    setErr('')
    try {
      const list = await reloadUsers()
      const u = list.find((x) => x.employee_id.trim().toLowerCase() === employeeId.toLowerCase())
      if (u) { setAdded(u); setUserId(String(u.id)) }
      setInfo(`${message}${u ? ` ${u.name} is selected below - now describe their contribution.` : ''}`)
    } catch {
      setInfo(`${message} Pick them from the list.`)
    }
  }

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
        {info && <div className="alert success" role="status">{info}</div>}
        <label>Employee *</label>
        {existing
          ? <input value={person?.name ?? ''} disabled />
          : <SearchableSelect
              value={userId}
              items={choices.map((u) => ({ value: String(u.id), label: u.designation ? `${u.name} - ${u.designation}` : u.name }))}
              onChange={setUserId}
              placeholder="Search employee…"
              onAddNew={() => { setInfo(''); setAddingEmployee(true) }}
              addLabel="Add new employee (not in the system)"
            />}
        {!existing && <div className="small muted" style={{ marginTop: 4 }}>Not in the list? Choose "+ Add new employee" at the top of the list.</div>}
        <label>Contribution *</label>
        <textarea rows={4} maxLength={1000} value={contribution} onChange={(e) => setContribution(e.target.value)}
          placeholder="e.g. Provided vendor quotations and negotiated the supply contract" />
        <div className="small muted">{contribution.length}/1000</div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      {addingEmployee && (
        <div className="modal-backdrop" onClick={(e) => { e.stopPropagation(); setAddingEmployee(false) }}>
          <div className="modal" style={{ maxWidth: 620, maxHeight: '92vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h2>Add New Employee</h2>
            <div className="small muted mb">
              Same as the Sign Up form: they get an email with a link to set their password, as an Employee (an admin can change the role).
            </div>
            <SignupForm forOther submitLabel="Create Employee" onSuccess={employeeAdded} onCancel={() => setAddingEmployee(false)} />
          </div>
        </div>
      )}
    </div>
  )
}
