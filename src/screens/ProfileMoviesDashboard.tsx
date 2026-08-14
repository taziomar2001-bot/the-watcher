import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, GridIcon } from '../components/Icons'
import { useLibrary } from '../store/useLibrary'
import { useMovieEntries } from '../logic/useLibraryData'
import { useScrollMemory } from '../hooks/useScrollMemory'
import { fmtAvg } from '../logic/ratings'
import { GenreBars, StatGrid, Leaderboard } from '../ui/Dashboard'

export function ProfileMoviesDashboard() {
  const nav = useNavigate()
  const scrollRef = useScrollMemory<HTMLDivElement>('dash-movies')
  const lib = useLibrary()
  const movies = useMovieEntries()

  const followed = movies.filter((e) => lib.watchlistMovies[e.item.id])
  const watched = followed.filter((e) => lib.watchedMovies[e.item.id])
  const remaining = followed.length - watched.length

  const ratingVals = Object.values(lib.movieRatings)
  const ratedCount = ratingVals.length
  const avgRating = ratedCount ? ratingVals.reduce((a, b) => a + b, 0) / ratedCount : null

  // Genre distribution from watched movies (weighted so total = 100%).
  const genres = useMemo(() => {
    const weight: Record<string, number> = {}
    let total = 0
    for (const e of watched) {
      const gs = e.item.genres
      if (!gs?.length) continue
      const w = 1 / gs.length
      for (const g of gs) {
        weight[g] = (weight[g] ?? 0) + w
        total += w
      }
    }
    if (!total) return []
    return Object.entries(weight)
      .map(([name, w]) => ({ name, pct: Math.round((w / total) * 100) }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 6)
  }, [watched])

  const genresRepresented = new Set(watched.flatMap((e) => e.item.genres ?? [])).size

  // Leaderboard: rated movies, highest first, tie-break most recently rated.
  const leaderboard = useMemo(() => {
    return Object.keys(lib.movieRatings)
      .map((id) => ({
        id,
        title: lib.libraryMovies[id]?.title ?? 'Untitled',
        poster: lib.libraryMovies[id]?.poster,
        rating: lib.movieRatings[id],
        at: lib.ratingAt[id] ?? 0,
      }))
      .sort((a, b) => b.rating - a.rating || b.at - a.at || a.title.localeCompare(b.title))
      .slice(0, 12)
  }, [lib.movieRatings, lib.ratingAt, lib.libraryMovies])

  const highest = leaderboard[0]

  const stats = [
    { label: 'Followed', value: followed.length },
    { label: 'Watched', value: watched.length },
    { label: 'Remaining', value: remaining },
    { label: 'Rated', value: ratedCount },
    ...(avgRating != null ? [{ label: 'Avg movie rating', value: `${fmtAvg(avgRating)} ★` }] : []),
    ...(highest ? [{ label: 'Highest rated', value: `${highest.title} · ${highest.rating}★` }] : []),
    ...(genresRepresented ? [{ label: 'Genres represented', value: genresRepresented }] : []),
  ]

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

      <StatGrid stats={stats} />

      <GenreBars title="Your genres" genres={genres} accent="var(--green)" />

      <Leaderboard
        title="Your top-rated movies"
        items={leaderboard.map((x) => ({ id: x.id, title: x.title, poster: x.poster, label: `${x.rating} ★` }))}
        onOpen={(id) => nav(`/movie/${id}`)}
        emptyHint="Rate movies from their detail page to build your leaderboard."
      />

      <button className="cta-row pressable" onClick={() => nav('/library/movies')}>
        <GridIcon size={18} />
        <span>Complete Movie Library</span>
        <ChevronRight size={20} />
      </button>
      <div style={{ height: 24 }} />
    </div>
  )
}
