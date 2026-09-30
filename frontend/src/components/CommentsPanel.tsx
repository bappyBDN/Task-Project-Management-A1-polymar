import { useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { Comment } from '../types'

const MAX_LENGTH = 2000

/** The server stores UTC without a zone ("2026-09-30T06:20:23"); show it in local time. */
export function fmtDateTime(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function commenterLabel(c: Comment): string {
  return c.commenter_employee_id ? `${c.commenter_name} (${c.commenter_employee_id})` : c.commenter_name
}

/** Comments on a project or task. Any employee can comment; the Project Manager
 *  (project) or the Responsible person (task) is emailed. */
export default function CommentsPanel({ kind, id, recipientId, recipientName }: {
  kind: 'project' | 'task'; id: number; recipientId?: number | null; recipientName?: string
}) {
  const role = kind === 'project' ? 'Project Manager' : 'Responsible person'
  const { user } = useAuth()
  const isRecipient = !!user && user.id === recipientId // nobody is emailed about their own comment
  const notifyName = recipientId && !isRecipient ? (recipientName ?? `The ${role}`) : undefined
  const [comments, setComments] = useState<Comment[]>([])
  const [text, setText] = useState('')
  const [loadErr, setLoadErr] = useState('')
  const [err, setErr] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [sending, setSending] = useState(false)

  const load = () => {
    setLoadErr('')
    api.get<Comment[]>(`/comments/${kind}/${id}`).then(setComments).catch((e) => setLoadErr(e.message || 'Could not load comments.'))
  }
  useEffect(load, [kind, id])

  const submit = async () => {
    const body = text.trim()
    if (!body) { setErr('Write a comment first.'); return }
    if (body.length > MAX_LENGTH) { setErr(`Comment is too long (${MAX_LENGTH} characters at most).`); return }
    setErr(''); setOkMsg(''); setSending(true)
    try {
      const saved = await api.post<Comment>(`/comments/${kind}/${id}`, { comment: body })
      setComments((list) => [saved, ...list])
      setText('')
      setOkMsg(notifyName ? `Comment posted. ${notifyName} will be notified by email.` : 'Comment posted.')
    } catch (e: any) {
      setErr(e.message || 'Could not post the comment. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="card mt">
      <div className="section-title" style={{ marginTop: 0 }}>Comments ({comments.length})</div>
      {err && <div className="alert error" role="alert">{err}</div>}
      {okMsg && <div className="alert success" role="status">{okMsg}</div>}
      <textarea
        rows={3}
        value={text}
        maxLength={MAX_LENGTH}
        onChange={(e) => { setText(e.target.value); setOkMsg('') }}
        placeholder={`Write a comment on this ${kind}…`}
        disabled={sending}
      />
      <div className="spread" style={{ marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
        <span className="small muted">
          {isRecipient ? `You are the ${role} — no email is sent for your own comments.`
            : notifyName ? `${notifyName}${recipientName ? ` (${role})` : ''} will get an email.`
            : `No ${role} assigned — nobody will be emailed.`}
        </span>
        <button className="btn sm primary" onClick={submit} disabled={sending || !text.trim()}>
          {sending ? 'Posting…' : 'Post Comment'}
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        {loadErr && <div className="small" style={{ color: 'var(--red)' }}>{loadErr} <button className="btn sm" onClick={load}>Retry</button></div>}
        {!loadErr && comments.length === 0 && <div className="small muted">No comments yet.</div>}
        {comments.map((c) => (
          <div key={c.id} style={{ padding: '8px 0', borderTop: '1px solid var(--line)' }}>
            <div className="small" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <strong>{commenterLabel(c)}</strong>
              <span className="muted" style={{ fontSize: 11 }}>{fmtDateTime(c.created_at)}</span>
            </div>
            <div className="small" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginTop: 4 }}>{c.comment}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
