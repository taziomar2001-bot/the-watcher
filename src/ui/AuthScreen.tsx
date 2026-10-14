import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSync } from '../logic/sync'
import { useToast } from '../store/useToast'

const USERNAME_RE = /^[a-z0-9_]{3,20}$/

/**
 * Full-screen sign in / create account. Used both as the first-run welcome
 * (firstRun) and on demand from Settings so people can always switch accounts.
 * Create-account captures the social identity (username + public/private).
 */
export function AuthScreen({ onClose, firstRun }: { onClose: () => void; firstRun?: boolean }) {
  const sync = useSync()
  const toast = useToast((s) => s.show)
  const [mode, setMode] = useState<'in' | 'up'>(firstRun ? 'up' : 'in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const busy = sync.status === 'busy'

  // Close automatically once signed in; clear any stale auth error on unmount.
  useEffect(() => {
    if (sync.status === 'signedIn') onClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync.status])
  useEffect(() => () => useSync.setState({ error: undefined }), [])

  const submit = () => {
    if (!email || !password) return
    if (mode === 'up') {
      const u = username.trim().toLowerCase()
      if (!USERNAME_RE.test(u)) {
        toast('Username must be 3–20 letters, numbers or underscores')
        return
      }
      sync.signUp(email, password, { username: u, displayName: displayName.trim(), visibility })
    } else {
      sync.signIn(email, password)
    }
  }

  return createPortal(
    // stopPropagation: when opened from Settings this is a React child of the
    // settings backdrop (events bubble through the React tree across the portal),
    // so without this a click in the form would close Settings underneath.
    <div className="auth-screen" onClick={(e) => e.stopPropagation()}>
      <button className="auth-close pressable" onClick={onClose} aria-label="Close">
        ✕
      </button>
      <div className="welcome-inner">
        <div className="welcome-brand">
          <div className="welcome-logo">W</div>
          <h1 className="welcome-title">The Watcher</h1>
          <p className="welcome-tag">
            {mode === 'up'
              ? 'Track everything you watch, keep it synced forever, and connect with other watchers.'
              : 'Welcome back — sign in to sync your library and your community.'}
          </p>
        </div>

        <div className="welcome-form">
          <input
            className="sync-input"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="sync-input"
            type="password"
            autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          {mode === 'up' && (
            <>
              <div className="uname-row">
                <span className="uname-at">@</span>
                <input
                  className="sync-input"
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                />
              </div>
              <input
                className="sync-input"
                placeholder="Display name (optional)"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <div className="vis-choice">
                <button type="button" className={`vis-opt pressable ${visibility === 'public' ? 'on' : ''}`} onClick={() => setVisibility('public')}>
                  Public
                </button>
                <button type="button" className={`vis-opt pressable ${visibility === 'private' ? 'on' : ''}`} onClick={() => setVisibility('private')}>
                  Private
                </button>
              </div>
              <div className="vis-hint">
                {visibility === 'public'
                  ? 'Anyone can find your profile and follow you.'
                  : 'You approve who can follow you and see your activity.'}
              </div>
            </>
          )}
          {sync.error && <div className="sync-error">{sync.error}</div>}

          <button className="welcome-primary pressable" disabled={busy || !email || !password || (mode === 'up' && !username)} onClick={submit}>
            {busy ? 'Working…' : mode === 'up' ? 'Create account' : 'Sign in'}
          </button>

          <button
            className="welcome-switch pressable"
            onClick={() => {
              useSync.setState({ error: undefined })
              setMode(mode === 'up' ? 'in' : 'up')
            }}
          >
            {mode === 'up' ? 'Already have an account? Sign in' : 'New to The Watcher? Create account'}
          </button>
        </div>

        {firstRun && (
          <button className="welcome-skip pressable" onClick={onClose}>
            Not now — use without an account
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}
