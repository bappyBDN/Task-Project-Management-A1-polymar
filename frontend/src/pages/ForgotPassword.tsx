import { useState } from 'react'
import { api } from '../api'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(''); setMsg('')
    try {
      await api.post('/auth/forgot-password', { email })
      setMsg('If an account exists for this email, a password reset link has been sent. Please check your inbox (and spam folder).')
    } catch (e: any) {
      setErr(e.message || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <h2 style={{ textAlign: 'center' }}>Forgot Password</h2>
        {msg && <div className="alert success" role="status">{msg}</div>}
        {err && <div className="alert error" role="alert">{err}</div>}

        <div className="field mb">
          <label htmlFor="fp-email">Email</label>
          <input
            id="fp-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
        </div>
        <button className="btn primary" style={{ width: '100%' }} disabled={busy}>
          {busy ? 'Sending…' : 'Send Reset Link'}
        </button>
        <div style={{ marginTop: 12, textAlign: 'center' }}>
          <a href="/" style={{ color: '#0056b3', fontSize: 14 }}>Back to Login</a>
        </div>
      </form>
    </div>
  )
}