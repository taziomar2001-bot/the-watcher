import { useEffect, useState } from 'react'
import { supabase } from '../data/supabase'
import { claimUsername, getMyProfile, updateMyIdentity } from '../data/social'
import { hasPendingUsernameFor, useSync } from '../logic/sync'
import { useLibrary } from '../store/useLibrary'

const USERNAME_RE = /^[a-z0-9_]{3,20}$/

/**
 * True when the signed-in account has no @username yet — e.g. it was created
 * with "Continue with Google", which skips the signup form. Those accounts must
 * still pick a handle and choose public/private before using the app.
 */
export function useNeedsProfile(): [boolean, () => void] {
  const status = useSync((s) => s.status)
  const syncReady = useSync((s) => s.syncReady)
  const email = useSync((s) => s.email)
  const [needs, setNeeds] = useState(false)

  useEffect(() => {
    let alive = true
    if (status !== 'signedIn' || !syncReady) {
      setNeeds(false)
      return
    }
    // An email signup's handle is claimed right after sign-in; don't race it.
    if (hasPendingUsernameFor(email)) return
    getMyProfile().then((p) => {
      if (alive) setNeeds(!!p && !p.username)
    })
    return () => {
      alive = false
    }
  }, [status, syncReady, email])

  return [needs, () => setNeeds(false)]
}

export function CompleteProfile({ onDone }: { onDone: () => void }) {
  const email = useSync((s) => s.email)
  const signOut = useSync((s) => s.signOut)
  const updateProfile = useLibrary((s) => s.updateProfile)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private' | null>(null)
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)

  // Prefill the display name from the Google account (or an existing profile).
  useEffect(() => {
    let alive = true
    void (async () => {
      const p = await getMyProfile()
      const { data } = (await supabase?.auth.getUser()) ?? { data: { user: null } }
      const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>
      const suggested = p?.display_name || (meta.full_name as string) || (meta.name as string) || ''
      if (!alive) return
      setDisplayName((d) => d || suggested)
      if (p?.visibility && p.username) setVisibility(p.visibility)
    })()
    return () => {
      alive = false
    }
  }, [])

  const valid = USERNAME_RE.test(username) && !!visibility

  const submit = async () => {
    if (!valid || !visibility) return
    setSaving(true)
    setError(undefined)
    const r = await claimUsername(username)
    if (!r.ok) {
      setSaving(false)
      setError(
        r.code === 'username_taken'
          ? 'That username is already taken.'
          : r.code === 'invalid_username'
            ? 'Use 3–20 lowercase letters, numbers or underscores.'
            : 'Could not save your profile. Check your connection and try again.',
      )
      return
    }
    const ok = await updateMyIdentity({ display_name: displayName.trim(), visibility })
    setSaving(false)
    if (!ok) {
      setError('Your username was saved, but your profile settings were not. Try again.')
      return
    }
    updateProfile({ username: r.username, displayName: displayName.trim() })
    onDone()
  }

  return (
    <main className="sync-gate finish-profile" aria-labelledby="finish-title">
      <div className="sync-gate-card">
        <div className="sync-gate-eyebrow">THE WATCHER · ONE LAST STEP</div>
        <h1 id="finish-title">Finish your profile</h1>
        <p>Pick the name other watchers will find you by, and who can see your activity.</p>
        {email && <div className="sync-gate-account">Signed in as {email}</div>}

        <div className="finish-label">Username</div>
        <div className="uname-row">
          <span className="uname-at">@</span>
          <input
            className="sync-input"
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="username"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
          />
        </div>

        <div className="finish-label">Display name</div>
        <input
          className="sync-input"
          placeholder="Display name (optional)"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />

        <div className="finish-label">Account</div>
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
            : visibility === 'private'
              ? 'You approve who can follow you and see your activity.'
              : 'Choose one. You can change it later in Settings.'}
        </div>

        {error && <div className="sync-error" role="alert">{error}</div>}

        <button className="welcome-primary pressable" disabled={!valid || saving} onClick={() => void submit()}>
          {saving ? 'Saving…' : 'Continue'}
        </button>
        <button className="welcome-switch pressable" disabled={saving} onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </main>
  )
}
