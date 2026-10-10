import { InputHTMLAttributes, useState } from 'react'

// A password box with a show / hide button (the eye). Takes whatever an <input> takes.
export default function PasswordInput({ style, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [show, setShow] = useState(false)
  return (
    <div className="pw-field">
      <input {...props} type={show ? 'text' : 'password'} style={{ width: '100%', ...style, paddingRight: 40 }} />
      <button type="button" className="pw-toggle" onClick={() => setShow((v) => !v)} aria-pressed={show}
        aria-label={show ? 'Hide password' : 'Show password'} title={show ? 'Hide password' : 'Show password'}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {show && <path d="M4 4l16 16" />}
        </svg>
      </button>
    </div>
  )
}
