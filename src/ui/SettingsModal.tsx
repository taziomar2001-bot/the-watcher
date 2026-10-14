import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ImportPanel } from './ImportPanel'
import { useLibrary } from '../store/useLibrary'
import { useSync } from '../logic/sync'
import { useToast } from '../store/useToast'
import { claimUsername, updateMyIdentity, getMyProfile, type SocialProfile } from '../data/social'
import { CheckIcon, CloudIcon, PersonIcon, TvIcon } from '../components/Icons'

const USERNAME_RE = /^[a-z0-9_]{3,20}$/

function timeAgo(ms?: number): string {
  if (!ms) return 'not yet'
  const s = Math.floor((Date.now() - ms) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

// Resize an uploaded image to a small square data URL (keeps storage tiny).
function fileToAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const size = 128
      const c = document.createElement('canvas')
      c.width = size
      c.height = size
      const ctx = c.getContext('2d')
      if (!ctx) return reject(new Error('no ctx'))
      const s = Math.min(img.width, img.height)
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = reject
    img.src = url
  })
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const lib = useLibrary()
  const sync = useSync()
  const toast = useToast((s) => s.show)
  const fileInput = useRef<HTMLInputElement>(null)
  const restoreInput = useRef<HTMLInputElement>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pendingRestore, setPendingRestore] = useState<File | null>(null)

  // Auth form (signed-out): sign in vs create account.
  const [authMode, setAuthMode] = useState<'in' | 'up'>('in')
  const [suUsername, setSuUsername] = useState('')
  const [suVisibility, setSuVisibility] = useState<'public' | 'private'>('public')

  // Public (Supabase) profile, loaded when signed in.
  const [social, setSocial] = useState<SocialProfile | null>(null)
  const [unameEdit, setUnameEdit] = useState('')
  const [bioEdit, setBioEdit] = useState('')
  const [savingUname, setSavingUname] = useState(false)

  useEffect(() => {
    let alive = true
    if (sync.status === 'signedIn') {
      getMyProfile().then((p) => {
        if (!alive || !p) return
        setSocial(p)
        setUnameEdit(p.username ?? '')
        setBioEdit(p.bio ?? '')
        // Carry the local display name/avatar up to the public profile if unset.
        const patch: Record<string, string> = {}
        if (!p.display_name && lib.profile.displayName) patch.display_name = lib.profile.displayName
        if (!p.avatar && lib.profile.avatar) patch.avatar = lib.profile.avatar
        if (Object.keys(patch).length) void updateMyIdentity(patch)
      })
    } else {
      setSocial(null)
    }
    return () => {
      alive = false
    }
  }, [sync.status])

  const doSignUp = () => {
    const u = suUsername.trim().toLowerCase()
    if (!USERNAME_RE.test(u)) {
      toast('Username must be 3–20 letters, numbers or underscores')
      return
    }
    sync.signUp(email, password, { username: u, displayName: lib.profile.displayName || '', visibility: suVisibility })
  }

  const saveUsername = async () => {
    const u = unameEdit.trim().toLowerCase()
    if (!USERNAME_RE.test(u)) {
      toast('Username must be 3–20 letters, numbers or underscores')
      return
    }
    setSavingUname(true)
    const r = await claimUsername(u)
    setSavingUname(false)
    if (r.ok) {
      setSocial((s) => (s ? { ...s, username: r.username } : s))
      toast('Username saved')
    } else {
      toast(r.code === 'username_taken' ? 'That username is already taken' : 'Could not save that username')
    }
  }

  const setVisibility = async (v: 'public' | 'private') => {
    setSocial((s) => (s ? { ...s, visibility: v } : s))
    const ok = await updateMyIdentity({ visibility: v })
    if (!ok) toast('Could not update visibility')
  }

  const saveBio = async () => {
    const ok = await updateMyIdentity({ bio: bioEdit.trim() })
    if (ok) {
      setSocial((s) => (s ? { ...s, bio: bioEdit.trim() } : s))
      toast('Bio saved')
    }
  }

  // ---- Local backup / restore (a verifiable, in-hand rollback path) ----
  // Serialises the entire on-device library (the persisted store + sync meta)
  // to a JSON file. Reading/writing the raw localStorage blob guarantees a
  // faithful copy regardless of future schema changes.
  const exportBackup = () => {
    try {
      const payload = {
        app: 'the-watcher',
        kind: 'backup',
        version: 1,
        exportedAt: new Date().toISOString(),
        library: JSON.parse(localStorage.getItem('the-watcher-library-v1') || 'null'),
        syncMeta: JSON.parse(localStorage.getItem('tw-sync-meta') || 'null'),
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `the-watcher-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast('Backup downloaded')
    } catch {
      toast("Couldn't create the backup file")
    }
  }

  const doRestore = async () => {
    const file = pendingRestore
    setPendingRestore(null)
    if (!file) return
    try {
      const payload = JSON.parse(await file.text())
      if (payload?.app !== 'the-watcher' || !payload.library) {
        toast("That doesn't look like a Watcher backup file")
        return
      }
      localStorage.setItem('the-watcher-library-v1', JSON.stringify(payload.library))
      if (payload.syncMeta) localStorage.setItem('tw-sync-meta', JSON.stringify(payload.syncMeta))
      location.reload()
    } catch {
      toast('Could not read that backup file')
    }
  }

  // Lock the Profile page behind the modal so only the modal scrolls.
  useEffect(() => {
    document.body.classList.add('modal-open')
    return () => document.body.classList.remove('modal-open')
  }, [])

  const name = lib.profile.displayName || lib.profile.username || 'you'

  const pickAvatar = async (f?: File) => {
    if (!f) return
    try {
      lib.updateProfile({ avatar: await fileToAvatar(f) })
    } catch {
      /* ignore */
    }
  }

  const doDelete = async () => {
    await sync.deleteCloudData().catch(() => {})
    try {
      localStorage.removeItem('the-watcher-library-v1')
    } catch {
      /* ignore */
    }
    location.reload()
  }

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <span className="settings-title">Settings</span>
          <button className="settings-close pressable" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="settings-body">
          {/* ---- Profile ---- */}
          <div className="settings-group-label">
            <PersonIcon size={15} /> Profile
          </div>
          <div className="settings-card">
            <div className="settings-avatar-row">
              <button className="settings-avatar pressable" onClick={() => fileInput.current?.click()}>
                {lib.profile.avatar ? <img src={lib.profile.avatar} alt="" /> : name[0].toUpperCase()}
              </button>
              <div className="settings-avatar-actions">
                <button className="sync-btn pressable" onClick={() => fileInput.current?.click()}>
                  Change photo
                </button>
                {lib.profile.avatar && (
                  <button className="sync-btn ghost pressable" onClick={() => lib.updateProfile({ avatar: '' })}>
                    Remove
                  </button>
                )}
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => pickAvatar(e.target.files?.[0])}
              />
            </div>
            <label className="settings-field">
              <span>Display name</span>
              <input
                className="sync-input"
                value={lib.profile.displayName ?? ''}
                placeholder="Your name"
                onChange={(e) => lib.updateProfile({ displayName: e.target.value })}
              />
            </label>
            <label className="settings-field">
              <span>Username</span>
              <input
                className="sync-input"
                value={lib.profile.username ?? ''}
                placeholder="username"
                onChange={(e) => lib.updateProfile({ username: e.target.value })}
              />
            </label>
          </div>

          {/* ---- Library & Data ---- */}
          <div className="settings-group-label">
            <TvIcon size={15} /> Library &amp; Data
          </div>
          <ImportPanel />

          {/* ---- Local backup / restore ---- */}
          <div className="settings-card">
            <div className="settings-muted">
              Download a complete copy of everything on this device — watch history, ratings, lists, favorites and settings — to a file you keep. You can restore it here at any time.
            </div>
            <div className="sync-actions">
              <button className="sync-btn primary pressable" onClick={exportBackup}>
                <CheckIcon size={15} /> Download backup
              </button>
              <button className="sync-btn pressable" onClick={() => restoreInput.current?.click()}>
                Restore from file
              </button>
            </div>
            <input
              ref={restoreInput}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) setPendingRestore(f)
                e.target.value = ''
              }}
            />
          </div>

          {/* ---- Cloud Backup ---- */}
          <div className="settings-group-label">
            <CloudIcon size={15} /> Cloud Backup
          </div>
          {sync.status === 'disabled' ? (
            <div className="settings-card">
              <div className="settings-muted">Cloud backup isn't configured for this build. Your library is saved on this device.</div>
            </div>
          ) : sync.status === 'signedIn' ? (
            <div className="settings-card">
              <div className="settings-row-flat">
                <span>Backup</span>
                <span className="sync-badge">On</span>
              </div>
              <div className="settings-row-flat">
                <span>Account</span>
                <b>{sync.email}</b>
              </div>
              <div className="settings-row-flat">
                <span>Last backed up</span>
                <b>{timeAgo(sync.lastSyncedAt)}</b>
              </div>
              {sync.pendingWrite && !sync.error && <div className="sync-warn">Backup pending — will retry automatically.</div>}
              {sync.error && (
                <div className="sync-error" style={{ userSelect: 'text' }}>
                  Backup error: {sync.error}
                </div>
              )}
              {sync.remoteNewer && (
                <div className="sync-warn">
                  Your cloud backup has newer data than this device.
                  <button onClick={() => sync.restoreNow()}>Restore it</button>
                </div>
              )}
              <div className="sync-actions">
                <button className="sync-btn primary pressable" onClick={() => sync.backupNow()}>
                  <CheckIcon size={15} /> Back up now
                </button>
                <button className="sync-btn pressable" onClick={() => sync.restoreNow()}>
                  Restore
                </button>
              </div>
            </div>
          ) : (
            <div className="settings-card">
              <div className="settings-muted">
                {authMode === 'up'
                  ? 'Create your account to sync your library and join the community.'
                  : 'Sign in to sync your library across devices.'}
              </div>
              <div className="sync-form">
                <input className="sync-input" type="email" inputMode="email" autoCapitalize="none" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <input className="sync-input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
                {authMode === 'up' && (
                  <>
                    <input
                      className="sync-input"
                      autoCapitalize="none"
                      autoCorrect="off"
                      placeholder="Username (your @handle)"
                      value={suUsername}
                      onChange={(e) => setSuUsername(e.target.value.toLowerCase())}
                    />
                    <div className="vis-choice">
                      <button
                        type="button"
                        className={`vis-opt pressable ${suVisibility === 'public' ? 'on' : ''}`}
                        onClick={() => setSuVisibility('public')}
                      >
                        Public
                      </button>
                      <button
                        type="button"
                        className={`vis-opt pressable ${suVisibility === 'private' ? 'on' : ''}`}
                        onClick={() => setSuVisibility('private')}
                      >
                        Private
                      </button>
                    </div>
                    <div className="vis-hint">
                      {suVisibility === 'public'
                        ? 'Anyone can find your profile and follow you.'
                        : 'Your profile is discoverable, but followers need your approval to see your activity.'}
                    </div>
                  </>
                )}
              </div>
              {sync.error && <div className="sync-error">{sync.error}</div>}
              <div className="sync-actions">
                <button
                  className="sync-btn primary pressable"
                  disabled={sync.status === 'busy' || !email || !password || (authMode === 'up' && !suUsername)}
                  onClick={() => (authMode === 'up' ? doSignUp() : sync.signIn(email, password))}
                >
                  {sync.status === 'busy' ? 'Working…' : authMode === 'up' ? 'Create account' : 'Sign in'}
                </button>
              </div>
              <button className="auth-switch pressable" onClick={() => setAuthMode(authMode === 'up' ? 'in' : 'up')}>
                {authMode === 'up' ? 'Already have an account? Sign in' : 'New to The Watcher? Create account'}
              </button>
            </div>
          )}

          {/* ---- Public profile (social identity) ---- */}
          {sync.status === 'signedIn' && (
            <>
              <div className="settings-group-label">
                <PersonIcon size={15} /> Public profile
              </div>
              <div className="settings-card">
                <label className="settings-field">
                  <span>Username</span>
                  <div className="uname-row">
                    <span className="uname-at">@</span>
                    <input
                      className="sync-input"
                      autoCapitalize="none"
                      autoCorrect="off"
                      value={unameEdit}
                      placeholder="username"
                      onChange={(e) => setUnameEdit(e.target.value.toLowerCase())}
                    />
                    <button className="sync-btn pressable" disabled={savingUname || unameEdit === (social?.username ?? '')} onClick={saveUsername}>
                      {savingUname ? '…' : 'Save'}
                    </button>
                  </div>
                </label>
                <label className="settings-field">
                  <span>Bio</span>
                  <input className="sync-input" value={bioEdit} placeholder="A short line about you" maxLength={160} onChange={(e) => setBioEdit(e.target.value)} onBlur={saveBio} />
                </label>
                <div className="settings-row-flat">
                  <span>Account visibility</span>
                  <div className="vis-choice sm">
                    <button type="button" className={`vis-opt pressable ${social?.visibility !== 'private' ? 'on' : ''}`} onClick={() => setVisibility('public')}>
                      Public
                    </button>
                    <button type="button" className={`vis-opt pressable ${social?.visibility === 'private' ? 'on' : ''}`} onClick={() => setVisibility('private')}>
                      Private
                    </button>
                  </div>
                </div>
                <div className="settings-muted" style={{ marginTop: 2 }}>
                  {social?.follower_count ?? 0} followers · {social?.following_count ?? 0} following
                </div>
              </div>
            </>
          )}

          {/* ---- Account ---- */}
          {sync.status === 'signedIn' && (
            <>
              <div className="settings-group-label">
                <PersonIcon size={15} /> Account
              </div>
              <div className="settings-card">
                <div className="settings-row-flat">
                  <span>Signed in as</span>
                  <b>{sync.email}</b>
                </div>
                <div className="sync-actions" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                  <button className="sync-btn pressable" onClick={() => setConfirmSignOut(true)}>
                    Sign out
                  </button>
                  <button className="sync-btn danger pressable" onClick={() => setConfirmDelete(true)}>
                    Delete account
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="settings-note">The Watcher · your library is stored on this device and, when signed in, backed up to your private cloud.</div>
        </div>
      </div>

      {confirmSignOut && (
        <div
          className="sheet-backdrop"
          onClick={(e) => {
            e.stopPropagation()
            setConfirmSignOut(false)
          }}
        >
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="confirm-title">Sign out of Watcher?</div>
            <div className="confirm-body">Your library stays backed up in the cloud and on this device.</div>
            <div className="confirm-actions">
              <button className="sync-btn ghost pressable" onClick={() => setConfirmSignOut(false)}>
                Cancel
              </button>
              <button
                className="sync-btn pressable"
                onClick={() => {
                  setConfirmSignOut(false)
                  sync.signOut()
                }}
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div
          className="sheet-backdrop"
          onClick={(e) => {
            e.stopPropagation()
            setConfirmDelete(false)
          }}
        >
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="confirm-title">Delete account?</div>
            <div className="confirm-body">
              This permanently deletes your Watcher library data from the cloud and clears it from this device. This cannot be undone.
            </div>
            <div className="confirm-actions">
              <button className="sync-btn ghost pressable" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button className="sync-btn danger pressable" onClick={doDelete}>
                Delete Account
              </button>
            </div>
          </div>
        </div>
      )}
      {pendingRestore && (
        <div
          className="sheet-backdrop"
          onClick={(e) => {
            e.stopPropagation()
            setPendingRestore(null)
          }}
        >
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="confirm-title">Restore from backup?</div>
            <div className="confirm-body">
              This replaces the library currently on this device with the contents of “{pendingRestore.name}”, then reloads. Download a backup first if you’re unsure.
            </div>
            <div className="confirm-actions">
              <button className="sync-btn ghost pressable" onClick={() => setPendingRestore(null)}>
                Cancel
              </button>
              <button className="sync-btn pressable" onClick={doRestore}>
                Restore
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
