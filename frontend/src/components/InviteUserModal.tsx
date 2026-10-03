import { useState } from 'react'
import { api } from '../api'
import type { User } from '../types'

// "+ Add new user" everywhere a person is picked (task Responsible / Accountable / Reviewer,
// Project Manager, a project's people, methodology approvers): only their email is asked.
// The server saves them as a user right away - so they can be picked here - and emails them
// a link to the Sign Up page, where they fill in the rest themselves.
interface InviteResult { user: User; email_sent: boolean; already_registered: boolean }

export default function InviteUserModal({ onClose, onInvited }: { onClose: () => void; onInvited: (u: User) => void }) {
  const [email, setEmail] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<InviteResult | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation() // sits inside another form / modal
    const value = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) { setErr('Enter a valid email address.'); return }
    setBusy(true)
    setErr('')
    try {
      setDone(await api.post<InviteResult>('/organizations/users/invite', { email: value }))
    } catch (e: any) {
      setErr(e?.message || 'Could not add this person. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.stopPropagation()}>
      <div className="modal" style={{ width: 440 }} onClick={(e) => e.stopPropagation()}>
        <h2>Add New User</h2>
        {done ? (
          <>
            {done.already_registered ? (
              <div className="alert info"><strong>{done.user.name}</strong> already has an account with this email. They are selected for you.</div>
            ) : done.email_sent ? (
              <div className="alert success" role="status">
                Saved. An email was sent to <strong>{done.user.email}</strong> asking them to sign up now. They are selected for you.
              </div>
            ) : (
              <div className="alert error" role="alert">
                <strong>{done.user.email}</strong> is saved and selected, but the invitation email could not be sent.
                Ask them to open the Sign Up page and register with this email.
              </div>
            )}
            <div className="modal-actions">
              <button className="btn primary" onClick={() => onInvited(done.user)} autoFocus>OK</button>
            </div>
          </>
        ) : (
          <form onSubmit={submit}>
            <div className="small muted" style={{ marginBottom: 12 }}>
              Enter their email. They will get a mail with a link to sign up, and you can assign them right away.
            </div>
            {err && <div className="alert error" role="alert">{err}</div>}
            <label>Email *</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" autoFocus disabled={busy} />
            <div className="modal-actions">
              <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Sending…' : 'Add & Send Invitation'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
