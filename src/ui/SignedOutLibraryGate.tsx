import { useState } from 'react'
import { AuthScreen } from './AuthScreen'
import { downloadLocalBackup } from '../logic/backup'
import { useToast } from '../store/useToast'

/** Hide an account's device library when its session is no longer present. */
export function SignedOutLibraryGate() {
  const [showAuth, setShowAuth] = useState(false)
  const toast = useToast((s) => s.show)

  const backup = () => {
    try {
      downloadLocalBackup()
      toast('Backup downloaded')
    } catch {
      toast("Couldn't create the backup file")
    }
  }

  return (
    <main className="sync-gate" aria-labelledby="signed-out-gate-title">
      <div className="sync-gate-card">
        <div className="sync-gate-eyebrow">THE WATCHER · PRIVATE LIBRARY</div>
        <h1 id="signed-out-gate-title">Sign in to see this library</h1>
        <p>This device has a saved account library. It stays hidden while signed out.</p>
        <button className="sync-btn full primary pressable" onClick={() => setShowAuth(true)}>
          Sign in
        </button>
        <button className="sync-btn full pressable" onClick={backup}>
          Download device backup
        </button>
        <div className="sync-gate-note">Your saved device copy stays on this device. Sign in to verify its owner before viewing it.</div>
      </div>
      {showAuth && <AuthScreen onClose={() => setShowAuth(false)} />}
    </main>
  )
}
