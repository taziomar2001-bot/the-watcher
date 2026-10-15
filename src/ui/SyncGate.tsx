import { Wordmark } from './Wordmark'
import { useSync } from '../logic/sync'

/**
 * Only shown when this device holds a library that isn't (yet) known to be the
 * signed-in account's: a brief loading screen while the account's library
 * arrives, or a retry if the account can't be reached. Never asks the user to
 * choose between copies — the account's cloud library always wins.
 */
export function SyncGate() {
  const error = useSync((s) => s.error)
  const retry = useSync((s) => s.retrySync)
  return (
    <main className="sync-gate" aria-busy={!error}>
      <div className="sync-gate-card" style={{ textAlign: 'center' }}>
        <Wordmark size={40} />
        {error ? (
          <>
            <div className="sync-gate-progress" role="status">
              Can’t reach your account right now.
            </div>
            <button className="sync-btn primary pressable" style={{ marginTop: 16 }} onClick={() => void retry()}>
              Try again
            </button>
          </>
        ) : (
          <div className="sync-gate-progress" role="status">
            Loading your library…
          </div>
        )}
      </div>
    </main>
  )
}
