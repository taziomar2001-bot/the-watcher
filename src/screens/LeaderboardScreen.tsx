import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, FilterIcon, CheckIcon, TrophyIcon } from '../components/Icons'
import { MOCK_USERS } from '../data/users'
import { useLibrary } from '../store/useLibrary'
import { useMyStats } from '../logic/stats'
import { formatDuration as hm } from '../utils/duration'

interface Row {
  id: string
  name: string
  handle: string
  accent: string
  isMe: boolean
  tvMin: number
  movieMin: number
  moviesWatched: number
  showsCompleted: number
  episodesWatched: number
}

type MetricKey = 'time' | 'movies' | 'shows' | 'episodes'
const METRICS: { key: MetricKey; label: string; value: (r: Row) => number; format: (n: number) => string }[] = [
  { key: 'time', label: 'Total time watched', value: (r) => r.tvMin + r.movieMin, format: hm },
  { key: 'movies', label: 'Movies watched', value: (r) => r.moviesWatched, format: (n) => n.toLocaleString() },
  { key: 'shows', label: 'TV shows watched', value: (r) => r.showsCompleted, format: (n) => n.toLocaleString() },
  { key: 'episodes', label: 'Episodes watched', value: (r) => r.episodesWatched, format: (n) => n.toLocaleString() },
]

export function LeaderboardScreen() {
  const nav = useNavigate()
  const me = useMyStats()
  const profile = useLibrary((s) => s.profile)
  const [metric, setMetric] = useState<MetricKey>('time')
  const [filterOpen, setFilterOpen] = useState(false)

  const rows = useMemo<Row[]>(() => {
    const others: Row[] = MOCK_USERS.map((u) => ({
      id: u.id,
      name: u.name,
      handle: u.handle,
      accent: u.accent,
      isMe: false,
      tvMin: u.stats.tvMin,
      movieMin: u.stats.movieMin,
      moviesWatched: u.stats.moviesWatched,
      showsCompleted: u.stats.showsCompleted,
      episodesWatched: u.stats.episodesWatched,
    }))
    const mine: Row = {
      id: 'me',
      name: profile.displayName || profile.username || 'You',
      handle: profile.username || 'you',
      accent: '#4aa8ff',
      isMe: true,
      tvMin: me.tvMin,
      movieMin: me.movieMin,
      moviesWatched: me.moviesWatched,
      showsCompleted: me.showsCompleted,
      episodesWatched: me.episodesWatched,
    }
    return [...others, mine]
  }, [me, profile])

  const active = METRICS.find((m) => m.key === metric)!
  const ranked = useMemo(() => [...rows].sort((a, b) => active.value(b) - active.value(a)), [rows, active])
  const myRank = ranked.findIndex((r) => r.isMe) + 1

  const open = (r: Row) => nav(r.isMe ? '/profile' : `/u/${r.id}`)

  return (
    <div className="scroll-area route-fade">
      <div className="app-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button className="pressable" onClick={() => nav(-1)} aria-label="Back" style={{ color: 'var(--text-dim)' }}>
            <ChevronLeft size={26} />
          </button>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 22 }}>Leaderboard</h1>
            <div className="sub">Ranked by {active.label.toLowerCase()}</div>
          </div>
        </div>
        <button className="icon-round pressable" onClick={() => setFilterOpen(true)} aria-label="Filter">
          <FilterIcon size={20} />
        </button>
      </div>

      {myRank > 0 && (
        <div className="page-pad" style={{ paddingBottom: 8 }}>
          <div className="lb-you-card">
            <TrophyIcon size={18} />
            <span>You’re ranked <b>#{myRank}</b> of {ranked.length} by {active.label.toLowerCase()}</span>
          </div>
        </div>
      )}

      <div className="lb-list">
        {ranked.map((r, i) => (
          <button key={r.id} className={`lb-row pressable ${r.isMe ? 'me' : ''}`} onClick={() => open(r)}>
            <span className={`lb-rank ${i < 3 ? 'top top-' + (i + 1) : ''}`}>{i + 1}</span>
            <span className="lb-avatar" style={{ background: r.accent }}>
              {r.name[0].toUpperCase()}
            </span>
            <span className="lb-id">
              <span className="lb-name">{r.name}{r.isMe ? ' (You)' : ''}</span>
              <span className="lb-handle">@{r.handle}</span>
            </span>
            <span className="lb-metric">{active.format(active.value(r))}</span>
          </button>
        ))}
      </div>
      <div style={{ height: 24 }} />

      {filterOpen &&
        createPortal(
          <div className="sheet-backdrop" onClick={() => setFilterOpen(false)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-handle" />
              <div className="sheet-title">Rank by</div>
              {METRICS.map((m) => (
                <button
                  key={m.key}
                  className={`sheet-row ${m.key === metric ? 'active' : ''}`}
                  onClick={() => {
                    setMetric(m.key)
                    setFilterOpen(false)
                  }}
                >
                  <span>{m.label}</span>
                  {m.key === metric && <CheckIcon size={18} />}
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
