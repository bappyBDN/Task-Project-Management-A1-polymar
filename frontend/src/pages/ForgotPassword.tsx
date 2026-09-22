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
      setMsg('If an account exists, a reset link has been sent. Check the backend terminal for the link.')
    } catch (e: any) {
      setErr(e.message || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <form className="card" onSubmit={submit} style={{ width: 380, padding: 32 }}>
        <h2 style={{ textAlign: 'center' }}>Forgot Password</h2>
        {msg && <div className="badge green mb">{msg}</div>}
        {err && <div className="badge red mb">{err}</div>}

        <div className="field mb">
          <label>Email</label>
          <input
            type="email"
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