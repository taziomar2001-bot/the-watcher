import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, ChevronLeft, SettingsIcon, HeartIcon, ClapperboardIcon, TvIcon, PlusIcon, ListIcon } from '../components/Icons'
import { NewListSheet } from '../ui/NewListSheet'
import { kindLabel, listSummary } from '../logic/lists'
import { useLibrary } from '../store/useLibrary'
import { useSync } from '../logic/sync'
import { useMe, useMyProfile } from '../store/useMe'
import { useShowEntries, useMovieEntries } from '../logic/useLibraryData'
import { effectiveSeen } from '../logic/status'
import { compositionLabel } from '../logic/stats'
import { ListBadge } from '../ui/ListBadge'
import { formatDuration as hm } from '../utils/duration'

const EP_MIN = 42
const MOVIE_MIN = 115

export function ProfileScreen() {
  const nav = useNavigate()
  const signedIn = useSync((s) => s.status === 'signedIn')
  const me = useSync((s) => s.userId)
  const social = useMyProfile(signedIn ? me : undefined)
  const requests = useMe((s) => s.requests)
  // Refresh in the background (cached copy shows instantly); adopt the
  // account's display name on a device that doesn't have one yet.
  useEffect(() => {
    if (signedIn) void useMe.getState().refresh()
  }, [signedIn])
  useEffect(() => {
    if (social?.display_name && !useLibrary.getState().profile.displayName)
      useLibrary.getState().updateProfile({ displayName: social.display_name })
  }, [social?.display_name])
  const lib = useLibrary()
  const shows = useShowEntries()
  const movies = useMovieEntries()

  const name = lib.profile.displayName || lib.profile.username || 'you'

  const showsFollowed = Object.keys(lib.watchlistShows).length
  // Watched = at least one episode watched; Finished = fully completed.
  const showsWatched = shows.filter((e) => effectiveSeen(e.item, lib.watchedEpisodes) >= 1).length
  const showsFinished = shows.filter((e) => e.cls === 'finished').length
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

  const tvInProgress = shows.filter((e) => !e.stopped && e.cls === 'incomplete').length
  const moviesToWatch = unwatchedMovies.length
  const tvShare = totalWatched > 0 ? tvMin / totalWatched : 0.5
  // How far through everything you follow you are, by time.
  const through = totalWatched + remainingTotal > 0 ? totalWatched / (totalWatched + remainingTotal) : 0
  const covers = lib.lists.map((l) => l.cover).filter(Boolean).slice(0, 3) as string[]

  return (
    <div className="scroll-area route-fade">
      {/* Identity */}
      <div className="profile-head2">
        <div className="profile-avatar">
          {lib.profile.avatar ? <img src={lib.profile.avatar} alt="" /> : name[0].toUpperCase()}
        </div>
        <div className="profile-head-text">
          <div className="profile-name">{name}</div>
          {social?.username && <div className="profile-at">@{social.username}</div>}
          {social && (
            <div className="profile-social-row">
              <button className="profile-social-stat pressable" onClick={() => nav('/people/me/followers')}>
                <b>{social.follower_count}</b> followers
              </button>
              <button className="profile-social-stat pressable" onClick={() => nav('/people/me/following')}>
                <b>{social.following_count}</b> following
              </button>
              {requests > 0 && (
                <button className="request-chip pressable" onClick={() => nav('/people/me/requests')}>
                  {requests} request{requests === 1 ? '' : 's'}
                </button>
              )}
            </div>
          )}
        </div>
        <button className="icon-round pressable" onClick={() => nav('/settings')} aria-label="Settings">
          <SettingsIcon size={20} />
        </button>
      </div>

      <div className="page-pad pf">
        {/* Time watched: one number, split TV / movies */}
        <div className="pf-hero">
          <div className="pf-label">Time watched</div>
          <div className="pf-big">{hm(totalWatched)}</div>
          <div className="pf-split" aria-hidden="true">
            <span className="tv" style={{ flexGrow: Math.max(tvShare, 0.02) }} />
            <span className="mv" style={{ flexGrow: Math.max(1 - tvShare, 0.02) }} />
          </div>
          <div className="pf-legend">
            <span><i className="tv" /> TV {hm(tvMin)}</span>
            <span><i className="mv" /> Movies {hm(movieMin)}</span>
          </div>
        </div>

        {/* TV and Movies side by side */}
        <div className="pf-pair">
          <button className="pf-card pressable" onClick={() => nav('/profile/tv')}>
            <span className="pf-card-head">
              <TvIcon size={18} /> TV Shows <ChevronRight size={16} className="pf-chev" />
            </span>
            <span className="pf-num">{showsFollowed.toLocaleString()}</span>
            <span className="pf-cap">followed</span>
            <span className="pf-facts">
              <span><b>{tvInProgress.toLocaleString()}</b> in progress</span>
              <span><b>{showsFinished.toLocaleString()}</b> finished</span>
              <span><b>{episodesWatched.toLocaleString()}</b> episodes</span>
            </span>
          </button>
          <button className="pf-card pressable" onClick={() => nav('/profile/movies')}>
            <span className="pf-card-head">
              <ClapperboardIcon size={18} /> Movies <ChevronRight size={16} className="pf-chev" />
            </span>
            <span className="pf-num">{moviesWatched.toLocaleString()}</span>
            <span className="pf-cap">watched</span>
            <span className="pf-facts">
              <span><b>{moviesToWatch.toLocaleString()}</b> to watch</span>
              <span><b>{moviesFollowed.toLocaleString()}</b> followed</span>
              <span><b>{showsWatched.toLocaleString()}</b> shows started</span>
            </span>
          </button>
        </div>

        {/* What's left of what you follow */}
        <button className="pf-left pressable" onClick={() => nav('/upcoming')} aria-label="What's left in your watchlist">
          <span className="pf-ring" style={{ ['--p' as string]: `${Math.round(through * 100)}` }}>
            <span>{Math.round(through * 100)}%</span>
          </span>
          <span className="pf-left-text">
            <span className="pf-left-title">{hm(remainingTotal)} left in your watchlist</span>
            <span className="pf-left-sub">
              {remainingEps.toLocaleString()} episode{remainingEps === 1 ? '' : 's'} · {moviesToWatch.toLocaleString()} movie{moviesToWatch === 1 ? '' : 's'} to go
            </span>
          </span>
        </button>

        {/* Stats and Lists */}
        <div className="pf-pair">
          <button className="pf-card short pressable" onClick={() => nav('/profile/stats')}>
            <span className="pf-tile-icon stats" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 20V11M12 20V4M19 20v-6" /></svg>
            </span>
            <span className="pf-tile-title">Stats</span>
            <span className="pf-tile-sub">Genres, decades, ratings</span>
          </button>
          <button className="pf-card short pressable" onClick={() => nav('/profile/lists')}>
            {covers.length > 0 ? (
              <span className="pf-covers" aria-hidden="true">
                {covers.map((c, i) => (
                  <img key={i} src={c} alt="" style={{ zIndex: 3 - i }} />
                ))}
              </span>
            ) : (
              <span className="pf-tile-icon lists" aria-hidden="true">
                <ListIcon size={20} />
              </span>
            )}
            <span className="pf-tile-title">Lists</span>
            <span className="pf-tile-sub">
              {lib.lists.length} list{lib.lists.length === 1 ? '' : 's'} · Favorites
            </span>
          </button>
        </div>
      </div>
      <div style={{ height: 20 }} />
    </div>
  )
}

/** Favorites and every list, with create. */
export function ProfileListsScreen() {
  const nav = useNavigate()
  const lib = useLibrary()
  const [creating, setCreating] = useState(false)
  const lists = [...lib.lists].sort((a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0))
  return (
    <div className="scroll-area route-fade">
      <div className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button className="pressable" onClick={() => nav(-1)} aria-label="Back">
            <ChevronLeft size={26} />
          </button>
          <div>
            <h1>Lists</h1>
            <div className="sub">{lib.lists.length} list{lib.lists.length === 1 ? '' : 's'}</div>
          </div>
        </div>
        <button className="icon-round pressable" onClick={() => setCreating(true)} aria-label="New list">
          <PlusIcon size={20} />
        </button>
      </div>
      <div className="page-pad">
        <button className="list-row pressable" onClick={() => nav('/favorites')}>
          <span className="fav-badge">
            <HeartIcon size={14} fill="#fff" strokeWidth={0} />
          </span>
          <span className="list-row-text">
            <span className="list-row-name">Favorites</span>
            <span className="list-row-sub">{compositionLabel(Object.keys(lib.favoriteMovies).length, Object.keys(lib.favoriteShows).length)}</span>
          </span>
          <ChevronRight size={20} />
        </button>
        {lists.map((l) => (
          <button key={l.id} className="list-row pressable" onClick={() => nav(`/list/${l.id}`)}>
            <ListBadge cover={l.cover} ranked={l.ranked} />
            <span className="list-row-text">
              <span className="list-row-name">{l.name}</span>
              <span className="list-row-sub">
                {l.items.length ? listSummary(l) : `${kindLabel(l.kind)} · empty`}
                {l.ranked ? ' · Ranked' : ''}
                {l.communities?.length ? ' · Shared' : ''}
                {l.visibility === 'private' ? ' · Only you' : ''}
              </span>
            </span>
            <ChevronRight size={20} />
          </button>
        ))}
        {lists.length === 0 && (
          <div className="empty compact">
            <div className="empty-sub">Make a list of shows, seasons, episodes or movies — ranked or not.</div>
            <button className="sync-btn primary pressable" style={{ marginTop: 12 }} onClick={() => setCreating(true)}>
              <PlusIcon size={15} /> New list
            </button>
          </div>
        )}
      </div>
      <div style={{ height: 24 }} />
      {creating && (
        <NewListSheet
          onClose={() => setCreating(false)}
          onCreate={(d) => {
            const id = lib.addList({ name: d.name, kind: d.kind, ranked: d.ranked, visibility: 'public', items: [] })
            setCreating(false)
            nav(`/list/${id}`)
          }}
        />
      )}
    </div>
  )
}
