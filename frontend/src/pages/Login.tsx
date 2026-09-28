import { useState } from 'react'
import { useAuth } from '../auth'

export default function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login({ email: email.trim(), password })
      // No manual redirect: AuthProvider updates `user`,
      // App.tsx then renders the main layout automatically.
    } catch (err: any) {
      setError(err.message === 'Invalid credentials'
        ? 'Wrong email / employee ID or password.'
        : err.message || 'Login failed. Please check your credentials.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={handleSubmit}>
        <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>Login</h2>
        {error && <div className="alert error" role="alert">{error}</div>}

        <div className="field" style={{ marginBottom: '15px' }}>
          <label htmlFor="login-id">Email or Employee ID</label>
          <input
            id="login-id"
            type="text"
            autoComplete="username"
            autoFocus
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={{ width: '100%', padding: '8px' }}
            required
          />
        </div>
        <div className="field" style={{ marginBottom: '20px' }}>
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={{ width: '100%', padding: '8px' }}
            required
          />
        </div>

        <button
          type="submit"
          className="btn primary mt"
          style={{ width: '100%', padding: '10px', justifyContent: 'center' }}
          disabled={busy}
        >
          {busy ? 'Signing in…' : 'Login'}
        </button>

        <div style={{ marginTop: '15px', textAlign: 'center', fontSize: '14px' }}>
          <a href="/forgot-password" style={{ color: '#0056b3', textDecoration: 'none' }}>
            Forgot Password?
          </a>
        </div>
        <div style={{ marginTop: '10px', textAlign: 'center', fontSize: '14px' }}>
          Don't have an account?{' '}
          <a href="/signup" style={{ color: '#0056b3', textDecoration: 'none' }}>
            Sign Up
          </a>
        </div>
      </form>
    </div>
  )
}
