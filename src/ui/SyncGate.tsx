import { useState } from 'react'
import { downloadLocalBackup } from '../logic/backup'
import { summarize, useSync, type LibrarySummary } from '../logic/sync'
import { useLibrary } from '../store/useLibrary'
import { useToast } from '../store/useToast'

function ago(ms?: number) {
  if (!ms) return ''
  const s = Math.floor((Date.now() - ms) / 1000)
  if (s < 60) return 'updated just now'
  if (s < 3600) return `updated ${Math.floor(s / 60)} min ago`
  if (s < 86400) return `updated ${Math.floor(s / 3600)} h ago`
  return `updated ${Math.floor(s / 86400)} days ago`
}
const sizeLabel = (s: LibrarySummary) =>
  s.shows + s.movies === 0 ? 'Empty' : `${s.shows.toLocaleString()} shows · ${s.movies.toLocaleString()} movies`

/**
 * Shown only while signing in on a device whose library can't simply be used:
 * while we check the account (a quiet loading screen), when the account can't
 * be reached, or when the device and account hold different libraries.
 */
export function SyncGate() {
  const sync = useSync()
  const libraryShows = useLibrary((s) => s.libraryShows)
  const libraryMovies = useLibrary((s) => s.libraryMovies)
  const toast = useToast((s) => s.show)
  const [working, setWorking] = useState(false)
  const [confirmEmpty, setConfirmEmpty] = useState(false)
  const busy = working || sync.status === 'busy'

  const run = async (action: () => Promise<void>) => {
    setWorking(true)
    try {
      await action()
    } finally {
      setWorking(false)
    }
  }
  const saveCopy = () => {
    try {
      downloadLocalBackup()
      toast('Saved a copy of this device’s library')
    } catch {
      toast("Couldn't save a copy")
    }
  }

  // 1. Still checking — no decision needed, so no alarming text.
  if (!sync.remoteNewer && !sync.error)
    return (
      <main className="sync-gate" aria-busy="true">
        <div className="sync-gate-card" style={{ textAlign: 'center' }}>
          <div className="welcome-logo">W</div>
          <div className="sync-gate-progress" role="status">
            Loading your library…
          </div>
        </div>
      </main>
    )

  // 2. Couldn't reach the account.
  if (!sync.remoteNewer)
    return (
      <main className="sync-gate" aria-labelledby="sync-gate-title">
        <div className="sync-gate-card">
          <h1 id="sync-gate-title">Can’t reach your account</h1>
          <p>Check your connection and try again. Nothing on this device has been changed.</p>
          {sync.email && <div className="sync-gate-account">Signed in as {sync.email}</div>}
          <button className="sync-btn full primary pressable" disabled={busy} onClick={() => void run(sync.retrySync)}>
            Try again
          </button>
          <button className="auth-link" onClick={saveCopy}>
            Save a copy of this device’s library
          </button>
        </div>
      </main>
    )

  // 3. Device and account differ: pick one.
  const local = summarize({ libraryShows, libraryMovies })
  const remote = sync.remoteSummary ?? { shows: 0, movies: 0 }
  const accountEmpty = !!sync.cloudEmpty

  return (
    <main className="sync-gate" aria-labelledby="sync-gate-title">
      <div className="sync-gate-card">
        <h1 id="sync-gate-title">{sync.canKeepDeviceCopy ? 'Which library should we use?' : 'Use your account’s library'}</h1>
        <p>
          {sync.canKeepDeviceCopy
            ? 'This device and your account have different libraries. The one you pick replaces the other.'
            : 'This device has a library from a different account. It will be replaced by yours.'}
        </p>
        {sync.email && <div className="sync-gate-account">Signed in as {sync.email}</div>}

        <div className="choice-list">
          {accountEmpty && !confirmEmpty ? (
            <button className="choice-card pressable" disabled={busy} onClick={() => setConfirmEmpty(true)}>
              <span className="choice-title">Your account</span>
              <span className="choice-sub">Empty — start fresh</span>
            </button>
          ) : (
            <button className={`choice-card pressable ${accountEmpty ? 'danger' : ''}`} disabled={busy} onClick={() => void run(sync.restoreNow)}>
              <span className="choice-title">{accountEmpty ? 'Yes, start fresh' : 'Your account'}</span>
              <span className="choice-sub">
                {accountEmpty ? 'This device’s library will be cleared' : [sizeLabel(remote), ago(remote.updatedAt)].filter(Boolean).join(' · ')}
              </span>
            </button>
          )}
          {sync.canKeepDeviceCopy && (
            <button className="choice-card pressable" disabled={busy} onClick={() => void run(sync.backupNow)}>
              <span className="choice-title">This device</span>
              <span className="choice-sub">{sizeLabel(local)} · saved to your account</span>
            </button>
          )}
        </div>

        <button className="auth-link" onClick={saveCopy}>
          Save a copy of this device’s library first
        </button>
        {accountEmpty && !sync.canKeepDeviceCopy && (
          <div className="sync-gate-note">If this device’s library is yours, save a copy, then use Settings → Import library file.</div>
        )}
      </div>
    </main>
  )
}
