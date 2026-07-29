import { useNavigate, useParams } from 'react-router-dom'
import { SmartImage } from '../components/ui'
import { ActionPill } from '../ui/cards'
import { ProgressDot } from '../ui/primitives'
import { ChevronLeft, HeartIcon } from '../components/Icons'
import { useAsync } from '../hooks/useAsync'
import { getMovie, daysUntil } from '../data/catalog'
import { useLibrary } from '../store/useLibrary'
import { toLibraryItem } from '../utils/media'
import { useToast } from '../store/useToast'
import { movieColor } from '../logic/status'
import { shortDate } from '../utils/dates'

export function MovieScreen() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { data: movie } = useAsync(() => getMovie(id), [id])
  const lib = useLibrary()
  const toast = useToast((s) => s.show)

  if (!movie)
    return (
      <div className="scroll-area">
        <span className="skeleton" style={{ height: 260, display: 'block' }} />
      </div>
    )

  const following = !!lib.watchlistMovies[movie.id]
  const watched = !!lib.watchedMovies[movie.id]
  const fav = !!lib.favoriteMovies[movie.id]
  const days = daysUntil(movie.releaseDate)

  return (
    <div className="scroll-area route-fade">
      <div className="detail-hero">
        <SmartImage src={movie.backdrop} alt={movie.title} />
        <div className="detail-hero-scrim" />
        <button className="icon-btn-float" style={{ left: 14 }} onClick={() => nav(-1)} aria-label="Back">
          <ChevronLeft size={22} />
        </button>
      </div>

      <div className="detail-headrow">
        <SmartImage src={movie.poster} alt={movie.title} className="detail-poster" />
        <div className="detail-headinfo">
          <h1 className="detail-title">{movie.title}</h1>
          <div className="detail-sub">
            {[movie.year, movie.runtime ? `${movie.runtime} min` : null, movie.director].filter(Boolean).join('  ·  ')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <ProgressDot color={movieColor(watched)} />
            <span style={{ fontSize: 13, color: 'var(--text-mute)' }}>
              {days > 0 ? `Releases in ${days} days` : watched ? 'Watched' : 'Not watched'}
            </span>
          </div>
        </div>
      </div>

      <div className="detail-actions">
        <ActionPill
          label={following ? 'Following' : 'Follow'}
          icon={following ? 'check' : 'plus'}
          active={following}
          onClick={() => {
            lib.toggleWatchlistMovie(movie.id, toLibraryItem(movie))
            toast(following ? 'Unfollowed' : 'Following')
          }}
        />
        <ActionPill
          label={watched ? 'Watched' : 'Mark watched'}
          icon="check"
          tone="green"
          active={watched}
          onClick={() => {
            lib.markMovieWatched(movie.id, !watched, toLibraryItem(movie))
            if (!watched) toast('Marked watched')
          }}
        />
        <button className={`action-pill pressable ${fav ? 'active' : ''}`} onClick={() => lib.toggleFavoriteMovie(movie.id, toLibraryItem(movie))}>
          <HeartIcon size={15} fill={fav ? '#ff5964' : 'none'} /> Favorite
        </button>
      </div>

      {movie.overview && <p className="detail-overview">{movie.overview}</p>}
      {movie.genres.length > 0 && (
        <div className="genre-row">
          {movie.genres.map((g) => (
            <span key={g} className="genre-chip">
              {g}
            </span>
          ))}
        </div>
      )}
      {movie.releaseDate && (
        <div className="detail-progress">
          <span style={{ color: 'var(--text-mute)', fontSize: 14 }}>Release date · {shortDate(movie.releaseDate)}</span>
        </div>
      )}
      <div style={{ height: 20 }} />
    </div>
  )
}
