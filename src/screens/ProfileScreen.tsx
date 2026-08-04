import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SettingsModal } from '../ui/SettingsModal'
import { ChevronRight, SettingsIcon, HeartIcon, ClapperboardIcon, TvIcon } from '../components/Icons'
import { useLibrary } from '../store/useLibrary'
import { useShowEntries, useMovieEntries } from '../logic/useLibraryData'
import { effectiveSeen } from '../logic/status'

const EP_MIN = 42
const MOVIE_MIN = 115

function fmt(min: number): string {
  if (min <= 0) return '0h'
  const days = Math.floor(min / 1440)
  const hours = Math.floor((min % 1440) / 60)
  if (days >= 30) return `${Math.floor(days / 30)}mo ${days % 30}d`
  if (days > 0) return `${days}d ${hours}h`
  return `${hours}h`
}

export function ProfileScreen() {
  const nav = useNavigate()
  const [settings, setSettings] = useState(false)
  const lib = useLibrary()
  const shows = useShowEntries()
  const movies = useMovieEntries()

  const name = lib.profile.username || 'you'
  const titlesTracked = shows.length + movies.length

  // ---- TV stats ----
  const showsFollowed = Object.keys(lib.watchlistShows).length
  const showsStarted = shows.filter((e) => e.cls !== 'notStarted').length
  const showsCompleted = shows.filter((e) => e.cls === 'finished').length
  const episodesWatched = shows.reduce((n, e) => n + effectiveSeen(e.item, lib.watchedEpisodes), 0)
  const tvMin = episodesWatched * EP_MIN
  const remainingEps = shows
    .filter((e) => e.following && !e.stopped && e.cls !== 'finished' && e.item.totalEpisodes)
    .reduce((n, e) => n + Math.max(0, (e.item.totalEpisodes ?? 0) - effectiveSeen(e.item, lib.watchedEpisodes)), 0)
  const remainingTvMin = remainingEps * EP_MIN

  // ---- Movie stats ----
  const moviesFollowed = Object.keys(lib.watchlistMovies).length
  const moviesWatched = Object.keys(lib.watchedMovies).length
  const unwatchedMovies = movies.filter((e) => lib.watchlistMovies[e.item.id] && e.status !== 'completed')
  const moviesRemaining = unwatchedMovies.length
  const movieMin = movies.filter((e) => lib.watchedMovies[e.item.id]).reduce((n, e) => n + (e.item.runtime || MOVIE_MIN), 0)
  const remainingMovieMin = unwatchedMovies.reduce((n, e) => n + (e.item.runtime || MOVIE_MIN), 0)

  const remainingTotal = remainingTvMin + remainingMovieMin

  return (
    <div className="scroll-area route-fade">
      {/* Header */}
      <div className="profile-head2">
        <div className="profile-avatar">{name[0].toUpperCase()}</div>
        <div className="profile-head-text">
          <div className="profile-name">{name}</div>
          <div className="profile-handle">{titlesTracked.toLocaleString()} titles tracked</div>
        </div>
        <button className="icon-round pressable" onClick={() => setSettings(true)} aria-label="Settings">
          <SettingsIcon size={22} />
        </button>
      </div>

      {/* 1. Complete Library */}
      <NavCard title="Complete Library" sub="Everything you've tracked" onClick={() => nav('/library')} />

      {/* 2. Remaining in Your Watchlist */}
      <div className="remaining-card">
        <div className="rc-label">Remaining in your watchlist</div>
        <div className="rc-value">{fmt(remainingTotal)}</div>
        <div className="rc-split">
          <span>
            {moviesRemaining} movies · {fmt(remainingMovieMin)}
          </span>
          <span>
            {remainingEps.toLocaleString()} episodes · {fmt(remainingTvMin)}
          </span>
        </div>
      </div>

      {/* 3. Favorites */}
      <NavCard
        title="Favorites"
        sub="Your favorite shows & movies"
        icon={
          <span className="fav-badge">
            <HeartIcon size={13} fill="#fff" strokeWidth={0} />
          </span>
        }
        onClick={() => nav('/favorites')}
      />

      {/* 4. TV Shows statistics — opens the complete TV library */}
      <button className="stats-card pressable" style={{ textAlign: 'left', width: 'calc(100% - 32px)', display: 'block' }} onClick={() => nav('/library/shows')}>
        <div className="stats-card-head">
          <TvIcon size={18} /> TV Shows
          <span style={{ marginLeft: 'auto', color: 'var(--text-dim)', display: 'inline-flex' }}>
            <ChevronRight size={20} />
          </span>
        </div>
        <div className="stats-rows">
          <Stat label="Shows followed" value={showsFollowed} />
          <Stat label="Shows started" value={showsStarted} />
          <Stat label="Shows completed" value={showsCompleted} />
          <Stat label="Episodes watched" value={episodesWatched.toLocaleString()} />
          <Stat label="Time watched" value={fmt(tvMin)} />
          <Stat label="Episodes remaining" value={remainingEps.toLocaleString()} />
          <Stat label="Time remaining" value={fmt(remainingTvMin)} />
        </div>
      </button>

      {/* 5. Movies statistics — opens the complete movie library */}
      <button className="stats-card pressable" style={{ textAlign: 'left', width: 'calc(100% - 32px)', display: 'block' }} onClick={() => nav('/library/movies')}>
        <div className="stats-card-head">
          <ClapperboardIcon size={18} /> Movies
          <span style={{ marginLeft: 'auto', color: 'var(--text-dim)', display: 'inline-flex' }}>
            <ChevronRight size={20} />
          </span>
        </div>
        <div className="stats-rows">
          <Stat label="Movies followed" value={moviesFollowed} />
          <Stat label="Movies watched" value={moviesWatched} />
          <Stat label="Movies remaining" value={moviesRemaining} />
          <Stat label="Time watched" value={fmt(movieMin)} />
          <Stat label="Time remaining" value={fmt(remainingMovieMin)} />
        </div>
      </button>

      <div style={{ height: 24 }} />
      {settings && <SettingsModal onClose={() => setSettings(false)} />}
    </div>
  )
}

function NavCard({ title, sub, icon, onClick }: { title: string; sub: string; icon?: React.ReactNode; onClick: () => void }) {
  return (
    <button className="nav-card pressable" onClick={onClick}>
      {icon}
      <div className="nav-card-text">
        <div className="nav-card-title">{title}</div>
        <div className="nav-card-sub">{sub}</div>
      </div>
      <ChevronRight size={22} />
    </button>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-row">
      <span className="stat-row-label">{label}</span>
      <span className="stat-row-value">{value}</span>
    </div>
  )
}
