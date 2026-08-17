import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Segmented } from '../ui/primitives'
import { PosterGrid, type GridItem } from '../ui/PosterGrid'
import { ChevronLeft } from '../components/Icons'
import { useLibrary } from '../store/useLibrary'
import { useMovieEntries } from '../logic/useLibraryData'
import { useScrollMemory } from '../hooks/useScrollMemory'
import { movieColor, isUnreleased } from '../logic/status'

type Filter = 'all' | 'watched' | 'unwatched'

// Preserve the chosen filter when leaving to view a movie and returning.
let movieLibFilterMem: Filter = 'all'

/**
 * Profile → Movies: the COMPLETE followed-movie library (watched + unwatched).
 * A status filter (All / Watched / Not Watched) narrows the view without ever
 * changing follow or watched state. No view toggle here.
 */
export function ProfileMoviesLibraryScreen() {
  const nav = useNavigate()
  const scrollRef = useScrollMemory<HTMLDivElement>('lib-movies')
  const [filter, setFilterState] = useState<Filter>(movieLibFilterMem)
  const setFilter = (f: Filter) => {
    movieLibFilterMem = f
    setFilterState(f)
  }
  const watchlist = useLibrary((s) => s.watchlistMovies)
  const watchedMovies = useLibrary((s) => s.watchedMovies)
  const entries = useMovieEntries()

  const items = useMemo<GridItem[]>(() => {
    return entries
      .filter((e) => watchlist[e.item.id])
      .filter((e) => {
        const watched = !!watchedMovies[e.item.id]
        return filter === 'all' ? true : filter === 'watched' ? watched : !watched
      })
      .sort((a, b) => a.item.title.localeCompare(b.item.title))
      .map((e) => ({ id: e.item.id, poster: e.item.poster, title: e.item.title, color: movieColor(!!watchedMovies[e.item.id], isUnreleased(e.item.releaseDate)) }))
  }, [entries, watchlist, watchedMovies, filter])

  return (
    <div className="scroll-area route-fade" ref={scrollRef}>
      <div className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="pressable" onClick={() => nav(-1)} aria-label="Back" style={{ color: 'var(--text-dim)' }}>
            <ChevronLeft size={26} />
          </button>
          <h1 style={{ fontSize: 24 }}>Movies</h1>
        </div>
      </div>

      <div className="page-pad" style={{ paddingBottom: 10 }}>
        <Segmented
          options={[
            { key: 'all', label: 'All' },
            { key: 'watched', label: 'Watched' },
            { key: 'unwatched', label: 'Not Watched' },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </div>

      {items.length === 0 ? (
        <div className="empty">
          <div className="empty-title">Nothing here</div>
        </div>
      ) : (
        <PosterGrid items={items} onOpen={(id) => nav(`/movie/${id}`)} />
      )}
      <div style={{ height: 20 }} />
    </div>
  )
}
