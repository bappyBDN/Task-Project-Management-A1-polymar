import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import type { RaciMatrix, Task } from '../types'

// The project's RACI matrix: always shown on the project page (rows = tasks,
// columns = people). Same data as the RACI Matrix page for this one project.

const RACI = [
  ['R', 'Responsible', 'does the work'],
  ['A', 'Accountable', 'owns the result'],
  ['C', 'Consulted', 'reviews / advises'],
  ['I', 'Informed', 'kept up to date'],
] as const

export default function ProjectRaci({ projectId, tasks }: { projectId: number; tasks: Task[] }) {
  const [matrix, setMatrix] = useState<RaciMatrix | null>(null)
  const [error, setError] = useState('')

  // reload when the project's tasks change (e.g. a Responsible was reassigned)
  useEffect(() => {
    let cancelled = false
    api.get<RaciMatrix>(`/raci/matrix/${projectId}`)
      .then((m) => { if (!cancelled) { setMatrix(m); setError('') } })
      .catch((e: any) => { if (!cancelled) setError(e?.message || 'Could not load the RACI matrix.') })
    return () => { cancelled = true }
  }, [projectId, tasks])

  // per person: how many tasks they hold each letter on
  const totals = (uid: number) => {
    const n: Record<string, number> = { R: 0, A: 0, C: 0, I: 0 }
    matrix?.rows.forEach((r) => r.cells.find((c) => c.user_id === uid)?.value.split('').forEach((ch) => { if (ch in n) n[ch]++ }))
    return n
  }

  return (
    <div className="card mt">
      <div className="row spread" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="section-title" style={{ margin: 0 }}>RACI — Who does what</div>
          <div className="small muted" style={{ marginTop: 4 }}>
            {matrix ? `${matrix.rows.length} task(s) · ${matrix.users.length} people` : 'Loading…'}
          </div>
        </div>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          {RACI.map(([k, name, what]) => (
            <span key={k} className="row small" style={{ gap: 6 }} title={what}>
              <span className={`raci-chip ${k}`}>{k}</span>{name}
            </span>
          ))}
        </div>
      </div>

      {error && <div className="alert error mt" role="alert">{error}</div>}

      {matrix && matrix.gaps.length > 0 && (
        <div className="alert mt" style={{ background: '#fdf3d7', color: 'var(--warn)' }}>
          <strong>RACI gap:</strong> {matrix.gaps.length} task(s) have no Responsible or no Accountable.
        </div>
      )}

      {matrix && (matrix.rows.length === 0 ? (
        <div className="small muted mt">No tasks yet — the RACI fills in as tasks are added and people are assigned.</div>
      ) : (
        <div className="raci-scroll compact" style={{ marginTop: 12, border: '1px solid var(--line)' }}>
          <table className="raci-table" style={{ minWidth: 500 }}>
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
              <tr>
                <td className="small" style={{ fontWeight: 700 }}>Total per person</td>
                {matrix.users.map((u) => {
                  const n = totals(u.id)
                  return (
                    <td key={u.id} className="small" style={{ textAlign: 'center', whiteSpace: 'nowrap', fontWeight: 600 }}>
                      {(['R', 'A', 'C', 'I'] as const).filter((k) => n[k]).map((k) => (
                        <span key={k} className={`raci-chip ${k}`} style={{ margin: '0 1px' }} title={`${RACI.find((x) => x[0] === k)![1]} on ${n[k]} task(s)`}>
                          {k}{n[k]}
                        </span>
                      ))}
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
