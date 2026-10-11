import { useEffect, useState } from 'react'
import { api } from '../api'
import { Subtask, Task } from '../types'
import SubtaskModal from './SubtaskModal'

// The task page's "Subtasks" card: the pieces a task was broken into on the Gantt chart
// (backend routers/subtasks.py), each with its progress. A task without subtasks shows no
// card at all, so the page of every other task is exactly as before.

interface Props {
  task: Task
  /** may add / edit / delete them: Responsible, Accountable, the project's Manager, admin / PMO */
  canEdit: boolean
  /** a line about the task for the form (its people and dates) */
  info?: string
}

const state = (pct: number) =>
  pct >= 100 ? { text: 'Done', tone: 'green' } : pct > 0 ? { text: 'In progress', tone: 'gold' } : { text: 'Not started', tone: 'gray' }

export default function TaskSubtasks({ task, canEdit, info }: Props) {
  const [subs, setSubs] = useState<Subtask[]>([])
  const [version, setVersion] = useState(0)
  // the form: a subtask to edit, 'new', or closed
  const [form, setForm] = useState<Subtask | 'new' | null>(null)

  useEffect(() => {
    let stale = false
    // an older server without subtasks: no card
    api.get<Subtask[]>(`/subtasks?task_id=${task.id}`).then((l) => { if (!stale) setSubs(l) }).catch(() => { if (!stale) setSubs([]) })
    return () => { stale = true }
  }, [task.id, version])

  if (subs.length === 0) return null

  const done = subs.filter((s) => s.progress_pct >= 100).length
  const average = Math.round(subs.reduce((n, s) => n + (s.progress_pct || 0), 0) / subs.length)

  return (
    <div className="card mt">
      <div className="spread">
        <div className="section-title" style={{ marginTop: 0 }}>
          Subtasks <span className="badge gray" style={{ marginLeft: 6 }}>{subs.length}</span>
        </div>
        {canEdit && <button className="btn sm" onClick={() => setForm('new')}>+ Add Subtask</button>}
      </div>

      <div className="subtask-summary">
        <div className="small muted">{done} of {subs.length} done · {average}% on average</div>
        <div className="progress" role="img" aria-label={`Subtasks ${average}% done on average`}>
          <span style={{ width: `${average}%`, background: average >= 100 ? 'var(--green)' : undefined }} />
        </div>
      </div>

      <div className="subtask-list">
        {subs.map((s, i) => {
          const pct = Math.max(0, Math.min(100, Math.round(s.progress_pct || 0)))
          const st = state(pct)
          return (
            <div key={s.id} className={`subtask${canEdit ? ' click' : ''}`} onClick={canEdit ? () => setForm(s) : undefined}
              title={canEdit ? 'Click to update the progress or edit this subtask' : undefined}>
              <span className={`subtask-no${pct >= 100 ? ' done' : ''}`} aria-hidden>{pct >= 100 ? '✓' : i + 1}</span>
              <div className="subtask-body">
                <div className="subtask-head">
                  <strong>{s.title}</strong>
                  <span className={`badge ${st.tone}`}>{st.text}</span>
                </div>
                {s.description && <div className="small muted subtask-text">{s.description}</div>}
                {s.expected_deliverable && (
                  <div className="small subtask-text"><span className="muted">Expected deliverable:</span> {s.expected_deliverable}</div>
                )}
                <div className="subtask-bar">
                  <div className="progress"><span style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--green)' : undefined }} /></div>
                  <span className="small"><strong>{pct}%</strong></span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="small muted" style={{ marginTop: 10 }}>
        Subtasks take this task's people and dates. They need no approval and do not change the task's own progress.
      </div>

      {form && (
        <SubtaskModal taskId={task.id} sub={form === 'new' ? null : form}
          info={<>Subtask of <strong>{task.code} — {task.title}</strong>.{info ? ` ${info}` : ''}</>}
          onClose={() => setForm(null)} onSaved={() => { setForm(null); setVersion((n) => n + 1) }} />
      )}
    </div>
  )
}
