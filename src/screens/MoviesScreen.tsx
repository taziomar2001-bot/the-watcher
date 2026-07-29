import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MovieCard } from '../ui/cards'
import { SortMenu } from '../ui/primitives'
import { useLibrary } from '../store/useLibrary'
import { useMovieEntries } from '../logic/useLibraryData'
import { MOVIE_SORTS, movieColor, type MovieSort } from '../logic/status'

export function MoviesScreen() {
  const nav = useNavigate()
  const [sort, setSort] = useState<MovieSort>('lastFollowed')
  const watchlist = useLibrary((s) => s.watchlistMovies)
  const entries = useMovieEntries()

  // Followed but not yet watched (single continuous list).
  const list = useMemo(() => entries.filter((e) => watchlist[e.item.id] && e.status !== 'completed'), [entries, watchlist])

  const sorted = useMemo(() => {
    const arr = [...list]
    switch (sort) {
      case 'alpha':
        arr.sort((a, b) => a.item.title.localeCompare(b.item.title))
        break
      case 'lastFollowed':
        arr.sort((a, b) => (b.followedAt ?? 0) - (a.followedAt ?? 0))
        break
      case 'release':
        arr.sort((a, b) => (b.item.releaseDate ?? String(b.item.year ?? '')).localeCompare(a.item.releaseDate ?? String(a.item.year ?? '')))
        break
    }
    return arr
  }, [list, sort])

  return (
    <div className="scroll-area route-fade">
      <div className="app-header">
        <div>
          <h1>Movies</h1>
          <div className="sub">Followed, not yet watched</div>
        </div>
      </div>

      <div className="toolbar">
        <span className="toolbar-title">{sorted.length} {sorted.length === 1 ? 'movie' : 'movies'}</span>
        <SortMenu options={MOVIE_SORTS} value={sort} onChange={setSort} />
      </div>

      {sorted.length === 0 ? (
        <div className="empty">
          <div className="empty-title">No movies to watch</div>
          <div className="empty-sub">Follow movies from Discover to build your list</div>
        </div>
      ) : (
        <div className="card-list">
          {sorted.map((e) => (
            <MovieCard
              key={e.item.id}
              poster={e.item.poster}
              title={e.item.title}
              year={e.item.year}
              runtime={e.item.runtime}
              color={movieColor(e.status === 'completed')}
              onClick={() => nav(`/movie/${e.item.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
