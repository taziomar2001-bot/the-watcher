import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { PosterGrid, type GridItem } from '../ui/PosterGrid'
import { useLibrary } from '../store/useLibrary'
import { useMovieEntries } from '../logic/useLibraryData'
import { useScrollMemory } from '../hooks/useScrollMemory'
import { movieColor } from '../logic/status'

const releaseKey = (r: { item: { releaseDate?: string; year?: number } }) => r.item.releaseDate ?? String(r.item.year ?? '')

/**
 * Main Movies tab — the "to-watch" queue: only followed movies not yet watched,
 * newest release first. Watched movies stay tracked and live in Profile → Movies.
 */
export function MoviesScreen() {
  const nav = useNavigate()
  const scrollRef = useScrollMemory<HTMLDivElement>('movies')
  const watchlist = useLibrary((s) => s.watchlistMovies)
  const entries = useMovieEntries()

  const items = useMemo<GridItem[]>(() => {
    return entries
      .filter((e) => watchlist[e.item.id] && e.status !== 'completed')
      .sort((a, b) => releaseKey(b).localeCompare(releaseKey(a)) || a.item.title.localeCompare(b.item.title))
      .map((e) => ({ id: e.item.id, poster: e.item.poster, title: e.item.title, color: movieColor(false) }))
  }, [entries, watchlist])

  return (
    <div className="scroll-area route-fade" ref={scrollRef}>
      <div className="app-header">
        <div>
          <h1>Movies</h1>
          <div className="sub">
            {items.length} to watch{items.length ? ' · newest first' : ''}
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="empty">
          <div className="empty-title">No movies to watch</div>
          <div className="empty-sub">Follow movies from Discover to build your list</div>
        </div>
      ) : (
        <PosterGrid items={items} onOpen={(id) => nav(`/movie/${id}`)} />
      )}
      <div style={{ height: 16 }} />
    </div>
  )
}
