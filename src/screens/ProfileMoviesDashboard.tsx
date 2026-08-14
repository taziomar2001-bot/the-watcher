import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, GridIcon } from '../components/Icons'
import { useLibrary } from '../store/useLibrary'
import { useMovieEntries } from '../logic/useLibraryData'
import { useScrollMemory } from '../hooks/useScrollMemory'
import { fmtAvg } from '../logic/ratings'
import { StatGrid } from '../ui/Dashboard'

const MOVIE_MIN = 115
const hm = (min: number) => {
  const h = Math.floor(min / 60)
  return h > 0 ? `${h}h ${min % 60}m` : `${min}m`
}

export function ProfileMoviesDashboard() {
  const nav = useNavigate()
  const scrollRef = useScrollMemory<HTMLDivElement>('dash-movies')
  const lib = useLibrary()
  const movies = useMovieEntries()

  const followed = movies.filter((e) => lib.watchlistMovies[e.item.id])
  const watched = followed.filter((e) => lib.watchedMovies[e.item.id])
  const movieMin = watched.reduce((n, e) => n + (e.item.runtime || MOVIE_MIN), 0)

  const ratingVals = Object.values(lib.movieRatings)
  const avgRating = ratingVals.length ? ratingVals.reduce((a, b) => a + b, 0) / ratingVals.length : null

  const stats = [
    { label: 'Followed', value: followed.length },
    { label: 'Watched', value: watched.length },
    { label: 'Remaining', value: followed.length - watched.length },
    { label: 'Time watched', value: hm(movieMin) },
    { label: 'Rated', value: ratingVals.length },
    ...(avgRating != null ? [{ label: 'Avg movie rating', value: `${fmtAvg(avgRating)} ★` }] : []),
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

      <button className="cta-row pressable" onClick={() => nav('/library/movies')}>
        <GridIcon size={18} />
        <span>Complete Movie Library</span>
        <ChevronRight size={20} />
      </button>
      <div style={{ height: 24 }} />
    </div>
  )
}
