import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { SmartImage } from '../components/ui'
import { ActionPill } from '../ui/cards'
import { ProgressDot } from '../ui/primitives'
import { StarRating } from '../ui/StarRating'
import { AddToListButton } from '../ui/AddToList'
import { ChevronLeft, ChevronRight, HeartIcon, PeopleIcon } from '../components/Icons'
import { useAsync } from '../hooks/useAsync'
import { getMovie, daysUntil } from '../data/catalog'
import { useLibrary } from '../store/useLibrary'
import { useToggleFavorite } from '../logic/favorites'
import { toLibraryItem } from '../utils/media'
import { useToast } from '../store/useToast'
import { movieColor, isUnreleased } from '../logic/status'
import { PublicScore } from '../ui/PublicScore'
import { ErrorState } from '../ui/ErrorState'
import { shortDate } from '../utils/dates'

export function MovieScreen() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { data: movie, error: loadError, reload } = useAsync(() => getMovie(id), [id])
  const lib = useLibrary()
  const toast = useToast((s) => s.show)
  const toggleFavorite = useToggleFavorite()

  // Cache genres so the Profile movie dashboard can build a genre breakdown.
  useEffect(() => {
    if (movie) lib.patchLibraryMovie(movie.id, toLibraryItem(movie))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movie?.id])

  if (!movie && loadError) return <ErrorState page onRetry={reload} />
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
          <div className="detail-scores">
            <PublicScore value={movie.communityRating} votes={movie.communityVotes} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <ProgressDot color={movieColor(watched, isUnreleased(movie.releaseDate))} />
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
        <button className={`action-pill pressable ${fav ? 'active' : ''}`} onClick={() => toggleFavorite('movie', movie.id, toLibraryItem(movie))}>
          <HeartIcon size={15} fill={fav ? '#ff5964' : 'none'} /> Favorite
        </button>
        <AddToListButton type="movie" id={movie.id} />
      </div>

      <button
        className="community-link pressable"
        onClick={() =>
          nav(`/communities?topic=movie:${movie.id}`, { state: { topic: { type: 'movie', id: movie.id, title: movie.title, poster: movie.poster } } })
        }
      >
        <PeopleIcon size={16} /> Communities about this film
        <ChevronRight size={18} />
      </button>

      {/* Personal rating (independent of watched status) */}
      <div className="rating-card">
        <div className="rating-split">
          <div>
            <div className="rating-card-label">
              Your rating
              {lib.movieRatings[movie.id] != null && <span className="rating-card-value" style={{ marginLeft: 8 }}>{lib.movieRatings[movie.id]} ★</span>}
            </div>
            <StarRating value={lib.movieRatings[movie.id]} onChange={(v) => lib.setMovieRating(movie.id, v)} />
          </div>
          {movie.communityRating ? (
            <div className="rating-public">
              <div className="rating-public-label">Everyone</div>
              <PublicScore value={movie.communityRating} votes={movie.communityVotes} compact />
            </div>
          ) : null}
        </div>
        <div className="rating-card-hint">
          {lib.movieRatings[movie.id] != null ? 'Tap the same star again to remove your rating' : 'Tap a star to rate — rating is separate from watched'}
        </div>
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
