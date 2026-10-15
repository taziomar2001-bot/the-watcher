import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, ChevronLeft, SettingsIcon, HeartIcon, PlusIcon } from '../components/Icons'
import { BOOKS_ON, GAMES_ON } from '../logic/content'
import { trackTotals, useTrackEntries } from '../logic/tracks'
import { KindIcon } from '../ui/kinds'
import type { ContentKind } from '../types'
import { NewListSheet } from '../ui/NewListSheet'
import { kindLabel, listCover, listSummary } from '../logic/lists'
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
  const bookT = trackTotals(useTrackEntries('book'))
  const gameT = trackTotals(useTrackEntries('game'))

  return (
    <div className="scroll-area route-fade profile-tab">
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
      {social?.bio && <p className="profile-bio2">{social.bio}</p>}

      <div className="page-pad pf">
        {/* Time watched: one number, split Movies / TV */}
        <div className="pf-hero">
          <div className="pf-label">Time watched</div>
          <div className="pf-big">{hm(totalWatched)}</div>
          <div className="pf-split" aria-hidden="true">
            <span className="mv" style={{ flexGrow: Math.max(1 - tvShare, 0.02) }} />
            <span className="tv" style={{ flexGrow: Math.max(tvShare, 0.02) }} />
          </div>
          <div className="pf-legend">
            <span><i className="mv" /> Movies {hm(movieMin)}</span>
            <span><i className="tv" /> TV {hm(tvMin)}</span>
          </div>
        </div>

        {/* Movies and TV, then what's left of them, then Books and Games */}
        <div className="pf-grid">
          <KindCard kind="movie" title="Movies" to="/profile/movies" num={moviesWatched} cap="watched"
            facts={[[moviesToWatch, 'to watch'], [moviesFollowed, 'followed']]} />
          <KindCard kind="show" title="TV Shows" to="/profile/tv" num={showsFollowed} cap="followed"
            facts={[[tvInProgress, 'in progress'], [showsFinished, 'finished']]} />
        </div>

        <button className="pf-left pressable" onClick={() => nav('/upcoming')} aria-label="What's left in your watchlist">
          <span className="pf-ring" style={{ ['--p' as string]: `${Math.round(through * 100)}` }}>
            <span>{Math.round(through * 100)}%</span>
          </span>
          <span className="pf-left-text">
            <span className="pf-left-title">{hm(remainingTotal)} left in your watchlist</span>
            <span className="pf-left-sub">
              {moviesToWatch.toLocaleString()} movie{moviesToWatch === 1 ? '' : 's'} · {remainingEps.toLocaleString()} episode{remainingEps === 1 ? '' : 's'} to go
            </span>
          </span>
        </button>

        {(BOOKS_ON || GAMES_ON) && (
          <div className="pf-grid">
            {BOOKS_ON && (
              <KindCard kind="book" title="Books" to="/profile/books" num={bookT.done} cap="finished"
                facts={[[bookT.active, 'reading'], [bookT.backlog, 'want to read']]} />
            )}
            {GAMES_ON && (
              <KindCard kind="game" title="Video Games" to="/profile/games" num={gameT.done} cap="finished"
                facts={[[gameT.active, 'playing'], [gameT.backlog, 'in backlog']]} />
            )}
          </div>
        )}

        {/* Stats and Lists */}
        <div className="pf-pair">
          <button className="pf-mini pressable" onClick={() => nav('/profile/stats')}>
            <span className="pf-mini-title">Stats <ChevronRight size={15} /></span>
            <span className="pf-mini-sub">Genres, decades, ratings</span>
          </button>
          <button className="pf-mini pressable" onClick={() => nav('/profile/lists')}>
            <span className="pf-mini-title">Lists <ChevronRight size={15} /></span>
            <span className="pf-mini-sub">
              {lib.lists.length} list{lib.lists.length === 1 ? '' : 's'} · Favorites
            </span>
          </button>
        </div>
      </div>
      <div style={{ height: 12 }} />
    </div>
  )
}

function KindCard({ kind, title, to, num, cap, facts }: { kind: ContentKind; title: string; to: string; num: number; cap: string; facts: [number, string][] }) {
  const nav = useNavigate()
  return (
    <button className={`pf-card k-${kind} pressable`} onClick={() => nav(to)}>
      <span className="pf-card-head">
        <KindIcon kind={kind} size={17} /> {title} <ChevronRight size={15} className="pf-chev" />
      </span>
      <span className="pf-num-row">
        <span className="pf-num">{num.toLocaleString()}</span>
        <span className="pf-cap">{cap}</span>
      </span>
      <span className="pf-facts">
        {facts.map(([n, label]) => (
          <span key={label}>
            <b>{n.toLocaleString()}</b> {label}
          </span>
        ))}
      </span>
    </button>
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
            <span className="list-row-sub">
              {compositionLabel(
                Object.keys(lib.favoriteMovies).length,
                Object.keys(lib.favoriteShows).length,
                Object.values(lib.books).filter((t) => t.favorite).length,
                Object.values(lib.games).filter((t) => t.favorite).length,
              )}
            </span>
          </span>
          <ChevronRight size={20} />
        </button>
        {lists.map((l) => (
          <button key={l.id} className="list-row pressable" onClick={() => nav(`/list/${l.id}`)}>
            <ListBadge cover={listCover(l, lib)} ranked={l.ranked} />
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
            <div className="empty-sub">Make a list of shows, seasons, episodes, movies, books or games — ranked or not.</div>
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
