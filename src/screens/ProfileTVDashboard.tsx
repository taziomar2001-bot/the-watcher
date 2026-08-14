import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, GridIcon } from '../components/Icons'
import { useLibrary } from '../store/useLibrary'
import { useShowEntries } from '../logic/useLibraryData'
import { useScrollMemory } from '../hooks/useScrollMemory'
import { categorize, effectiveSeen } from '../logic/status'
import { fmtAvg } from '../logic/ratings'
import { StatGrid } from '../ui/Dashboard'

const EP_MIN = 42
const hm = (min: number) => {
  const h = Math.floor(min / 60)
  return h > 0 ? `${h}h ${min % 60}m` : `${min}m`
}

export function ProfileTVDashboard() {
  const nav = useNavigate()
  const scrollRef = useScrollMemory<HTMLDivElement>('dash-tv')
  const lib = useLibrary()
  const entries = useShowEntries()
  const cats = useMemo(() => categorize(entries, Date.now()), [entries])

  const followed = entries.filter((e) => e.following)
  const started = entries.filter((e) => e.cls !== 'notStarted').length
  const episodesWatched = entries.reduce((n, e) => n + effectiveSeen(e.item, lib.watchedEpisodes), 0)

  const epRatingVals = Object.values(lib.episodeRatings)
  const avgEpRating = epRatingVals.length ? epRatingVals.reduce((a, b) => a + b, 0) / epRatingVals.length : null

  const stats = [
    { label: 'Followed', value: followed.length },
    { label: 'Started', value: started },
    { label: 'Completed', value: cats.finished.length },
    { label: 'Currently watching', value: cats.currentlyWatching.length },
    { label: 'Up to date', value: cats.upToDate.length },
    { label: 'Stopped', value: cats.stopped.length },
    { label: 'Episodes watched', value: episodesWatched.toLocaleString() },
    { label: 'Time watched', value: hm(episodesWatched * EP_MIN) },
    { label: 'Rated episodes', value: epRatingVals.length },
    ...(avgEpRating != null ? [{ label: 'Avg episode rating', value: `${fmtAvg(avgEpRating)} ★` }] : []),
  ]

  return (
    <div className="scroll-area route-fade" ref={scrollRef}>
      <div className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="pressable" onClick={() => nav(-1)} aria-label="Back" style={{ color: 'var(--text-dim)' }}>
            <ChevronLeft size={26} />
          </button>
          <h1 style={{ fontSize: 24 }}>TV Shows</h1>
        </div>
      </div>

      <StatGrid stats={stats} />

      <button className="cta-row pressable" onClick={() => nav('/library/shows')}>
        <GridIcon size={18} />
        <span>Complete TV Show Library</span>
        <ChevronRight size={20} />
      </button>
      <div style={{ height: 24 }} />
    </div>
  )
}
