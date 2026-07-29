import { useState } from 'react'
import { useSync } from '../logic/sync'
import { CheckIcon } from '../components/Icons'

function timeAgo(ms?: number): string {
  if (!ms) return 'not yet'
  const s = Math.floor((Date.now() - ms) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function SyncPanel() {
  const sync = useSync()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  if (sync.status === 'disabled') return null

  return (
    <div className="sync-card">
      <div className="sync-head">
        <span className="sync-title">Cloud Backup</span>
        {sync.status === 'signedIn' && <span className="sync-badge">On</span>}
      </div>

      {sync.status === 'signedIn' ? (
        <>
          <div className="sync-info">
            Backed up as <b>{sync.email}</b> · last synced {timeAgo(sync.lastSyncedAt)}
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
            <button className="sync-btn ghost pressable" onClick={() => sync.signOut()}>
              Sign out
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="sync-info">Sign in to back up your library and sync it across devices.</div>
          <div className="sync-form">
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
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {sync.error && <div className="sync-error">{sync.error}</div>}
          <div className="sync-actions">
            <button
              className="sync-btn primary pressable"
              disabled={sync.status === 'busy' || !email || !password}
              onClick={() => sync.signIn(email, password)}
            >
              {sync.status === 'busy' ? 'Working…' : 'Sign in'}
            </button>
            <button
              className="sync-btn pressable"
              disabled={sync.status === 'busy' || !email || !password}
              onClick={() => sync.signUp(email, password)}
            >
              Create account
            </button>
          </div>
        </>
      )}
    </div>
  )
}
