import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DetailHero, ActionBar, ActionBtn, DetailTabs, useDetailTab } from '../ui/Detail'
import { TitleComments, commentsLabel, useCommentCount } from '../ui/TitleComments'
import { Fact } from './ShowScreen'
import { formatDuration } from '../utils/duration'
import { ProgressDot } from '../ui/primitives'
import { StarRating } from '../ui/StarRating'
import { AddToListSheet, useListMembership } from '../ui/AddToList'
import { HeartIcon, PeopleIcon, PlusIcon, CheckIcon, ListIcon } from '../components/Icons'
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
  const [tab, setTab] = useDetailTab<'about' | 'comments'>(`movie:${id}`, 'about')
  const [listSheet, setListSheet] = useState(false)
  const membership = useListMembership(`movie:${id}`)
  const commentCount = useCommentCount(`movie:${id}`)

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

  const ref = `movie:${movie.id}`
  const status = days > 0 ? `Releases in ${days} day${days === 1 ? '' : 's'}` : watched ? 'Watched' : following ? 'On your watchlist' : null

  return (
    <div className="scroll-area route-fade">
      <DetailHero
        backdrop={movie.backdrop}
        poster={movie.poster}
        title={movie.title}
        onBack={() => nav(-1)}
        meta={[movie.year, movie.runtime ? formatDuration(movie.runtime) : null, movie.director].filter(Boolean).join(' · ')}
      >
        <div className="dh-scores">
          <PublicScore value={movie.communityRating} votes={movie.communityVotes} />
          {lib.movieRatings[movie.id] != null && <span className="dh-mine">{lib.movieRatings[movie.id]} ★ you</span>}
        </div>
        {status && (
          <div className="dh-status">
            <ProgressDot color={movieColor(watched, isUnreleased(movie.releaseDate))} /> {status}
          </div>
        )}
      </DetailHero>

      <ActionBar>
        <ActionBtn
          icon={following ? <CheckIcon size={22} /> : <PlusIcon size={22} />}
          label={following ? 'On watchlist' : 'Watchlist'}
          on={following}
          tone="gold"
          onClick={() => {
            lib.toggleWatchlistMovie(movie.id, toLibraryItem(movie))
            toast(following ? 'Removed from watchlist' : 'Added to watchlist')
          }}
        />
        <ActionBtn
          icon={<EyeIcon />}
          label={watched ? 'Watched' : 'Watch'}
          on={watched}
          tone="green"
          onClick={() => {
            lib.markMovieWatched(movie.id, !watched, toLibraryItem(movie))
            if (!watched) toast('Marked watched')
          }}
        />
        <ActionBtn icon={<HeartIcon size={22} fill={fav ? 'currentColor' : 'none'} />} label="Favorite" on={fav} tone="red" onClick={() => toggleFavorite('movie', movie.id, toLibraryItem(movie))} />
        <ActionBtn icon={<ListIcon size={22} />} label={membership ? `${membership} list${membership > 1 ? 's' : ''}` : 'Add to list'} on={membership > 0} onClick={() => setListSheet(true)} />
        <ActionBtn
          icon={<PeopleIcon size={22} />}
          label="Community"
          onClick={() => nav(`/communities?topic=movie:${movie.id}`, { state: { topic: { type: 'movie', id: movie.id, title: movie.title, poster: movie.poster } } })}
        />
      </ActionBar>

      <DetailTabs
        tabs={[
          { key: 'about', label: 'About' },
          { key: 'comments', label: commentsLabel(commentCount) },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'about' && (
        <div className="about">
          <RatingCard
            value={lib.movieRatings[movie.id]}
            onChange={(v) => lib.setMovieRating(movie.id, v)}
            publicValue={movie.communityRating}
            publicVotes={movie.communityVotes}
            hint="Tap a star to rate — rating is separate from watched"
          />
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
          <dl className="facts">
            {movie.director && <Fact k="Director" v={movie.director} />}
            {movie.cast && movie.cast.length > 0 && <Fact k="Starring" v={movie.cast.slice(0, 4).join(', ')} />}
            {movie.releaseDate && <Fact k="Release date" v={shortDate(movie.releaseDate)} />}
            {movie.runtime ? <Fact k="Runtime" v={formatDuration(movie.runtime)} /> : null}
            {movie.platforms.length > 0 && <Fact k="Where to watch" v={movie.platforms.join(', ')} />}
          </dl>
        </div>
      )}
      {tab === 'comments' && <TitleComments target={ref} what={movie.title} />}

      <div style={{ height: 20 }} />
      {listSheet && <AddToListSheet itemRef={ref} meta={{ t: movie.title, p: movie.poster, y: movie.year }} onClose={() => setListSheet(false)} />}
    </div>
  )
}

/** Your 1–5 stars next to everyone's score. */
export function RatingCard({
  value,
  onChange,
  publicValue,
  publicVotes,
  hint,
}: {
  value?: number
  onChange: (v: number) => void
  publicValue?: number
  publicVotes?: number
  hint: string
}) {
  return (
    <div className="rating-card">
      <div className="rating-split">
        <div>
          <div className="rating-card-label">
            Your rating
            {value != null && <span className="rating-card-value" style={{ marginLeft: 8 }}>{value} ★</span>}
          </div>
          <StarRating value={value} onChange={onChange} />
        </div>
        {publicValue ? (
          <div className="rating-public">
            <div className="rating-public-label">Everyone</div>
            <PublicScore value={publicValue} votes={publicVotes} compact />
          </div>
        ) : null}
      </div>
      <div className="rating-card-hint">{value != null ? 'Tap the same star again to remove your rating' : hint}</div>
    </div>
  )
}

function EyeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}
