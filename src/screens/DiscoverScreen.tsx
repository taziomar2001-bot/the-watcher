import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SmartImage } from '../components/ui'
import { Segmented, SearchField, SectionHeader } from '../ui/primitives'
import { PosterThumb } from '../ui/cards'
import { HeartIcon, TrophyIcon } from '../components/Icons'
import { useAsync } from '../hooks/useAsync'
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
import type { Media, Show, Movie } from '../types'

// Module-scoped so Discover's mode + query survive navigating to a detail page
// and back (scroll position is preserved separately by useScrollMemory).
const discoverMem = { kind: 'show' as 'show' | 'movie', q: '' }

export function DiscoverScreen() {
  const nav = useNavigate()
  const scrollRef = useScrollMemory<HTMLDivElement>('discover')
  const [kind, setKindState] = useState<'show' | 'movie'>(discoverMem.kind)
  const [q, setQState] = useState(discoverMem.q)
  const setKind = (k: 'show' | 'movie') => {
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

  const { data: showSections } = useAsync(() => discoverShows(), [])
  const { data: movieSections } = useAsync(() => discoverMovies(), [])
  const sections = kind === 'show' ? showSections : movieSections

  // Universal search — both movies AND shows, regardless of the toggle.
  const { data: results } = useAsync(() => searchCatalog(q), [q])
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
        <button className="icon-round pressable" onClick={() => nav('/leaderboard')} aria-label="Leaderboard">
          <TrophyIcon size={20} />
        </button>
      </div>

      {/* 1. Search bar (above the toggle) */}
      <div className="page-pad" style={{ paddingBottom: 10 }}>
        <SearchField value={q} onChange={setQ} placeholder="Search movies, TV shows & people" />
      </div>

      {/* 2. TV/Movies toggle — only relevant to the discovery sections, so it
          hides as soon as the user starts searching (results are universal). */}
      {!searching && (
        <div className="page-pad" style={{ paddingBottom: 8 }}>
          <Segmented
            options={[
              { key: 'show', label: 'TV Shows' },
              { key: 'movie', label: 'Movies' },
            ]}
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
          {(results ?? []).length > 0 && userResults.length > 0 && <SectionHeader title="Movies & TV" />}
          <div className="card-list" style={{ marginTop: 6 }}>
            {(results ?? []).length === 0 && userResults.length === 0 ? (
              <div className="empty">
                <div className="empty-title">No results</div>
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
        </>
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
