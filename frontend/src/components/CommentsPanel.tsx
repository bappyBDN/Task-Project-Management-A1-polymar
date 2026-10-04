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

/** Styles for <CommentReplies>; the panel and the dashboard both include them. */
export const REPLY_CSS = `
.cr-list{margin:8px 0 0 12px;padding-left:10px;border-left:2px solid var(--line,#e6ebf2)}
.cr-item{padding:6px 0}
.cr-item + .cr-item{border-top:1px dashed var(--line,#e6ebf2)}
.cr-meta{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:12px}
.cr-when{color:var(--mut,#6b7a90);font-size:11px;white-space:nowrap}
.cr-txt{font-size:12.5px;white-space:pre-wrap;overflow-wrap:anywhere;margin-top:3px;line-height:1.45}
.cr-link{background:none;border:0;padding:0;margin-top:6px;font:inherit;font-size:12px;font-weight:600;color:var(--blue,#1d6bff);cursor:pointer}
.cr-link:hover{text-decoration:underline}
.cr-box{margin-top:8px}
.cr-box textarea{width:100%;box-sizing:border-box;font:inherit;font-size:13px;padding:8px;border:1px solid var(--line,#e6ebf2);border-radius:8px;resize:vertical}
.cr-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:6px}
.cr-err{color:var(--red,#ef4444);font-size:12px;margin-top:4px}
`

/** A comment's replies plus a "Reply" box, shown only when the server says this user
 *  may reply (project: the Project Manager; task: its Responsible or Accountable).
 *  The server emails the comment's author and the Project Manager / Responsible and Accountable. */
export function CommentReplies({ comment, onReplied }: { comment: Comment; onReplied: (reply: Comment) => void }) {
  const replies = comment.replies ?? []
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    const body = text.trim()
    if (!body) { setErr('Write a reply first.'); return }
    if (body.length > MAX_LENGTH) { setErr(`Reply is too long (${MAX_LENGTH} characters at most).`); return }
    setErr(''); setSending(true)
    try {
      const saved = await api.post<Comment>(`/comments/${comment.id}/reply`, { comment: body })
      onReplied(saved)
      setText(''); setOpen(false)
    } catch (e: any) {
      setErr(e.message || 'Could not post the reply. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {replies.length > 0 && (
        <div className="cr-list">
          {replies.map((r) => (
            <div key={r.id} className="cr-item">
              <div className="cr-meta"><strong>{commenterLabel(r)}</strong><span className="cr-when">{fmtDateTime(r.created_at)}</span></div>
              <div className="cr-txt">{r.comment}</div>
            </div>
          ))}
        </div>
      )}
      {!open && comment.can_reply && (
        <button type="button" className="cr-link" onClick={() => setOpen(true)}>
          ↩ Reply{replies.length > 0 ? ` (${replies.length})` : ''}
        </button>
      )}
      {open && comment.can_reply && (
        <div className="cr-box">
          <textarea
            rows={2}
            autoFocus
            value={text}
            maxLength={MAX_LENGTH}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }}
            placeholder={`Reply to ${comment.commenter_name}…`}
            disabled={sending}
          />
          {err && <div className="cr-err" role="alert">{err}</div>}
          <div className="cr-actions">
            <button type="button" className="btn sm" onClick={() => { setOpen(false); setErr('') }} disabled={sending}>Cancel</button>
            <button type="button" className="btn sm primary" onClick={submit} disabled={sending || !text.trim()}>
              {sending ? 'Posting…' : 'Post Reply'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

/** Adds a reply to its comment in a list of comments. */
export function addReply(list: Comment[], reply: Comment): Comment[] {
  return list.map((c) => (c.id === reply.parent_id ? { ...c, replies: [...(c.replies ?? []), reply] } : c))
}

function MsgIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 5h16v11H9l-5 4z" /><path d="M8 9h8M8 12h5" />
    </svg>
  )
}

// Floating "Comment" button (bottom-right) that opens a side panel. Layers: above the
// sidebar (20), below the mobile menu (30) and the page's forms / modals (50).
const CSS = `
.cm-spacer{height:76px}
.cm-fab{position:fixed;right:24px;bottom:calc(24px + env(safe-area-inset-bottom,0px));z-index:25;display:inline-flex;align-items:center;gap:8px;
  background:var(--navy);color:#fff;border:0;border-radius:999px;padding:12px 20px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;
  box-shadow:0 6px 18px rgba(11,31,58,.28)}
.cm-fab:hover{background:var(--navy-2,#132c52)}
.cm-count{background:var(--gold,#c8a24b);color:#fff;border-radius:999px;padding:1px 8px;font-size:12px}
.cm-backdrop{position:fixed;inset:0;background:rgba(11,31,58,.35);z-index:45}
.cm-drawer{position:fixed;top:0;right:0;bottom:0;width:420px;max-width:100%;z-index:46;background:#fff;box-shadow:-8px 0 24px rgba(11,31,58,.18);
  display:flex;flex-direction:column;padding:calc(18px + env(safe-area-inset-top,0px)) 18px calc(18px + env(safe-area-inset-bottom,0px));box-sizing:border-box}
.cm-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px}
.cm-head h2{margin:0;font-size:17px;color:var(--navy);display:flex;align-items:center;gap:8px}
.cm-list{margin-top:14px;overflow-y:auto;flex:1;min-height:0}
@media(max-width:600px){.cm-fab{right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));padding:11px 16px}}
${REPLY_CSS}`

/** Comments on a project or task. Any employee can comment; only the Project Manager
 *  (project) or the Responsible and Accountable persons (task) are emailed and see it.
 *  `recipients`: those people. */
export default function CommentsPanel({ kind, id, recipients }: {
  kind: 'project' | 'task'; id: number; recipients: { id?: number | null; name?: string }[]
}) {
  const role = kind === 'project' ? 'Project Manager' : 'Responsible / Accountable person'
  const { user } = useAuth()
  const assigned = recipients.filter((r, i, a) => r.id != null && a.findIndex((x) => x.id === r.id) === i)
  const isRecipient = !!user && assigned.some((r) => r.id === user.id) // nobody is emailed about their own comment
  const others = assigned.filter((r) => r.id !== user?.id)
  const notifyName = others.length > 0
    ? (others.every((r) => r.name) ? others.map((r) => r.name).join(' and ') : `The ${role}`)
    : undefined
  const [comments, setComments] = useState<Comment[]>([])
  const [text, setText] = useState('')
  const [loadErr, setLoadErr] = useState('')
  const [err, setErr] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [open, setOpen] = useState(false)
  const total = comments.reduce((n, c) => n + 1 + (c.replies?.length ?? 0), 0)

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

  // Esc closes the panel (the draft stays: the panel is only hidden)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <style>{CSS}</style>
      {/* keeps the page's last fields scrollable above the floating button */}
      <div className="cm-spacer" aria-hidden />
      {!open && (
        <button className="cm-fab" onClick={() => setOpen(true)} aria-label={`Comments (${total})`}>
          <MsgIcon />Comment{total > 0 && <span className="cm-count">{total}</span>}
        </button>
      )}
      {open && (
        <>
          <div className="cm-backdrop" onClick={() => setOpen(false)} />
          <aside className="cm-drawer" role="dialog" aria-label={`Comments on this ${kind}`}>
            <div className="cm-head">
              <h2><MsgIcon />Comments ({total})</h2>
              <button className="btn sm" onClick={() => setOpen(false)} aria-label="Close comments">✕</button>
            </div>
            {err && <div className="alert error" role="alert">{err}</div>}
            {okMsg && <div className="alert success" role="status">{okMsg}</div>}
            <textarea
              rows={4}
              autoFocus
              value={text}
              maxLength={MAX_LENGTH}
              onChange={(e) => { setText(e.target.value); setOkMsg('') }}
              placeholder={`Write a comment on this ${kind}…`}
              disabled={sending}
            />
            <div className="small muted" style={{ marginTop: 6 }}>
              {notifyName ? `Only ${notifyName} (${role}) will get an email and see this comment.`
                : isRecipient ? `You are the ${role} — no email is sent for your own comments.`
                : `No ${role} assigned — nobody will be emailed.`}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button className="btn sm" onClick={() => setOpen(false)}>Close</button>
              <button className="btn sm primary" onClick={submit} disabled={sending || !text.trim()}>
                {sending ? 'Posting…' : 'Post Comment'}
              </button>
            </div>

            <div className="cm-list">
              {loadErr && <div className="small" style={{ color: 'var(--red)' }}>{loadErr} <button className="btn sm" onClick={load}>Retry</button></div>}
              {!loadErr && comments.length === 0 && <div className="small muted">No comments yet.</div>}
              {comments.map((c) => (
                <div key={c.id} style={{ padding: '10px 0', borderTop: '1px solid var(--line)' }}>
                  <div className="small" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <strong>{commenterLabel(c)}</strong>
                    <span className="muted" style={{ fontSize: 11 }}>{fmtDateTime(c.created_at)}</span>
                  </div>
                  <div className="small" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginTop: 4 }}>{c.comment}</div>
                  <CommentReplies comment={c} onReplied={(r) => setComments((list) => addReply(list, r))} />
                </div>
              ))}
            </div>
          </aside>
        </>
      )}
    </>
  )
}
