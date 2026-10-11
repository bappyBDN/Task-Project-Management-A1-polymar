import { ReactNode, useState } from 'react'
import { api } from '../api'
import { Subtask } from '../types'

// Add / edit one subtask of a task (backend routers/subtasks.py). Used by the project's Gantt
// chart and by the task page. Only what a subtask has of its own is asked: a title, a
// description, an expected deliverable and a progress %. Everything else is the task's.

interface Props {
  taskId: number
  /** the subtask being edited; none = a new one */
  sub?: Subtask | null
  /** a line about the parent task: its code, people and dates */
  info?: ReactNode
  onClose: () => void
  /** saved or deleted: reload the subtasks */
  onSaved: () => void
}

export default function SubtaskModal({ taskId, sub, info, onClose, onSaved }: Props) {
  const [f, setF] = useState({
    title: sub?.title ?? '', description: sub?.description ?? '',
    expected_deliverable: sub?.expected_deliverable ?? '', progress_pct: String(sub?.progress_pct ?? 0),
  })
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const set = (k: keyof typeof f, v: string) => setF((cur) => ({ ...cur, [k]: v }))

  const save = async () => {
    if (saving) return
    if (!f.title.trim()) { setErr('Give the subtask a title.'); return }
    const progress = Number(f.progress_pct)
    if (!Number.isFinite(progress) || progress < 0 || progress > 100) { setErr('Progress must be between 0 and 100.'); return }
    setSaving(true)
    setErr('')
    const body = { title: f.title.trim(), description: f.description.trim() || null,
      expected_deliverable: f.expected_deliverable.trim() || null, progress_pct: progress }
    try {
      if (sub) await api.patch(`/subtasks/${sub.id}`, body)
      else await api.post('/subtasks', { ...body, task_id: taskId })
      onSaved()
    } catch (e: any) {
      setErr(e.message || 'Could not save the subtask.')
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!sub || saving) return
    if (!confirmDelete) { setConfirmDelete(true); return } // second click deletes
    setSaving(true)
    try {
      await api.del(`/subtasks/${sub.id}`)
      onSaved()
    } catch (e: any) {
      setErr(e.message || 'Could not delete the subtask.')
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: 560 }} onClick={(e) => e.stopPropagation()}>
        <h2>{sub ? 'Edit subtask' : 'Add subtask'}</h2>
        {err && <div className="alert error">{err}</div>}
        {info && <div className="alert info">{info}</div>}
        <label>Subtask Title *</label>
        <input value={f.title} maxLength={240} autoFocus onChange={(e) => set('title', e.target.value)} placeholder="What is this piece of the task?" />
        <label>Description</label>
        <textarea rows={3} value={f.description} onChange={(e) => set('description', e.target.value)} />
        <label>Expected Deliverable</label>
        <textarea rows={2} value={f.expected_deliverable} onChange={(e) => set('expected_deliverable', e.target.value)} />
        <label>Progress %</label>
        <div className="row">
          <input type="range" min={0} max={100} step={5} value={Number(f.progress_pct) || 0} onChange={(e) => set('progress_pct', e.target.value)} style={{ flex: 1 }} aria-label="Progress" />
          <input type="number" min={0} max={100} value={f.progress_pct} onChange={(e) => set('progress_pct', e.target.value)} style={{ width: 90 }} aria-label="Progress %" />
        </div>
        <div className="modal-actions">
          {sub && (
            <button className="btn danger" style={{ marginRight: 'auto' }} onClick={remove} disabled={saving}>
              {confirmDelete ? 'Click again to delete' : 'Delete subtask'}
            </button>
          )}
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}
