// src/pages/ResetPassword.tsx
import { useState, useEffect } from 'react'
import { api } from '../api'
import PasswordInput from '../components/PasswordInput'

export default function ResetPassword() {
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    // URL থেকে ?token=XYZ অংশটি সংগ্রহ করবে
    const params = new URLSearchParams(window.location.search)
    setToken(params.get('token') || '')
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) { setError('Passwords do not match'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    
    setBusy(true)
    setError('')
    try {
      await api.post('/auth/reset-password', { token, new_password: password })
      setSuccess(true)
    } catch (e: any) {
      setError(e.message || 'Invalid or expired token. Please request a new reset link.')
    } finally {
      setBusy(false)
    }
  }

  if (success) {
    return (
      <div className="auth-page">
        <div className="card auth-card" style={{ textAlign: 'center' }}>
          <div className="alert success" role="status">Password updated. You can now log in with your new password.</div>
          <a href="/" className="btn primary mt">Go to Login</a>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h2 style={{ textAlign: 'center' }}>Set New Password</h2>
        {!token && <div className="alert error" role="alert">This link is missing its reset code. Please open the link from your email again, or request a new one.</div>}
        {error && <div className="alert error" role="alert">{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="field mb">
            <label htmlFor="rp-new">New Password</label>
            <PasswordInput id="rp-new" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} required />
          </div>
          <div className="field mb">
            <label htmlFor="rp-confirm">Confirm Password</label>
            <PasswordInput id="rp-confirm" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={busy} required />
          </div>
          <button type="submit" className="btn primary" style={{ width: '100%' }} disabled={busy || !token}>
            {busy ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  )
}