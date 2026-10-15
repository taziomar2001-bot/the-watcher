import { Wordmark } from './Wordmark'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSync } from '../logic/sync'

type Mode = 'in' | 'up' | 'forgot' | 'checkEmail' | 'resetSent'

/**
 * Sign in / create account. Google first, email as the alternative. Creating
 * an account only asks for email + password; the @username and public/private
 * choice come on the "Finish your profile" step right after, for everyone.
 */
export function AuthScreen({
  onClose,
  firstRun,
  note,
  skipLabel,
  onSkip,
}: {
  onClose: () => void
  firstRun?: boolean
  /** Extra context under the title (e.g. why sign-in is needed here). */
  note?: string
  /** Quiet secondary action at the bottom; hides the ✕ when provided. */
  skipLabel?: string
  onSkip?: () => void
}) {
  const sync = useSync()
  const [mode, setMode] = useState<Mode>(firstRun ? 'up' : 'in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const busy = sync.status === 'busy'

  // Close automatically once signed in; clear any stale auth error on unmount.
  useEffect(() => {
    if (sync.status === 'signedIn') onClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync.status])
  useEffect(() => () => useSync.setState({ error: undefined }), [])

  const switchTo = (m: Mode) => {
    useSync.setState({ error: undefined })
    setMode(m)
  }

  const submit = async () => {
    if (busy) return
    if (mode === 'forgot') {
      if (!email.trim()) return
      if (await sync.sendPasswordReset(email)) setMode('resetSent')
      return
    }
    if (!email.trim() || !password) return
    if (mode === 'up') {
      const r = await sync.signUp(email, password)
      if (r === 'confirm') setMode('checkEmail')
    } else {
      await sync.signIn(email, password)
    }
  }

  const title =
    mode === 'up' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : mode === 'in' ? 'Welcome back' : 'Check your email'

  return createPortal(
    // stopPropagation: when opened from Settings this is a React child of the
    // settings backdrop (events bubble through the React tree across the portal).
    <div className="auth-screen" onClick={(e) => e.stopPropagation()}>
      {!onSkip && (
        <button className="auth-close pressable" onClick={onClose} aria-label="Close">
          ✕
        </button>
      )}
      <div className="welcome-inner">
        <div className="welcome-brand">
          <Wordmark size={40} />
          <h1 className="welcome-title">{title}</h1>
          {(mode === 'in' || mode === 'up') && (
            <p className="welcome-tag">{note ?? 'Track what you watch, on every device, with friends.'}</p>
          )}
        </div>

        {mode === 'checkEmail' || mode === 'resetSent' ? (
          <div className="welcome-form">
            <p className="auth-note">
              {mode === 'checkEmail' ? 'We sent a confirmation link to ' : 'We sent a password reset link to '}
              <b>{email.trim()}</b>. Open it on this device to continue.
            </p>
            <button className="welcome-primary pressable" onClick={() => switchTo('in')}>
              Back to sign in
            </button>
          </div>
        ) : (
          <form
            className="welcome-form"
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            {mode !== 'forgot' && (
              <>
                <button type="button" className="google-btn pressable" disabled={busy} onClick={() => void sync.signInWithGoogle()}>
                  <GoogleMark />
                  Continue with Google
                </button>
                <div className="auth-or">
                  <span>or with email</span>
                </div>
              </>
            )}

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
            {mode !== 'forgot' && (
              <div className="pw-row">
                <input
                  className="sync-input"
                  type={showPw ? 'text' : 'password'}
                  autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
                  placeholder={mode === 'up' ? 'Password (6+ characters)' : 'Password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button type="button" className="pw-toggle" onClick={() => setShowPw((v) => !v)}>
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </div>
            )}

            {sync.error && (
              <div className="sync-error" role="alert">
                {sync.error}
              </div>
            )}

            <button
              type="submit"
              className="welcome-primary pressable"
              disabled={busy || !email.trim() || (mode !== 'forgot' && !password)}
            >
              {busy ? 'One moment…' : mode === 'up' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Sign in'}
            </button>

            {mode === 'in' && (
              <button type="button" className="auth-link" onClick={() => switchTo('forgot')}>
                Forgot password?
              </button>
            )}

            <button type="button" className="welcome-switch pressable" onClick={() => switchTo(mode === 'up' ? 'in' : mode === 'in' ? 'up' : 'in')}>
              {mode === 'up' ? (
                <>
                  Have an account? <b>Sign in</b>
                </>
              ) : mode === 'in' ? (
                <>
                  New here? <b>Create an account</b>
                </>
              ) : (
                'Back to sign in'
              )}
            </button>
          </form>
        )}

        {(onSkip || firstRun) && (
          <button className="welcome-skip pressable" onClick={onSkip ?? onClose}>
            {skipLabel ?? 'Continue without an account'}
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}

export function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}
