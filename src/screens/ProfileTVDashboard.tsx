import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, GridIcon } from '../components/Icons'
import { useLibrary } from '../store/useLibrary'
import { useShowEntries } from '../logic/useLibraryData'
import { useScrollMemory } from '../hooks/useScrollMemory'
import { categorize, effectiveSeen } from '../logic/status'
import { showAverageCached, fmtAvg } from '../logic/ratings'
import { GenreBars, StatGrid, Leaderboard } from '../ui/Dashboard'

export function ProfileTVDashboard() {
  const nav = useNavigate()
  const scrollRef = useScrollMemory<HTMLDivElement>('dash-tv')
  const lib = useLibrary()
  const entries = useShowEntries()
  const cats = useMemo(() => categorize(entries, Date.now()), [entries])

  const followed = entries.filter((e) => e.following)
  const started = entries.filter((e) => e.cls !== 'notStarted').length
  const completed = cats.finished.length
  const episodesWatched = entries.reduce((n, e) => n + effectiveSeen(e.item, lib.watchedEpisodes), 0)

  // Rated-episode stats.
  const epRatingVals = Object.values(lib.episodeRatings)
  const ratedEpisodes = epRatingVals.length
  const avgEpRating = ratedEpisodes ? epRatingVals.reduce((a, b) => a + b, 0) / ratedEpisodes : null

  // Genre distribution from followed shows with cached genres (weighted so total = 100%).
  const genres = useMemo(() => {
    const weight: Record<string, number> = {}
    let total = 0
    for (const e of followed) {
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
  }, [followed])

  // Leaderboard from personal show averages (offline via cached season sizes).
  const leaderboard = useMemo(() => {
    return followed
      .map((e) => ({ id: e.item.id, title: e.item.title, avg: showAverageCached(e.item.id, e.item.seasonSizes, lib.episodeRatings) }))
      .filter((x): x is { id: string; title: string; avg: number } => x.avg != null)
      .sort((a, b) => b.avg - a.avg || a.title.localeCompare(b.title))
      .slice(0, 10)
  }, [followed, lib.episodeRatings])

  const stats = [
    { label: 'Followed', value: followed.length },
    { label: 'Started', value: started },
    { label: 'Completed', value: completed },
    { label: 'Episodes watched', value: episodesWatched.toLocaleString() },
    { label: 'Currently watching', value: cats.currentlyWatching.length },
    { label: 'Up to date', value: cats.upToDate.length },
    { label: 'Stopped', value: cats.stopped.length },
    { label: 'Rated episodes', value: ratedEpisodes },
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

      <GenreBars title="Your genres" genres={genres} accent="var(--purple)" />

      <Leaderboard
        title="Your top-rated shows"
        items={leaderboard.map((x) => ({ id: x.id, title: x.title, label: `${fmtAvg(x.avg)} ★` }))}
        onOpen={(id) => nav(`/show/${id}`)}
        emptyHint="Rate more than half the episodes in more than half of a show's seasons to rank it here."
      />

      <button className="cta-row pressable" onClick={() => nav('/library/shows')}>
        <GridIcon size={18} />
        <span>View Complete Library</span>
        <ChevronRight size={20} />
      </button>
      <div style={{ height: 24 }} />
    </div>
  )
}
