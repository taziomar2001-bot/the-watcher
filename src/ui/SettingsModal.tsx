import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AuthScreen } from './AuthScreen'
import { useLibrary } from '../store/useLibrary'
import { useSync } from '../logic/sync'
import { downloadLocalBackup } from '../logic/backup'
import { useToast } from '../store/useToast'
import { SUPABASE_ENABLED } from '../data/supabase'
import { claimUsername, updateMyIdentity, getMyProfile, type SocialProfile } from '../data/social'
import { CheckIcon, CloudIcon, PersonIcon, TvIcon, SettingsIcon } from '../components/Icons'

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
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pendingRestore, setPendingRestore] = useState<File | null>(null)
  const [showAuth, setShowAuth] = useState(false)

  // Public (Supabase) profile, loaded when signed in.
  const [social, setSocial] = useState<SocialProfile | null>(null)
  const [unameEdit, setUnameEdit] = useState('')
  const [bioEdit, setBioEdit] = useState('')
  const [savingUname, setSavingUname] = useState(false)

  const signedIn = sync.status === 'signedIn'

  useEffect(() => {
    let alive = true
    if (signedIn) {
      getMyProfile().then((p) => {
        if (!alive || !p) return
        setSocial(p)
        setUnameEdit(p.username ?? '')
        setBioEdit(p.bio ?? '')
        // Carry local display name / avatar up to the public profile if unset.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync.status])

  // Lock the Profile page behind the modal so only the modal scrolls.
  useEffect(() => {
    document.body.classList.add('modal-open')
    return () => document.body.classList.remove('modal-open')
  }, [])

  const name = lib.profile.displayName || lib.profile.username || 'you'

  const pickAvatar = async (f?: File) => {
    if (!f) return
    try {
      const dataUrl = await fileToAvatar(f)
      lib.updateProfile({ avatar: dataUrl })
      if (signedIn) void updateMyIdentity({ avatar: dataUrl })
    } catch {
      /* ignore */
    }
  }
  const removeAvatar = () => {
    lib.updateProfile({ avatar: '' })
    if (signedIn) void updateMyIdentity({ avatar: '' })
  }
  const syncDisplayName = () => {
    if (signedIn) void updateMyIdentity({ display_name: lib.profile.displayName || '' })
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
  const exportBackup = () => {
    try {
      downloadLocalBackup()
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
      // A file can come from another account or an older device. Reconcile it
      // explicitly instead of trusting its old sync timestamp or owner.
      localStorage.setItem('tw-sync-meta', JSON.stringify({ localUpdatedAt: Date.now(), hasSynced: true }))
      location.reload()
    } catch {
      toast('Could not read that backup file')
    }
  }

  const doDelete = async () => {
    if (!await sync.deleteCloudData()) return
    try {
      localStorage.removeItem('the-watcher-library-v1')
      localStorage.removeItem('tw-sync-meta')
      localStorage.removeItem('tw-onboarded')
      localStorage.removeItem('tw-pending-username')
    } catch {
      /* ignore */
    }
    location.reload()
  }

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <span className="settings-title">
            <SettingsIcon size={18} /> Settings
          </span>
          <button className="settings-close pressable" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="settings-body">
          {/* ---- Account (top: who you are / sign in / sign out) ---- */}
          <div className="settings-group-label">
            <PersonIcon size={15} /> Account
          </div>

          {signedIn ? (
            <div className="settings-card">
              <div className="account-head">
                <div className="account-avatar">
                  {lib.profile.avatar ? <img src={lib.profile.avatar} alt="" /> : name[0].toUpperCase()}
                </div>
                <div className="account-id">
                  <div className="account-name">{lib.profile.displayName || name}</div>
                  {social?.username && <div className="account-handle">@{social.username}</div>}
                  <div className="account-email">{sync.email}</div>
                </div>
              </div>
              {social && (
                <div className="account-counts">
                  <span>
                    <b>{social.follower_count}</b> followers
                  </span>
                  <span>
                    <b>{social.following_count}</b> following
                  </span>
                </div>
              )}
              <button className="sync-btn full pressable" onClick={() => setConfirmSignOut(true)}>
                Sign out
              </button>
              <button className="settings-textlink danger" onClick={() => setConfirmDelete(true)}>
                Delete cloud library
              </button>
            </div>
          ) : SUPABASE_ENABLED ? (
            <div className="settings-card">
              <div className="settings-muted">
                Sign in or create a free account to sync your library across devices and connect with other watchers.
              </div>
              <button className="sync-btn primary full pressable" onClick={() => setShowAuth(true)}>
                Sign in or create account
              </button>
            </div>
          ) : (
            <div className="settings-card">
              <div className="settings-muted">Accounts aren't configured for this build — your library is saved on this device.</div>
            </div>
          )}

          {/* ---- Profile (identity you show others) ---- */}
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
                  <button className="sync-btn ghost pressable" onClick={removeAvatar}>
                    Remove
                  </button>
                )}
              </div>
              <input ref={fileInput} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => pickAvatar(e.target.files?.[0])} />
            </div>

            <label className="settings-field">
              <span>Display name</span>
              <input
                className="sync-input"
                value={lib.profile.displayName ?? ''}
                placeholder="Your name"
                onChange={(e) => lib.updateProfile({ displayName: e.target.value })}
                onBlur={syncDisplayName}
              />
            </label>

            {signedIn ? (
              <>
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
                <div className="settings-field">
                  <span>Account visibility</span>
                  <div className="vis-choice">
                    <button type="button" className={`vis-opt pressable ${social?.visibility !== 'private' ? 'on' : ''}`} onClick={() => setVisibility('public')}>
                      Public
                    </button>
                    <button type="button" className={`vis-opt pressable ${social?.visibility === 'private' ? 'on' : ''}`} onClick={() => setVisibility('private')}>
                      Private
                    </button>
                  </div>
                  <div className="vis-hint">
                    {social?.visibility === 'private'
                      ? 'You approve who can follow you and see your activity.'
                      : 'Anyone can find your profile and follow you.'}
                  </div>
                </div>
              </>
            ) : (
              SUPABASE_ENABLED && <div className="settings-muted">Sign in to claim an @username, add a bio, and make your profile public.</div>
            )}
          </div>

          {/* ---- Library & Data ---- */}
          <div className="settings-group-label">
            <TvIcon size={15} /> Library &amp; Data
          </div>
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

          {/* ---- Cloud sync (signed in) ---- */}
          {signedIn && (
            <>
              <div className="settings-group-label">
                <CloudIcon size={15} /> Cloud sync
              </div>
              <div className="settings-card">
                <div className="settings-row-flat">
                  <span>Status</span>
                  <span className="sync-badge">{sync.pendingWrite ? 'Pending' : sync.syncReady ? 'On' : sync.error || sync.remoteNewer ? 'Needs attention' : 'Checking'}</span>
                </div>
                <div className="settings-row-flat">
                  <span>Last synced</span>
                  <b>{timeAgo(sync.lastSyncedAt)}</b>
                </div>
                {sync.pendingWrite && !sync.error && <div className="sync-warn">Sync pending — will retry automatically.</div>}
                {sync.error && (
                  <div className="sync-error" style={{ userSelect: 'text' }}>
                    Sync error: {sync.error}
                  </div>
                )}
                {sync.remoteNewer && (
                  <div className="sync-warn">
                    This device and your cloud account have different libraries. Download a backup before choosing which copy to keep.
                    <button onClick={() => sync.restoreNow()}>Keep cloud copy</button>
                    <button onClick={() => sync.backupNow()}>Keep device copy</button>
                  </div>
                )}
                {!sync.syncReady && !sync.remoteNewer && (
                  <button className="sync-btn pressable" onClick={() => sync.retrySync()}>Retry cloud check</button>
                )}
                {sync.syncReady && !sync.remoteNewer && (
                  <div className="sync-actions">
                    <button className="sync-btn primary pressable" onClick={() => sync.backupNow()}>
                      <CheckIcon size={15} /> Back up now
                    </button>
                    <button className="sync-btn pressable" onClick={() => sync.restoreNow()}>
                      Restore
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="settings-note">The Watcher · your library lives on this device and, when signed in, syncs to your private cloud.</div>
        </div>
      </div>

      {showAuth && <AuthScreen onClose={() => setShowAuth(false)} />}

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
            <div className="confirm-title">Sign out?</div>
            <div className="confirm-body">Your latest changes will be backed up, then this device's library will be cleared. If the backup fails, you will stay signed in.</div>
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
            <div className="confirm-title">Delete cloud library?</div>
            <div className="confirm-body">
              This deletes your Watcher library from the cloud and this device, then signs you out. Your login and social profile remain. Download a backup first if you may want this library later.
            </div>
            <div className="confirm-actions">
              <button className="sync-btn ghost pressable" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button className="sync-btn danger pressable" onClick={doDelete}>
                Delete Library
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
