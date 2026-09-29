import { useState } from 'react'
import SignupForm from '../components/SignupForm'

// Same fields as the admin "New User" form (see SignupForm, also used to add a new
// employee from a project's Associated People).
export default function Signup() {
  const [msg, setMsg] = useState('')

  return (
    <div className="auth-page">
      <div className="card auth-card" style={{ width: 560 }}>
        <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>Sign Up</h2>
        {msg && <div className="alert success" role="status">{msg}</div>}

        <SignupForm onSuccess={(message) => setMsg(message)} />

        <div style={{ marginTop: '15px', textAlign: 'center', fontSize: '14px' }}>
          Already have an account?{' '}
          <a href="/" style={{ color: '#0056b3', textDecoration: 'none' }}>Login</a>
        </div>
      </div>
    </div>
  )
}
