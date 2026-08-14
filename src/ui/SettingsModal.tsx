import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ImportPanel } from './ImportPanel'
import { useLibrary } from '../store/useLibrary'
import { useSync } from '../logic/sync'
import { CheckIcon, CloudIcon, PersonIcon, TvIcon } from '../components/Icons'

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
  const fileInput = useRef<HTMLInputElement>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

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
              <div className="settings-muted">Sign in to back up your library and sync it across devices.</div>
              <div className="sync-form">
                <input className="sync-input" type="email" inputMode="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <input className="sync-input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              {sync.error && <div className="sync-error">{sync.error}</div>}
              <div className="sync-actions">
                <button className="sync-btn primary pressable" disabled={sync.status === 'busy' || !email || !password} onClick={() => sync.signIn(email, password)}>
                  {sync.status === 'busy' ? 'Working…' : 'Sign in'}
                </button>
                <button className="sync-btn pressable" disabled={sync.status === 'busy' || !email || !password} onClick={() => sync.signUp(email, password)}>
                  Create account
                </button>
              </div>
            </div>
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
    </div>,
    document.body,
  )
}
