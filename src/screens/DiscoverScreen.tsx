import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { SmartImage } from '../components/ui'
import { Segmented, SearchField, SectionHeader } from '../ui/primitives'
import { PosterThumb } from '../ui/cards'
import { HeartIcon, TrophyIcon } from '../components/Icons'
import { useAsync, useDebounced } from '../hooks/useAsync'
import { ErrorState } from '../ui/ErrorState'
import { useScrollMemory } from '../hooks/useScrollMemory'
import { discoverShows, discoverMovies, search as searchCatalog } from '../data/catalog'
import { searchProfiles, type SocialProfile } from '../data/social'
import { useSync } from '../logic/sync'
import { UserRow } from '../ui/social'
import { useLibrary } from '../store/useLibrary'
import { useToggleFavorite } from '../logic/favorites'
import { toLibraryItem } from '../utils/media'
import { useToast } from '../store/useToast'
import { classifyShow, showColor, movieColor, isUnreleased } from '../logic/status'
import type { Media, Show, Movie, ContentKind, TrackMedia, Book, Game } from '../types'
import { discoverBooks, searchBooks } from '../data/books'
import { discoverGames, searchGames } from '../data/games'
import { KINDS_ON } from '../logic/content'
import { KIND, KindIcon } from '../ui/kinds'
import { toTrackItem, trackColor, WORDS } from '../logic/tracks'
import { FAV_LIMIT } from '../logic/stats'
import type { TrackKind } from '../store/useLibrary'

// Module-scoped so Discover's mode + query survive navigating to a detail page
// and back (scroll position is preserved separately by useScrollMemory).
const discoverMem = { kind: 'show' as ContentKind, q: '' }

export function DiscoverScreen() {
  const nav = useNavigate()
  const location = useLocation()
  const scrollRef = useScrollMemory<HTMLDivElement>('discover')
  const asked = (location.state as { kind?: ContentKind } | null)?.kind
  if (asked && KINDS_ON.includes(asked) && discoverMem.kind !== asked) discoverMem.kind = asked
  const [kind, setKindState] = useState<ContentKind>(discoverMem.kind)
  const [q, setQState] = useState(discoverMem.q)
  const setKind = (k: ContentKind) => {
    discoverMem.kind = k
    setKindState(k)
  }
  const setQ = (v: string) => {
    discoverMem.q = v
    setQState(v)
  }
  const lib = useLibrary()
  const toast = useToast((s) => s.show)
  const toggleFavorite = useToggleFavorite()

  const shows = useAsync(() => discoverShows(), [])
  const moviesA = useAsync(() => discoverMovies(), [])
  // Books and games load only once their toggle is chosen.
  const [wantBooks, setWantBooks] = useState(kind === 'book')
  const [wantGames, setWantGames] = useState(kind === 'game')
  useEffect(() => {
    if (kind === 'book') setWantBooks(true)
    if (kind === 'game') setWantGames(true)
  }, [kind])
  const booksA = useAsync(() => (wantBooks ? discoverBooks() : Promise.resolve(undefined)), [wantBooks])
  const gamesA = useAsync(() => (wantGames ? discoverGames() : Promise.resolve(undefined)), [wantGames])
  const current = kind === 'show' ? shows : kind === 'movie' ? moviesA : kind === 'book' ? booksA : gamesA
  const sections = current.data as { key: string; title: string; items: (Media | TrackMedia)[] }[] | undefined
  const sectionsError = current.error
  const retrySections = current.reload

  // Universal search — every kind, regardless of the toggle.
  const dq = useDebounced(q, 300)
  const { data: results, error: searchError, reload: retrySearch } = useAsync(() => searchCatalog(dq), [dq])
  const bookResults = useAsync(() => (KINDS_ON.includes('book') && dq.trim() ? searchBooks(dq).catch(() => [] as Book[]) : Promise.resolve([] as Book[])), [dq])
  const gameResults = useAsync(() => (KINDS_ON.includes('game') && dq.trim() ? searchGames(dq).catch(() => [] as Game[]) : Promise.resolve([] as Game[])), [dq])
  const tracks = { book: lib.books, game: lib.games }
  const followingTrack = (m: TrackMedia) => !!tracks[m.type][m.id]?.followed
  const toggleFollowTrack = (m: TrackMedia) => {
    const was = followingTrack(m)
    lib.trackFollow(m.type, m.id, toTrackItem(m), !was)
    if (!was) toast(`Following ${m.title}`)
  }
  const isFavTrack = (m: TrackMedia) => !!tracks[m.type][m.id]?.favorite
  const toggleFavTrack = (m: TrackMedia) => {
    const on = !isFavTrack(m)
    if (on && Object.values(tracks[m.type]).filter((t) => t.favorite).length >= FAV_LIMIT)
      return toast(`You can have up to ${FAV_LIMIT} favorite ${WORDS[m.type as TrackKind].many} — remove one first.`, { duration: 4200 })
    lib.trackFavorite(m.type, m.id, toTrackItem(m), on)
  }
  // Real members only (Supabase profiles with a claimed @username), debounced.
  const signedIn = useSync((s) => s.status === 'signedIn')
  const me = useSync((s) => s.userId)
  const [userResults, setUserResults] = useState<SocialProfile[]>([])
  useEffect(() => {
    const term = q.trim()
    if (!term || !signedIn) {
      setUserResults([])
      return
    }
    let alive = true
    const t = setTimeout(() => {
      searchProfiles(term).then((r) => alive && setUserResults(r.filter((p) => p.id !== me)))
    }, 300)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [q, signedIn, me])
  const searching = q.trim().length > 0

  const following = (m: Media) => (m.type === 'show' ? !!lib.watchlistShows[m.id] : !!lib.watchlistMovies[m.id])
  const isFav = (m: Media) => (m.type === 'show' ? !!lib.favoriteShows[m.id] : !!lib.favoriteMovies[m.id])
  const toggleFollow = (m: Media) => {
    const was = following(m)
    if (m.type === 'show') lib.toggleWatchlistShow(m.id, toLibraryItem(m))
    else lib.toggleWatchlistMovie(m.id, toLibraryItem(m))
    if (!was) toast(`Following ${m.title}`)
  }
  const toggleFav = (m: Media) => toggleFavorite(m.type, m.id, toLibraryItem(m))

  return (
    <div className="scroll-area route-fade" ref={scrollRef}>
      <div className="app-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1>Discover</h1>
        <div className="header-icons">
          <button className="icon-round pressable" onClick={() => nav('/discover/random')} aria-label="Pick something for me">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true">
              <rect x="4" y="4" width="16" height="16" rx="3.5" />
              <circle cx="9" cy="9" r="1.2" fill="currentColor" stroke="none" />
              <circle cx="15" cy="15" r="1.2" fill="currentColor" stroke="none" />
              <circle cx="15" cy="9" r="1.2" fill="currentColor" stroke="none" />
              <circle cx="9" cy="15" r="1.2" fill="currentColor" stroke="none" />
            </svg>
          </button>
          <button className="icon-round pressable" onClick={() => nav('/discover/match')} aria-label="Watch together">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
              <circle cx="8.5" cy="8" r="3" />
              <circle cx="16" cy="9.5" r="2.5" />
              <path d="M3 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
              <path d="M14.5 14.3c.5-.2 1-.3 1.5-.3 2.3 0 4.2 1.6 4.7 4.5" />
            </svg>
          </button>
          <button className="icon-round pressable" onClick={() => nav('/leaderboard')} aria-label="Leaderboard">
            <TrophyIcon size={20} />
          </button>
        </div>
      </div>

      {/* 1. Search bar (above the toggle) */}
      <div className="page-pad" style={{ paddingBottom: 10 }}>
        <SearchField value={q} onChange={setQ} placeholder={KINDS_ON.length > 2 ? 'Search titles & people' : 'Search movies, TV shows & people'} />
      </div>

      {/* 2. TV/Movies toggle — only relevant to the discovery sections, so it
          hides as soon as the user starts searching (results are universal). */}
      {!searching && (
        <div className="page-pad" style={{ paddingBottom: 8 }}>
          <Segmented
            options={KINDS_ON.map((k) =>
              KINDS_ON.length > 2
                ? { key: k, label: <span className="seg-icon"><KindIcon kind={k} size={21} /></span>, aria: KIND[k].label }
                : { key: k, label: KIND[k].label },
            )}
            value={kind}
            onChange={setKind}
          />
        </div>
      )}

      {/* 3. Search results (universal) or discovery sections */}
      {searching ? (
        <>
          {userResults.length > 0 && (
            <>
              <SectionHeader title="People" />
              <div className="card-list" style={{ marginTop: 2, marginBottom: 6 }}>
                {userResults.map((u) => (
                  <UserRow key={u.id} profile={u} onOpen={() => nav(`/u/${u.id}`)} />
                ))}
              </div>
            </>
          )}
          {(results ?? []).length > 0 && (userResults.length > 0 || !!bookResults.data?.length || !!gameResults.data?.length) && <SectionHeader title="Movies & TV" />}
          <div className="card-list" style={{ marginTop: 6 }}>
            {searchError && userResults.length === 0 ? (
              <ErrorState title="Couldn’t search right now" onRetry={retrySearch} />
            ) : results === undefined || dq !== q ? (
              <div className="empty">
                <div className="empty-sub">Searching…</div>
              </div>
            ) : results.length === 0 && userResults.length === 0 && !(bookResults.data?.length || gameResults.data?.length) ? (
              <div className="empty">
                <div className="empty-title">No results</div>
                <div className="empty-sub">Try a different spelling or a shorter title.</div>
              </div>
            ) : (
              (results ?? []).map((m) => (
              <div key={`${m.type}_${m.id}`} className="search-row">
                <button className="search-row-main pressable" onClick={() => nav(`/${m.type}/${m.id}`)}>
                  <SmartImage src={m.poster} alt={m.title} className="result-poster" />
                  <div className="result-info">
                    <div className="result-title">{m.title}</div>
                    <div className="result-sub">
                      <span className={`type-badge ${m.type}`}>{m.type === 'show' ? 'TV' : 'FILM'}</span>
                      {m.type === 'movie' ? (m as Movie).year : (m as Show).firstAirYear}
                    </div>
                  </div>
                </button>
                <div className="search-row-actions">
                  <button className={`mini-pill ${following(m) ? 'active' : ''}`} onClick={() => toggleFollow(m)}>
                    {following(m) ? 'Following' : 'Follow'}
                  </button>
                  {m.type === 'movie' && (
                    <button
                      className={`mini-pill ${lib.watchedMovies[m.id] ? 'green' : ''}`}
                      onClick={() => lib.markMovieWatched(m.id, !lib.watchedMovies[m.id], toLibraryItem(m))}
                    >
                      {lib.watchedMovies[m.id] ? 'Watched' : 'Seen'}
                    </button>
                  )}
                  <button className={`mini-icon ${isFav(m) ? 'fav' : ''}`} onClick={() => toggleFav(m)} aria-label="Favorite">
                    <HeartIcon size={16} fill={isFav(m) ? '#ff5964' : 'none'} />
                  </button>
                </div>
              </div>
            ))
            )}
          </div>
          {(['book', 'game'] as const).map((tk) => {
            const list = (tk === 'book' ? bookResults.data : gameResults.data) as TrackMedia[] | undefined
            if (!list?.length || dq !== q) return null
            return (
              <div key={tk}>
                <SectionHeader title={KIND[tk].label} />
                <div className="card-list" style={{ marginTop: 2 }}>
                  {list.slice(0, 12).map((m) => (
                    <div key={`${m.type}_${m.id}`} className="search-row">
                      <button className="search-row-main pressable" onClick={() => nav(`/${m.type}/${m.id}`)}>
                        <SmartImage src={m.poster} alt={m.title} className="result-poster" />
                        <div className="result-info">
                          <div className="result-title">{m.title}</div>
                          <div className="result-sub">
                            <span className={`type-badge ${m.type}`}>{KIND[m.type].badge}</span>
                            {[m.year, m.type === 'book' ? (m as Book).authors[0] : (m as Game).platforms.slice(0, 2).join(', ')].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                      </button>
                      <div className="search-row-actions">
                        <button className={`mini-pill ${followingTrack(m) ? 'active' : ''}`} onClick={() => toggleFollowTrack(m)}>
                          {followingTrack(m) ? 'Following' : 'Follow'}
                        </button>
                        <button className={`mini-icon ${isFavTrack(m) ? 'fav' : ''}`} onClick={() => toggleFavTrack(m)} aria-label="Favorite">
                          <HeartIcon size={16} fill={isFavTrack(m) ? '#ff5964' : 'none'} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </>
      ) : !sections && sectionsError ? (
        <ErrorState onRetry={retrySections} />
      ) : !sections ? (
        [0, 1, 2].map((i) => (
          <div key={i}>
            <div className="section-header">
              <div className="section-header-title">
                <span className="skeleton" style={{ width: 120, height: 20, borderRadius: 6 }} />
              </div>
            </div>
            <div className="hscroll">
              {[0, 1, 2, 3].map((j) => (
                <span key={j} className="skeleton" style={{ width: 116, height: 174, borderRadius: 10 }} />
              ))}
            </div>
          </div>
        ))
      ) : (
        <>
          {sections.map((sec) => (
            <div key={sec.key}>
              <SectionHeader title={sec.title} />
              <div className="hscroll">
                {sec.items.slice(0, 16).map((m) => {
                  if (m.type === 'book' || m.type === 'game') {
                    const tm = m as TrackMedia
                    return (
                      <PosterThumb
                        key={tm.id}
                        poster={tm.poster}
                        title={tm.title}
                        color={trackColor(tracks[tm.type][tm.id])}
                        following={followingTrack(tm)}
                        onAdd={() => toggleFollowTrack(tm)}
                        onClick={() => nav(`/${tm.type}/${tm.id}`)}
                      />
                    )
                  }
                  const media = m as Media
                  const isFollow = following(media)
                  const color =
                    kind === 'show'
                      ? isFollow || lib.libraryShows[media.id]
                        ? showColor(classifyShow(lib.libraryShows[media.id] ?? { id: media.id, type: 'show', title: media.title }, lib.watchedEpisodes), !!lib.stoppedShows[media.id])
                        : undefined
                      : isFollow || lib.watchedMovies[media.id]
                        ? movieColor(!!lib.watchedMovies[media.id], isUnreleased((media as Movie).releaseDate))
                        : undefined
                  return (
                    <PosterThumb
                      key={media.id}
                      poster={media.poster}
                      title={media.title}
                      color={color}
                      following={isFollow}
                      onAdd={() => toggleFollow(media)}
                      onClick={() => nav(`/${media.type}/${media.id}`)}
                    />
                  )
                })}
              </div>
            </div>
          ))}
          <div style={{ height: 16 }} />
        </>
      )}
    </div>
  )
}
