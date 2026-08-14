import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Segmented } from '../ui/primitives'
import { PosterGrid, type GridItem } from '../ui/PosterGrid'
import { useLibrary } from '../store/useLibrary'
import { useMovieEntries } from '../logic/useLibraryData'
import { useScrollMemory } from '../hooks/useScrollMemory'
import { movieColor } from '../logic/status'

const releaseKey = (r: { item: { releaseDate?: string; year?: number } }) => r.item.releaseDate ?? String(r.item.year ?? '')
const isUnreleased = (releaseDate?: string) => !!releaseDate && releaseDate > new Date().toISOString().slice(0, 10)

/**
 * Main Movies tab — the "to-watch" queue: followed movies not yet watched.
 * Sticky controls: include/hide unreleased, and sort by Release Date (default,
 * newest first) or Recently Added (most recently followed first).
 */
export function MoviesScreen() {
  const nav = useNavigate()
  const scrollRef = useScrollMemory<HTMLDivElement>('movies')
  const watchlist = useLibrary((s) => s.watchlistMovies)
  const addedAt = useLibrary((s) => s.addedAt)
  const followedAt = useLibrary((s) => s.followedAt)
  const entries = useMovieEntries()
  const [showUnreleased, setShowUnreleased] = useState(true)
  const [sort, setSort] = useState<'release' | 'added'>('release')

  const items = useMemo<GridItem[]>(() => {
    return entries
      .filter((e) => watchlist[e.item.id] && e.status !== 'completed')
      .filter((e) => (showUnreleased ? true : !isUnreleased(e.item.releaseDate)))
      .sort((a, b) => {
        if (sort === 'added') {
          const aa = addedAt[a.item.id] ?? followedAt[a.item.id] ?? 0
          const bb = addedAt[b.item.id] ?? followedAt[b.item.id] ?? 0
          return bb - aa || a.item.title.localeCompare(b.item.title)
        }
        return releaseKey(b).localeCompare(releaseKey(a)) || a.item.title.localeCompare(b.item.title)
      })
      .map((e) => ({ id: e.item.id, poster: e.item.poster, title: e.item.title, color: movieColor(false) }))
  }, [entries, watchlist, addedAt, followedAt, showUnreleased, sort])

  return (
    <div className="scroll-area route-fade" ref={scrollRef}>
      <div className="sticky-top">
        <div className="app-header">
          <div>
            <h1>Movies</h1>
            <div className="sub">{items.length} to watch</div>
          </div>
        </div>
        <div className="movies-controls">
          <button
            className={`toggle-pill pressable ${showUnreleased ? 'active' : ''}`}
            onClick={() => setShowUnreleased((v) => !v)}
          >
            {showUnreleased ? 'Unreleased: shown' : 'Unreleased: hidden'}
          </button>
          <Segmented
            options={[
              { key: 'release', label: 'Release Date' },
              { key: 'added', label: 'Recently Added' },
            ]}
            value={sort}
            onChange={setSort}
          />
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
