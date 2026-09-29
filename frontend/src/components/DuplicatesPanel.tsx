import { useState } from 'react'
import { api } from '../api'
import type { Company, Department, Function, Project, Task, User } from '../types'
import { norm, pickSbu, sbuKey } from './SbuSelect'

// Admin clean-up of SBUs / functions / departments entered more than once.
// "Merge" moves every task, project and user from the extra copies onto the one
// kept, one record at a time through the normal edit calls, so nothing is lost:
// stopping half-way just leaves some records still on the old copy, and pressing
// Merge again carries on. Only then is an extra department deleted (the one kind
// the server can delete); an emptied SBU / function stays in the list, unused.

type Kind = 'company' | 'function' | 'department'
type Item = { id: number; name: string }

const FIELD = { company: 'company_id', function: 'function_id', department: 'department_id' } as const
const TITLE = { company: 'SBUs (Companies)', function: 'Functions', department: 'Departments' }

interface Props {
  companies: Company[]
  functions: Function[]
  departments: Department[]
  tasks: Task[]
  projects: Project[]
  users: User[]
  onDone: () => void // reload the admin lists
}

export default function DuplicatesPanel({ companies, functions, departments, tasks, projects, users, onDone }: Props) {
  const [keepChoice, setKeepChoice] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  const usage = (kind: Kind, id: number) => {
    const f = FIELD[kind]
    return {
      tasks: tasks.filter((t) => (t as any)[f] === id),
      projects: kind === 'department' ? [] : projects.filter((p) => (p as any)[f] === id),
      users: users.filter((u) => (u as any)[f] === id),
    }
  }
  const total = (kind: Kind, id: number) => {
    const u = usage(kind, id)
    return u.tasks.length + u.projects.length + u.users.length
  }

  const groupsOf = (kind: Kind, list: Item[]) => {
    const key = kind === 'company' ? sbuKey : norm
    const byKey = new Map<string, Item[]>()
    for (const it of list) byKey.set(key(it.name), [...(byKey.get(key(it.name)) ?? []), it])
    return [...byKey.entries()].filter(([, items]) => items.length > 1).map(([k, items]) => {
      // SBUs: the copy the dropdowns use (see SbuSelect). Others: admin's pick, default the most used.
      const auto = kind === 'company'
        ? pickSbu(items)!.id
        : [...items].sort((a, b) => total(kind, b.id) - total(kind, a.id) || a.id - b.id)[0].id
      const gid = `${kind}:${k}`
      return { gid, items, keep: kind === 'company' ? auto : keepChoice[gid] ?? auto }
    })
  }

  const merge = async (kind: Kind, items: Item[], keep: number) => {
    const extras = items.filter((i) => i.id !== keep)
    const keptName = items.find((i) => i.id === keep)!.name
    const moves: { label: string; call: () => Promise<unknown> }[] = []
    const f = FIELD[kind]
    for (const e of extras) {
      const u = usage(kind, e.id)
      for (const t of u.tasks) moves.push({ label: `task ${t.code}`, call: () => api.patch(`/tasks/${t.id}`, { [f]: keep }) })
      for (const p of u.projects) moves.push({ label: `project ${p.code}`, call: () => api.patch(`/projects/${p.id}`, { [f]: keep }) })
      for (const x of u.users) moves.push({ label: `user ${x.name}`, call: () => api.patch(`/organizations/users/${x.id}`, { [f]: keep }) })
    }
    if (!confirm(`Move ${moves.length} record(s) onto "${keptName}" (id ${keep})` +
      (kind === 'department' ? ` and then delete the ${extras.length} extra department(s)?` : '?'))) return

    setBusy(kind); setResult(null)
    let done = 0
    try {
      for (const m of moves) {
        setProgress(`Moving ${m.label} (${done + 1} of ${moves.length})…`)
        try { await m.call() } catch (e: any) { throw new Error(`Could not move ${m.label}: ${e?.message ?? e}`) }
        done++
      }
      const notes: string[] = []
      if (kind === 'department') {
        for (const e of extras) {
          setProgress(`Deleting department "${e.name}" (id ${e.id})…`)
          try {
            await api.del(`/organizations/departments/${e.id}`)
          } catch {
            // the database refuses while something (e.g. a deleted task) still points at it - nothing is lost
            notes.push(`Department id ${e.id} was not deleted: something still uses it (for example a deleted task).`)
          }
        }
      } else {
        notes.push(`The emptied ${kind === 'company' ? 'SBU' : 'function'}(s) stay in the list - they can only be deleted on the server.`)
      }
      setResult({ ok: true, text: `Moved ${done} record(s) onto "${keptName}". ${notes.join(' ')}` })
    } catch (e: any) {
      setResult({ ok: false, text: `${e.message} ${done} record(s) were moved before this. Nothing else changed - press Merge again to continue.` })
    } finally {
      setBusy(null); setProgress('')
      onDone()
    }
  }

  const sections: [Kind, Item[]][] = [['company', companies], ['function', functions], ['department', departments]]
  const all = sections.map(([kind, list]) => [kind, groupsOf(kind, list)] as const)

  return (
    <div className="card">
      <div className="section-title">Duplicate SBUs, Functions &amp; Departments</div>
      <div className="small muted mb">
        Entries with the same name (ignoring case, spaces and "Ltd") are listed together.
        <strong> Merge</strong> moves their tasks, projects and users onto the copy you keep - no record is deleted.
      </div>
      {result && <div className={`alert ${result.ok ? 'success' : 'error'}`} role="status">{result.text}</div>}
      {progress && <div className="alert info">{progress}</div>}

      {all.every(([, groups]) => groups.length === 0) && <div className="muted">No duplicates found.</div>}

      {all.map(([kind, groups]) => groups.length > 0 && (
        <div key={kind} className="mb">
          <h3 style={{ margin: '14px 0 6px' }}>{TITLE[kind]}</h3>
          {groups.map((g) => {
            const moving = g.items.filter((i) => i.id !== g.keep).reduce((n, i) => n + total(kind, i.id), 0)
            return (
              <div key={g.gid} style={{ overflowX: 'auto', marginBottom: 12 }}>
                <table>
                  <thead>
                    <tr><th>Keep</th><th>ID</th><th>Name</th><th>Tasks</th>{kind !== 'department' && <th>Projects</th>}<th>Users</th></tr>
                  </thead>
                  <tbody>
                    {g.items.map((i) => {
                      const u = usage(kind, i.id)
                      return (
                        <tr key={i.id}>
                          <td>
                            <input
                              type="radio" name={g.gid} checked={g.keep === i.id} disabled={kind === 'company' || !!busy}
                              onChange={() => setKeepChoice((c) => ({ ...c, [g.gid]: i.id }))}
                              title={kind === 'company' ? 'The SBU dropdowns use this copy' : undefined}
                            />
                          </td>
                          <td className="muted small">{i.id}</td>
                          <td>{i.name}</td>
                          <td>{u.tasks.length}</td>
                          {kind !== 'department' && <td>{u.projects.length}</td>}
                          <td>{u.users.length}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div className="row" style={{ marginTop: 6, alignItems: 'center', gap: 10 }}>
                  <button className="btn primary sm" disabled={!!busy} onClick={() => merge(kind, g.items, g.keep)}>
                    {busy === kind ? 'Merging…' : `Merge into id ${g.keep}`}
                  </button>
                  <span className="small muted">
                    {moving ? `${moving} record(s) will move.` : 'Nothing to move.'}
                    {kind === 'company' && ' For SBUs the kept copy is the one the dropdowns use.'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
