import { discardPending } from '../utils/deferredStorage'
import { ConfirmSheet } from '../ui/Sheet'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthScreen } from '../ui/AuthScreen'
import { useLibrary } from '../store/useLibrary'
import { useSync } from '../logic/sync'
import { useToast } from '../store/useToast'
import { SUPABASE_ENABLED } from '../data/supabase'
import { claimUsername, updateMyIdentity } from '../data/social'
import { useMe, useMyProfile } from '../store/useMe'
import { fileToImage } from '../utils/image'
import { useTheme } from '../logic/theme'
import { PersonIcon, ChevronLeft } from '../components/Icons'

const USERNAME_RE = /^[a-z0-9_]{3,20}$/

function timeAgo(ms?: number): string {
  if (!ms) return 'not yet'
  const s = Math.floor((Date.now() - ms) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

/** Fits on two lines on the Profile tab, even on small phones. */
export const BIO_MAX = 80

export function SettingsScreen() {
  const nav = useNavigate()
  const themePref = useTheme((t) => t.pref)
  const setThemePref = useTheme((t) => t.setPref)
  const lib = useLibrary()
  const sync = useSync()
  const toast = useToast((s) => s.show)
  const fileInput = useRef<HTMLInputElement>(null)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showAuth, setShowAuth] = useState(false)

  const signedIn = sync.status === 'signedIn'
  // Public profile: the cached copy shows instantly, a refresh follows.
  const social = useMyProfile(signedIn ? sync.userId : undefined)
  const patchMe = useMe((s) => s.patch)
  const [unameEdit, setUnameEdit] = useState(social?.username ?? '')
  const [bioEdit, setBioEdit] = useState(social?.bio ?? '')
  const [savingUname, setSavingUname] = useState(false)
  const loadedFor = useRef<string | null>(null)

  useEffect(() => {
    if (signedIn) void useMe.getState().refresh()
  }, [signedIn])
  useEffect(() => {
    // Fill the editable fields once per account, without clobbering typing.
    if (!social || loadedFor.current === social.id) return
    loadedFor.current = social.id
    setUnameEdit(social.username ?? '')
    setBioEdit(social.bio ?? '')
    // Carry local display name / avatar up to the public profile if unset.
    const patch: Record<string, string> = {}
    if (!social.display_name && lib.profile.displayName) patch.display_name = lib.profile.displayName
    if (!social.avatar && lib.profile.avatar) patch.avatar = lib.profile.avatar
    if (Object.keys(patch).length) void updateMyIdentity(patch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [social])

  const name = lib.profile.displayName || lib.profile.username || 'you'

  const pickAvatar = async (f?: File) => {
    if (!f) return
    try {
      const dataUrl = await fileToImage(f, 128, 128)
      lib.updateProfile({ avatar: dataUrl })
      if (signedIn) {
        void updateMyIdentity({ avatar: dataUrl })
        patchMe({ avatar: dataUrl })
      }
    } catch {
      /* ignore */
    }
  }
  const removeAvatar = () => {
    lib.updateProfile({ avatar: '' })
    if (signedIn) {
      void updateMyIdentity({ avatar: '' })
      patchMe({ avatar: '' })
    }
  }
  const syncDisplayName = () => {
    if (signedIn) {
      void updateMyIdentity({ display_name: lib.profile.displayName || '' })
      patchMe({ display_name: lib.profile.displayName || '' })
    }
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
      patchMe({ username: r.username })
      toast('Username saved')
    } else {
      toast(r.code === 'username_taken' ? 'That username is already taken' : 'Could not save that username')
    }
  }

  const setVisibility = async (v: 'public' | 'private') => {
    patchMe({ visibility: v })
    const ok = await updateMyIdentity({ visibility: v })
    if (!ok) toast('Could not update visibility')
  }

  const saveBio = async () => {
    const ok = await updateMyIdentity({ bio: bioEdit.trim() })
    if (ok) {
      patchMe({ bio: bioEdit.trim() })
      toast('Bio saved')
    }
  }

  const doDelete = async () => {
    if (!await sync.deleteCloudData()) return
    try {
      discardPending('the-watcher-library-v1')
    localStorage.removeItem('the-watcher-library-v1')
      localStorage.removeItem('tw-sync-meta')
      localStorage.removeItem('tw-onboarded')
      localStorage.removeItem('tw-pending-username')
    } catch {
      /* ignore */
    }
    location.reload()
  }

  return (
    <div className="scroll-area route-fade">
      <div className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="pressable" onClick={() => nav(-1)} aria-label="Back" style={{ color: 'var(--text-dim)' }}>
            <ChevronLeft size={26} />
          </button>
          <h1 style={{ fontSize: 24 }}>Settings</h1>
        </div>
      </div>
      <div>
        <div className="settings-body settings-page">
          {/* ---- Account ---- */}
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
              <SyncStatusLine />
            </div>
          ) : SUPABASE_ENABLED ? (
            <div className="settings-card">
              <div className="account-cta-title">Your library, everywhere</div>
              <div className="settings-muted">Sign in to sync across devices, get a profile and follow friends.</div>
              <button className="sync-btn primary full pressable" onClick={() => setShowAuth(true)}>
                Sign in or create account
              </button>
            </div>
          ) : (
            <div className="settings-card">
              <div className="settings-muted">Accounts aren't configured for this build — your library is saved on this device.</div>
            </div>
          )}

          {/* ---- Profile (what others see) ---- */}
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

            {signedIn && (
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
                    {unameEdit !== (social?.username ?? '') && (
                      <button className="sync-btn pressable" disabled={savingUname} onClick={saveUsername}>
                        {savingUname ? '…' : 'Save'}
                      </button>
                    )}
                  </div>
                </label>
                <label className="settings-field">
                  <span className="settings-field-row">
                    Bio
                    <span className={`char-count ${bioEdit.length > BIO_MAX ? 'over' : ''}`}>
                      {bioEdit.length}/{BIO_MAX}
                    </span>
                  </span>
                  <input className="sync-input" value={bioEdit} placeholder="A short line about you" maxLength={Math.max(BIO_MAX, bioEdit.length)} onChange={(e) => setBioEdit(e.target.value.length > BIO_MAX && e.target.value.length > bioEdit.length ? bioEdit : e.target.value)} onBlur={saveBio} />
                  {bioEdit.length > BIO_MAX && <span className="vis-hint">Shorten it to {BIO_MAX} characters so it fits on two lines.</span>}
                </label>
                <div className="settings-field">
                  <span>Account</span>
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
                      ? 'You approve who can follow you and see your stats and lists.'
                      : 'Anyone on The Watcher can see your stats, favorites and public lists.'}
                  </div>
                </div>
                <button className="settings-switch-row" onClick={() => lib.updateProfile({ hideFavorites: !lib.profile.hideFavorites })}>
                  <span>Show favorites on my profile</span>
                  <span className={`switch ${lib.profile.hideFavorites ? '' : 'on'}`}>
                    <span className="switch-knob" />
                  </span>
                </button>
                <div className="vis-hint">Lists are shown or hidden one by one from each list’s ••• menu.</div>
              </>
            )}
          </div>

          <div className="settings-group-label">Appearance</div>
          <div className="settings-card settings-rows" role="radiogroup" aria-label="Appearance">
            {(
              [
                ['system', 'Use device setting', 'Matches your phone or computer'],
                ['light', 'Light', undefined],
                ['dark', 'Dark', undefined],
              ] as const
            ).map(([key, label, sub]) => (
              <button key={key} role="radio" aria-checked={themePref === key} className="settings-row pressable" onClick={() => setThemePref(key)}>
                <span className="settings-row-text">
                  <span>{label}</span>
                  {sub && <span className="settings-row-hint">{sub}</span>}
                </span>
                <span className={`radio-dot ${themePref === key ? 'on' : ''}`} aria-hidden="true" />
              </button>
            ))}
          </div>

          {signedIn && (
            <>
              <div className="settings-group-label">Account</div>
              <div className="settings-card settings-rows">
                <button className="settings-row pressable" onClick={() => setConfirmSignOut(true)}>
                  <span>Sign out</span>
                </button>
                <button className="settings-row danger pressable" onClick={() => setConfirmDelete(true)}>
                  <span>Delete my library</span>
                </button>
              </div>
            </>
          )}

          <div className="settings-note">
            {signedIn ? 'Your library saves to your private account automatically.' : 'Your library is saved on this device.'}
          </div>
        </div>
      </div>

      {showAuth && <AuthScreen onClose={() => setShowAuth(false)} />}

      {confirmSignOut && (
        <ConfirmSheet
          title="Sign out?"
          body="Your library stays safe in your account. This device stops showing it until you sign in again."
          confirmLabel="Sign out"
          onCancel={() => setConfirmSignOut(false)}
          onConfirm={() => {
            setConfirmSignOut(false)
            sync.signOut()
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmSheet
          danger
          title="Delete your library?"
          body={
            <>
              This permanently deletes your watch history, ratings, favorites and lists from your account and this device, then signs you out. It can’t be undone.
              <br />
              <br />
              Your sign-in, public profile and community posts stay.
            </>
          }
          confirmLabel="Delete library"
          typeToConfirm="delete"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false)
            void doDelete()
          }}
        />
      )}
    </div>
  )
}

/** One quiet line: is the library saved? Only asks for action when it must. */
function SyncStatusLine() {
  const sync = useSync()
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000)
    return () => clearInterval(t)
  }, [])
  let tone: 'ok' | 'wait' = 'ok'
  let text = `Synced · ${timeAgo(sync.lastSyncedAt)}`
  if (sync.pendingWrite || (sync.error && !sync.syncReady)) {
    tone = 'wait'
    text = 'Offline · changes sync when you’re back online'
  } else if (!sync.syncReady) {
    tone = 'wait'
    text = 'Connecting…'
  } else if (!sync.lastSyncedAt) text = 'Synced'
  return (
    <div className={`sync-line ${tone}`}>
      <span className="sync-dot" />
      <span>{text}</span>
      {tone === 'wait' && sync.error && (
        <button className="sync-line-action" onClick={() => void sync.retrySync()}>
          Retry
        </button>
      )}
    </div>
  )
}
