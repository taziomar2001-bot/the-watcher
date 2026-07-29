import { useState } from 'react'
import { useSync } from '../logic/sync'

// First-run screen: shown once on a fresh device when cloud sync is available
// and nobody is signed in. Create an account (new user) or sign in (returning
// device → restores the library). Skippable for local-only use.
export function Welcome({ onSkip }: { onSkip: () => void }) {
  const sync = useSync()
  const [mode, setMode] = useState<'create' | 'signin'>('create')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const busy = sync.status === 'busy'

  const submit = () => {
    if (!email || !password) return
    if (mode === 'create') sync.signUp(email, password)
    else sync.signIn(email, password)
  }

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <div className="welcome-brand">
          <div className="welcome-logo">▚</div>
          <h1 className="welcome-title">The Watcher</h1>
          <p className="welcome-tag">
            {mode === 'create'
              ? 'Create an account to back up your library and keep it forever — synced across every device.'
              : 'Sign in to restore your library on this device.'}
          </p>
        </div>

        <div className="welcome-form">
          <input
            className="sync-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="sync-input"
            type="password"
            autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          {sync.error && <div className="sync-error">{sync.error}</div>}

          <button className="welcome-primary pressable" disabled={busy || !email || !password} onClick={submit}>
            {busy ? 'Working…' : mode === 'create' ? 'Create account' : 'Sign in'}
          </button>

          <button
            className="welcome-switch"
            onClick={() => {
              useSync.setState({ error: undefined })
              setMode(mode === 'create' ? 'signin' : 'create')
            }}
          >
            {mode === 'create' ? 'Already have an account? Sign in' : 'New here? Create an account'}
          </button>
        </div>

        <button className="welcome-skip" onClick={onSkip}>
          Not now — use without backup
        </button>
      </div>
    </div>
  )
}
