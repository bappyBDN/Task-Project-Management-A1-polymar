import { useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { Task } from '../types'
import { label } from '../constants'

const CLOSED = ['completed', 'closed', 'cancelled']

/** A task that is at 100 % but whose completion was never approved: it still has to be submitted. */
export const awaitsCompletion = (t: Task) => t.progress_pct >= 100 && !CLOSED.includes(t.status)

// "Submit Completion" for a row of a task list. Only the task's Responsible person sees it,
// and only for a task at 100 % that is not completed yet. One click sends it for approval;
// after that it stays "Submitted" until the progress is updated again (the server decides:
// Task.completion_submitted).
export default function CompletionButton({ task, onDone }: { task: Task; onDone: () => void }) {
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  if (!user || user.id !== task.responsible_id || !awaitsCompletion(task)) return null
  const submitted = sent || !!task.completion_submitted

  const submit = async () => {
    if (busy || submitted) return
    setBusy(true)
    try {
      await api.post('/approvals', {
        approval_type: 'completion',
        entity_type: 'task',
        entity_id: task.id,
        reason: `Requesting ${label('completion')} for ${task.code}`,
      })
      setSent(true)
      onDone()
    } catch (e: any) {
      alert(e.message || 'Could not submit for completion. Please try again.')
      onDone() // someone else may have submitted it meanwhile
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      className={`btn sm${submitted ? '' : ' gold'}`}
      style={{ whiteSpace: 'nowrap' }}
      disabled={busy || submitted}
      title={submitted ? 'Already submitted. Update the progress to submit it again.' : 'Send this finished task for completion approval'}
      onClick={(e) => { e.stopPropagation(); submit() }}
    >
      {busy ? 'Submitting…' : submitted ? '✓ Submitted' : 'Submit Completion'}
    </button>
  )
}
