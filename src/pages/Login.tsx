import { useState, type FormEvent } from 'react'
import type { DataAdapter } from '../data/adapter'

export function Login(props: { adapter: DataAdapter; onSignedIn: () => void; onTryDemo: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await props.adapter.signIn(email, password)
      props.onSignedIn()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="center-screen">
      <div className="logo">🍱</div>
      <h1>Tiffin Manager</h1>
      <form className="card login-card" onSubmit={submit}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn primary" type="submit" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="muted">
        Manager accounts are created by the owner (see docs/SETUP.md).{' '}
        <button className="btn small" onClick={props.onTryDemo} data-testid="try-demo">
          Try Demo Mode
        </button>
      </p>
    </div>
  )
}
