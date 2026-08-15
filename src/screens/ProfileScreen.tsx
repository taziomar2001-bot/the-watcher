import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { SettingsModal } from '../ui/SettingsModal'
import { ChevronRight, SettingsIcon, HeartIcon, ClapperboardIcon, TvIcon, ListIcon, PlusIcon } from '../components/Icons'
import { useLibrary } from '../store/useLibrary'
import { useShowEntries, useMovieEntries } from '../logic/useLibraryData'
import { effectiveSeen } from '../logic/status'
import { formatDuration as hm } from '../utils/duration'

const EP_MIN = 42
const MOVIE_MIN = 115

export function ProfileScreen() {
  const nav = useNavigate()
  const [settings, setSettings] = useState(false)
  const [newList, setNewList] = useState(false)
  const [listName, setListName] = useState('')
  const [listRanked, setListRanked] = useState(false)
  const lib = useLibrary()
  const shows = useShowEntries()
  const movies = useMovieEntries()

  const name = lib.profile.displayName || lib.profile.username || 'you'

  const showsFollowed = Object.keys(lib.watchlistShows).length
  const showsCompleted = shows.filter((e) => e.cls === 'finished').length
  const episodesWatched = shows.reduce((n, e) => n + effectiveSeen(e.item, lib.watchedEpisodes), 0)
  const tvMin = episodesWatched * EP_MIN

  const moviesFollowed = Object.keys(lib.watchlistMovies).length
  const watchedMovieEntries = movies.filter((e) => lib.watchedMovies[e.item.id])
  const moviesWatched = watchedMovieEntries.length
  const movieMin = watchedMovieEntries.reduce((n, e) => n + (e.item.runtime || MOVIE_MIN), 0)

  const totalWatched = tvMin + movieMin

  const remainingEps = shows
    .filter((e) => e.following && !e.stopped && e.cls !== 'finished' && e.item.totalEpisodes)
    .reduce((n, e) => n + Math.max(0, (e.item.totalEpisodes ?? 0) - effectiveSeen(e.item, lib.watchedEpisodes)), 0)
  const unwatchedMovies = movies.filter((e) => lib.watchlistMovies[e.item.id] && e.status !== 'completed')
  const remainingTotal = remainingEps * EP_MIN + unwatchedMovies.reduce((n, e) => n + (e.item.runtime || MOVIE_MIN), 0)

  const createList = () => {
    const n = listName.trim()
    if (!n) return
    lib.addList({ name: n, visibility: 'private', kind: 'mixed', items: [], ranked: listRanked })
    setListName('')
    setListRanked(false)
    setNewList(false)
  }

  return (
    <div className="scroll-area route-fade">
      {/* Identity */}
      <div className="profile-head2">
        <div className="profile-avatar">
          {lib.profile.avatar ? <img src={lib.profile.avatar} alt="" /> : name[0].toUpperCase()}
        </div>
        <div className="profile-head-text">
          <div className="profile-name">{name}</div>
          <div className="profile-handle">{hm(totalWatched)} watched</div>
        </div>
        <button className="icon-round pressable" onClick={() => setSettings(true)} aria-label="Settings">
          <SettingsIcon size={20} />
        </button>
      </div>

      {/* ---- Media dashboard cards ---- */}
      <div className="dash-card remaining">
        <div className="dash-label">Remaining in your watchlist</div>
        <div className="dash-value">{hm(remainingTotal)}</div>
        <div className="dash-sub">
          {unwatchedMovies.length} movies · {remainingEps.toLocaleString()} episodes
        </div>
      </div>

      <button className="dash-card pressable" onClick={() => nav('/profile/tv')}>
        <div className="dash-card-head">
          <span className="dash-icon tv">
            <TvIcon size={18} />
          </span>
          TV Shows
          <ChevronRight size={20} className="dash-chevron" />
        </div>
        <div className="dash-metrics">
          <div className="dash-metric">
            <b>{showsFollowed.toLocaleString()}</b>
            <span>followed</span>
          </div>
          <div className="dash-metric">
            <b>{showsCompleted.toLocaleString()}</b>
            <span>watched</span>
          </div>
          <div className="dash-metric">
            <b>{hm(tvMin)}</b>
            <span>time watched</span>
          </div>
        </div>
      </button>

      <button className="dash-card pressable" onClick={() => nav('/profile/movies')}>
        <div className="dash-card-head">
          <span className="dash-icon movie">
            <ClapperboardIcon size={18} />
          </span>
          Movies
          <ChevronRight size={20} className="dash-chevron" />
        </div>
        <div className="dash-metrics">
          <div className="dash-metric">
            <b>{moviesFollowed.toLocaleString()}</b>
            <span>followed</span>
          </div>
          <div className="dash-metric">
            <b>{moviesWatched.toLocaleString()}</b>
            <span>watched</span>
          </div>
          <div className="dash-metric">
            <b>{hm(movieMin)}</b>
            <span>time watched</span>
          </div>
        </div>
      </button>

      {/* ---- Lists ---- */}
      <div className="section-header" style={{ marginTop: 18 }}>
        <div className="section-header-title">Lists</div>
        <button className="section-more pressable" onClick={() => setNewList(true)} aria-label="New list">
          <PlusIcon size={20} />
        </button>
      </div>

      <button className="list-row pressable" onClick={() => nav('/favorites')}>
        <span className="fav-badge">
          <HeartIcon size={14} fill="#fff" strokeWidth={0} />
        </span>
        <span className="list-row-text">
          <span className="list-row-name">Favorites</span>
          <span className="list-row-sub">
            {Object.keys(lib.favoriteShows).length + Object.keys(lib.favoriteMovies).length} titles
          </span>
        </span>
        <ChevronRight size={20} />
      </button>

      {lib.lists.map((l) => (
        <button key={l.id} className="list-row pressable" onClick={() => nav(`/list/${l.id}`)}>
          <span className="list-badge">
            <ListIcon size={16} />
          </span>
          <span className="list-row-text">
            <span className="list-row-name">{l.name}</span>
            <span className="list-row-sub">
              {l.items.length} {l.items.length === 1 ? 'title' : 'titles'}
              {l.ranked ? ' · Ranked' : ''}
            </span>
          </span>
          <ChevronRight size={20} />
        </button>
      ))}

      <div style={{ height: 28 }} />
      {settings && <SettingsModal onClose={() => setSettings(false)} />}

      {newList && createPortal(
        <div className="dialog-backdrop" onClick={() => { setNewList(false); setListRanked(false) }}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">New list</div>
            <div className="list-create-row">
              <input
                className="sync-input"
                autoFocus
                placeholder="List name"
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createList()}
              />
              <button className="sync-btn primary pressable" disabled={!listName.trim()} onClick={createList}>
                Create
              </button>
            </div>
            <button
              className={`ranked-toggle pressable ${listRanked ? 'on' : ''}`}
              onClick={() => setListRanked((v) => !v)}
              type="button"
            >
              <span className="ranked-toggle-text">
                <span className="ranked-toggle-title">Ranked list</span>
                <span className="ranked-toggle-sub">Number titles 1, 2, 3… and reorder them</span>
              </span>
              <span className={`switch ${listRanked ? 'on' : ''}`}>
                <span className="switch-knob" />
              </span>
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
