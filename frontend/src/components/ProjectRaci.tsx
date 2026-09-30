import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import type { RaciMatrix, Task } from '../types'

// The project's RACI, always shown on the project page as a compact chart:
// one bar per person, split into R / A / C / I (bar length = number of task roles).
// The task-by-task matrix (same data as the RACI Matrix page) opens on demand.

const RACI = [
  { k: 'R', name: 'Responsible', what: 'does the work', color: 'var(--navy)' },
  { k: 'A', name: 'Accountable', what: 'owns the result', color: 'var(--gold)' },
  { k: 'C', name: 'Consulted', what: 'reviews / advises', color: 'var(--green)' },
  { k: 'I', name: 'Informed', what: 'kept up to date', color: '#b7c0cd' },
] as const
type Letter = typeof RACI[number]['k']

export default function ProjectRaci({ projectId, tasks }: { projectId: number; tasks: Task[] }) {
  const [matrix, setMatrix] = useState<RaciMatrix | null>(null)
  const [error, setError] = useState('')
  const [showMatrix, setShowMatrix] = useState(false)

  // reload when the project's tasks change (e.g. a Responsible was reassigned)
  useEffect(() => {
    let cancelled = false
    api.get<RaciMatrix>(`/raci/matrix/${projectId}`)
      .then((m) => { if (!cancelled) { setMatrix(m); setError('') } })
      .catch((e: any) => { if (!cancelled) setError(e?.message || 'Could not load the RACI.') })
    return () => { cancelled = true }
  }, [projectId, tasks])

  // per person: on how many tasks they hold each letter
  const people = useMemo(() => {
    if (!matrix) return []
    return matrix.users.map((u) => {
      const n: Record<Letter, number> = { R: 0, A: 0, C: 0, I: 0 }
      matrix.rows.forEach((r) => r.cells.find((c) => c.user_id === u.id)?.value.split('')
        .forEach((ch) => { if (ch in n) n[ch as Letter]++ }))
      return { ...u, n, total: n.R + n.A + n.C + n.I }
    }).sort((a, b) => b.total - a.total || b.n.R - a.n.R || a.name.localeCompare(b.name))
  }, [matrix])
  const max = Math.max(1, ...people.map((p) => p.total))

  return (
    <div className="card mt">
      <div className="row spread" style={{ flexWrap: 'wrap', gap: 6 }}>
        <div className="section-title" style={{ margin: 0 }}>RACI</div>
        <span className="small muted">{matrix ? `${matrix.rows.length} task(s) · ${people.length} people` : 'Loading…'}</span>
      </div>
      <div className="legend" style={{ marginTop: 8 }}>
        {RACI.map((x) => <span key={x.k} title={x.what}><i style={{ background: x.color }} /><b>{x.k}</b> {x.name}</span>)}
      </div>

      {error && <div className="alert error mt" role="alert">{error}</div>}

      {matrix && matrix.gaps.length > 0 && (
        <div className="small" style={{ marginTop: 10, padding: '6px 10px', borderRadius: 6, background: '#fdf3d7', color: 'var(--warn)' }}>
          ⚠ {matrix.gaps.length} task(s) missing a Responsible or Accountable
        </div>
      )}

      {matrix && (people.length === 0 ? (
        <div className="small muted" style={{ marginTop: 12 }}>No one assigned yet — the RACI fills in as tasks get people.</div>
      ) : (
        <div className="raci-bars">
          {people.map((p) => (
            <div key={p.id} className="raci-bar-row">
              <span className="small raci-bar-name" title={p.name}>{p.name}</span>
              <div className="raci-bar-track">
                <div className="stackbar" style={{ width: `${(p.total / max) * 100}%` }} role="img"
                  aria-label={`${p.name}: ` + RACI.filter((x) => p.n[x.k]).map((x) => `${x.name} ${p.n[x.k]}`).join(', ')}>
                  {RACI.filter((x) => p.n[x.k]).map((x) => (
                    <span key={x.k} style={{ width: `${(p.n[x.k] / p.total) * 100}%`, background: x.color }}
                      title={`${x.name} on ${p.n[x.k]} task(s)`} />
                  ))}
                </div>
              </div>
              <span className="raci-bar-counts">
                {RACI.filter((x) => p.n[x.k]).map((x) => <span key={x.k} className={`raci-chip ${x.k}`}>{x.k}{p.n[x.k]}</span>)}
              </span>
            </div>
          ))}
        </div>
      ))}

      {matrix && matrix.rows.length > 0 && (
        <>
          <button className="btn sm" style={{ marginTop: 12 }} onClick={() => setShowMatrix(!showMatrix)}>
            {showMatrix ? '▴ Hide task-by-task' : '▾ Show task-by-task'}
          </button>
          {showMatrix && (
            <div className="raci-scroll compact" style={{ marginTop: 10, border: '1px solid var(--line)' }}>
              <table className="raci-table">
                <thead>
                  <tr>
                    <th>Task</th>
                    {matrix.users.map((u) => <th key={u.id} style={{ textAlign: 'center' }}>{u.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {matrix.rows.map((r) => (
                    <tr key={r.task_id} style={matrix.gaps.includes(r.task_id) ? { background: '#fffaf0' } : undefined}>
                      <td className="small">
                        <Link to={`/tasks/${r.task_id}`}><strong>{r.code}</strong></Link>
                        <div className="muted" style={{ fontSize: 11 }}>{r.title}</div>
                      </td>
                      {r.cells.map((c) => (
                        <td key={c.user_id} style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {c.value
                            ? c.value.split('').map((ch) => <span key={ch} className={`raci-chip ${ch}`} style={{ margin: '0 1px' }}>{ch}</span>)
                            : <span className="muted">·</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
