import { useState } from 'react'
import { useSync } from '../logic/sync'
import { useToast } from '../store/useToast'

/** Shown after opening a password-reset link: choose a new password. */
export function NewPassword() {
  const email = useSync((s) => s.email)
  const error = useSync((s) => s.error)
  const updatePassword = useSync((s) => s.updatePassword)
  const toast = useToast((s) => s.show)
  const [pw, setPw] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (pw.length < 6 || saving) return
    setSaving(true)
    const ok = await updatePassword(pw)
    setSaving(false)
    if (ok) toast('Password updated')
  }

  return (
    <main className="sync-gate finish-profile" aria-labelledby="newpw-title">
      <form
        className="sync-gate-card"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <div className="sync-gate-eyebrow">THE WATCHER</div>
        <h1 id="newpw-title">Choose a new password</h1>
        {email && <div className="sync-gate-account">For {email}</div>}
        <input
          className="sync-input"
          type="password"
          autoComplete="new-password"
          placeholder="New password (6+ characters)"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
        {error && (
          <div className="sync-error" role="alert">
            {error}
          </div>
        )}
        <button type="submit" className="welcome-primary pressable" disabled={pw.length < 6 || saving}>
          {saving ? 'Saving…' : 'Save password'}
        </button>
        <button type="button" className="welcome-switch pressable" onClick={() => useSync.setState({ recovering: false })}>
          Skip for now
        </button>
      </form>
    </main>
  )
}
