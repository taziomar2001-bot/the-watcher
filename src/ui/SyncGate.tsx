import { useState } from 'react'
import { downloadLocalBackup } from '../logic/backup'
import { useSync } from '../logic/sync'
import { useToast } from '../store/useToast'

export function SyncGate() {
  const sync = useSync()
  const toast = useToast((s) => s.show)
  const [working, setWorking] = useState(false)
  const busy = working || sync.status === 'busy'

  const run = async (action: () => Promise<void>) => {
    setWorking(true)
    try {
      await action()
    } finally {
      setWorking(false)
    }
  }

  const backup = () => {
    try {
      downloadLocalBackup()
      toast('Backup downloaded')
    } catch {
      toast("Couldn't create the backup file")
    }
  }

  return (
    <main className="sync-gate" aria-labelledby="sync-gate-title">
      <div className="sync-gate-card">
        <div className="sync-gate-eyebrow">THE WATCHER · LIBRARY CHECK</div>
        <h1 id="sync-gate-title">Check this device’s library</h1>
        <p>
          {sync.remoteNewer
            ? 'This device and your cloud account have different libraries. Choose which copy to keep.'
            : sync.error
              ? 'We could not verify which account owns this device’s library. It stays hidden until the cloud check succeeds.'
              : 'Checking which account owns this device’s library before showing it.'}
        </p>
        {sync.email && <div className="sync-gate-account">Signed in as {sync.email}</div>}
        {sync.error && <div className="sync-error" role="alert">{sync.error}</div>}
        <button className="sync-btn full pressable" disabled={busy} onClick={backup}>
          Download device backup
        </button>
        {sync.remoteNewer ? (
          <div className="sync-gate-actions">
            <button className="sync-btn full primary pressable" disabled={busy} onClick={() => void run(sync.restoreNow)}>
              Keep cloud copy
            </button>
            {sync.canKeepDeviceCopy && (
              <button className="sync-btn full pressable" disabled={busy} onClick={() => void run(sync.backupNow)}>
                Keep device copy
              </button>
            )}
          </div>
        ) : sync.error ? (
          <button className="sync-btn full primary pressable" disabled={busy} onClick={() => void run(sync.retrySync)}>
            Retry cloud check
          </button>
        ) : (
          <div className="sync-gate-progress" role="status">Checking cloud library…</div>
        )}
        {sync.remoteNewer && <div className="sync-gate-note">
          {sync.canKeepDeviceCopy
            ? 'Download a backup first if you may need both copies later.'
            : 'The device copy belongs to another account and cannot be added to this one.'}
        </div>}
      </div>
    </main>
  )
}
