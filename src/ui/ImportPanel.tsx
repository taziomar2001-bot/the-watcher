import { useLibrary } from '../store/useLibrary'
import { useImportStatus, runFullImport } from '../data/importTVTime'
import { USE_TMDB } from '../data/catalog'

export function ImportPanel() {
  if (!USE_TMDB) return null
  const status = useImportStatus()
  const shows = useLibrary((s) => Object.keys(s.libraryShows).length)
  const movies = useLibrary((s) => Object.keys(s.libraryMovies).length)

  const busy = status.running
  const showsPct = status.showsTotal ? Math.round((status.showsResolved / status.showsTotal) * 100) : 0
  const moviesPct = status.moviesTotal ? Math.round((status.moviesResolved / status.moviesTotal) * 100) : 0

  return (
    <div className="sync-card">
      <div className="sync-head">
        <span className="sync-title">TV Time Library</span>
        {!busy && <span className="sync-badge">{(shows + movies).toLocaleString()}</span>}
      </div>

      <div className="sync-info">
        {shows.toLocaleString()} shows · {movies.toLocaleString()} movies migrated and baked into your library.
      </div>

      {busy && (
        <div className="sync-info" style={{ marginTop: 4 }}>
          {status.phase === 'shows'
            ? `Resolving shows… ${status.showsResolved}/${status.showsTotal} (${showsPct}%)`
            : status.phase === 'movies'
              ? `Resolving movies… ${status.moviesResolved}/${status.moviesTotal} (${moviesPct}%)`
              : 'Working…'}
        </div>
      )}

      {!busy && (status.showsFailed > 0 || status.moviesFailed > 0) && (
        <div className="sync-info" style={{ marginTop: 4, opacity: 0.75 }}>
          {status.showsFailed + status.moviesFailed} title
          {status.showsFailed + status.moviesFailed === 1 ? '' : 's'} had no match on the database — tap re-sync to retry.
        </div>
      )}

      <div className="sync-actions">
        <button className="sync-btn primary pressable" disabled={busy} onClick={() => void runFullImport(true)}>
          {busy ? 'Syncing…' : 'Re-sync everything'}
        </button>
      </div>
    </div>
  )
}
