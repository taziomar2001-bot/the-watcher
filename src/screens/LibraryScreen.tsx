import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShowCard, MovieCard } from '../ui/cards'
import { Segmented, SortMenu } from '../ui/primitives'
import { ChevronLeft } from '../components/Icons'
import { useShowEntries, useMovieEntries } from '../logic/useLibraryData'
import { useLibrary } from '../store/useLibrary'
import { LIBRARY_SORTS, showColor, movieColor, classToStatus, type LibrarySort, type Status } from '../logic/status'

type StatusFilter = 'all' | 'watched' | 'unwatched' | 'completed' | 'inProgress' | 'notStarted'
const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'watched', label: 'Watched' },
  { key: 'unwatched', label: 'Unwatched' },
  { key: 'completed', label: 'Completed' },
  { key: 'inProgress', label: 'In progress' },
  { key: 'notStarted', label: 'Not started' },
]

function statusMatches(f: StatusFilter, s: Status): boolean {
  switch (f) {
    case 'all':
      return true
    case 'watched':
    case 'completed':
      return s === 'completed'
    case 'unwatched':
      return s !== 'completed'
    case 'inProgress':
      return s === 'inProgress'
    case 'notStarted':
      return s === 'notStarted'
  }
}

export function LibraryScreen({ favoritesOnly = false }: { favoritesOnly?: boolean }) {
  const nav = useNavigate()
  const [kind, setKind] = useState<'show' | 'movie'>('show')
  const [sort, setSort] = useState<LibrarySort>(favoritesOnly ? 'alpha' : 'dateAdded')
  const [filter, setFilter] = useState<StatusFilter>('all')
  const shows = useShowEntries()
  const movies = useMovieEntries()
  const favoriteShows = useLibrary((s) => s.favoriteShows)
  const favoriteMovies = useLibrary((s) => s.favoriteMovies)
  const stoppedShows = useLibrary((s) => s.stoppedShows)
  const watchedMovies = useLibrary((s) => s.watchedMovies)

  const rows = useMemo(() => {
    const arr =
      kind === 'show'
        ? shows
            .filter((e) => (!favoritesOnly || favoriteShows[e.item.id]) && statusMatches(filter, classToStatus(e.cls)))
            .map((e) => ({
              id: e.item.id,
              title: e.item.title,
              poster: e.item.poster,
              year: e.item.year,
              seasons: e.item.seasonCount,
              runtime: undefined as number | undefined,
              release: e.item.releaseDate ?? String(e.item.year ?? ''),
              color: showColor(e.cls, !!stoppedShows[e.item.id]),
              addedAt: e.addedAt ?? 0,
              lastWatched: e.lastWatched ?? 0,
            }))
        : movies
            .filter((e) => (!favoritesOnly || favoriteMovies[e.item.id]) && statusMatches(filter, e.status))
            .map((e) => ({
              id: e.item.id,
              title: e.item.title,
              poster: e.item.poster,
              year: e.item.year,
              seasons: undefined as number | undefined,
              runtime: e.item.runtime,
              release: e.item.releaseDate ?? String(e.item.year ?? ''),
              color: movieColor(!!watchedMovies[e.item.id]),
              addedAt: e.addedAt ?? 0,
              lastWatched: e.lastWatched ?? 0,
            }))
    switch (sort) {
      case 'alpha':
        arr.sort((a, b) => a.title.localeCompare(b.title))
        break
      case 'dateAdded':
        arr.sort((a, b) => b.addedAt - a.addedAt)
        break
      case 'lastWatched':
        arr.sort((a, b) => b.lastWatched - a.lastWatched)
        break
      case 'release':
        arr.sort((a, b) => b.release.localeCompare(a.release))
        break
    }
    return arr
  }, [kind, shows, movies, sort, filter, favoritesOnly, favoriteShows, favoriteMovies, stoppedShows, watchedMovies])

  return (
    <div className="scroll-area route-fade">
      <div className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="pressable" onClick={() => nav(-1)} aria-label="Back" style={{ color: 'var(--text-dim)' }}>
            <ChevronLeft size={26} />
          </button>
          <h1 style={{ fontSize: 24 }}>{favoritesOnly ? 'Favorites' : 'Library'}</h1>
        </div>
      </div>

      <div className="page-pad" style={{ paddingBottom: 10 }}>
        <Segmented
          options={[
            { key: 'show', label: 'TV Shows' },
            { key: 'movie', label: 'Movies' },
          ]}
          value={kind}
          onChange={setKind}
        />
      </div>

      <div className="toolbar">
        <SortMenu options={FILTERS} value={filter} onChange={setFilter} title="Filter" />
        <SortMenu options={LIBRARY_SORTS} value={sort} onChange={setSort} />
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <div className="empty-title">Nothing here</div>
        </div>
      ) : (
        <div className="card-list">
          {rows.map((r) =>
            kind === 'show' ? (
              <ShowCard key={r.id} poster={r.poster} title={r.title} year={r.year} seasons={r.seasons} color={r.color} onClick={() => nav(`/show/${r.id}`)} />
            ) : (
              <MovieCard key={r.id} poster={r.poster} title={r.title} year={r.year} runtime={r.runtime} color={r.color} onClick={() => nav(`/movie/${r.id}`)} />
            ),
          )}
        </div>
      )}
      <div style={{ height: 20 }} />
    </div>
  )
}
