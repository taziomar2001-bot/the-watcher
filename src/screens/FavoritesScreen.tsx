import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { SmartImage } from '../components/ui'
import { ProgressDot, Segmented, SearchField } from '../ui/primitives'
import { ChevronLeft, DotsIcon, TrashIcon, EditIcon, PlusIcon, CheckIcon } from '../components/Icons'
import { useLibrary } from '../store/useLibrary'
import { useToggleFavorite } from '../logic/favorites'
import { compositionLabel } from '../logic/stats'
import { useShowEntries, useMovieEntries } from '../logic/useLibraryData'
import { useScrollMemory } from '../hooks/useScrollMemory'
import { useAsync } from '../hooks/useAsync'
import { search as searchCatalog } from '../data/catalog'
import { toLibraryItem } from '../utils/media'
import { showColor, movieColor, isUnreleased } from '../logic/status'
import { searchBooks } from '../data/books'
import { searchGames } from '../data/games'
import { KINDS_ON } from '../logic/content'
import { KIND, KindIcon } from '../ui/kinds'
import { toTrackItem, trackColor, WORDS } from '../logic/tracks'
import { FAV_LIMIT } from '../logic/stats'
import { useToast } from '../store/useToast'
import type { ContentKind, Media, TrackMedia } from '../types'

// Remember the selected tab across navigating into a title and back.
let favKindMem: ContentKind = 'show'

/**
 * Favorites — the user's starred shows & movies as a 3-up poster grid (matching
 * the Shows/Movies tabs). A TV/Movies toggle switches lists; an edit mode lets
 * the user pull titles out, and an "Add titles" picker searches the catalog to
 * favorite new ones.
 */
export function FavoritesScreen() {
  const nav = useNavigate()
  const scrollRef = useScrollMemory<HTMLDivElement>('favorites')
  const lib = useLibrary()
  const shows = useShowEntries()
  const movies = useMovieEntries()
  const [kind, setKindState] = useState<ContentKind>(favKindMem)
  const setKind = (k: ContentKind) => {
    favKindMem = k
    setKindState(k)
  }
  const [menu, setMenu] = useState(false)
  const [edit, setEdit] = useState(false)
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState('')
  const { data: results } = useAsync(async (): Promise<(Media | TrackMedia)[]> => {
    if (!q.trim()) return []
    if (kind === 'book') return searchBooks(q)
    if (kind === 'game') return searchGames(q)
    return (await searchCatalog(q)).filter((m) => m.type === kind)
  }, [q, kind])
  const toggleFavorite = useToggleFavorite()
  const toast = useToast((s) => s.show)
  const favMovies = Object.keys(lib.favoriteMovies).length
  const favShows = Object.keys(lib.favoriteShows).length
  const favBooks = Object.values(lib.books).filter((t) => t.favorite).length
  const favGames = Object.values(lib.games).filter((t) => t.favorite).length
  const isFav = (m: Media | TrackMedia) =>
    m.type === 'show' ? !!lib.favoriteShows[m.id] : m.type === 'movie' ? !!lib.favoriteMovies[m.id] : !!(m.type === 'book' ? lib.books : lib.games)[m.id]?.favorite
  const toggleAny = (m: Media | TrackMedia) => {
    if (m.type === 'show' || m.type === 'movie') return void toggleFavorite(m.type, m.id, toLibraryItem(m as Media))
    const on = !isFav(m)
    if (on && (m.type === 'book' ? favBooks : favGames) >= FAV_LIMIT)
      return toast(`You can have up to ${FAV_LIMIT} favorite ${WORDS[m.type].many} — remove one first.`, { duration: 4200 })
    lib.trackFavorite(m.type, m.id, toTrackItem(m as TrackMedia), on)
  }

  const items = useMemo(() => {
    if (kind === 'book' || kind === 'game') {
      return Object.entries(kind === 'book' ? lib.books : lib.games)
        .filter(([, t]) => t.favorite)
        .map(([id, t]) => ({ id, type: kind, poster: t.item.poster, title: t.item.title, color: trackColor(t) ?? ('orange' as const) }))
        .sort((a, b) => a.title.localeCompare(b.title))
    }
    if (kind === 'show') {
      return shows
        .filter((e) => lib.favoriteShows[e.item.id])
        .map((e) => ({
          id: e.item.id,
          type: 'show' as const,
          poster: e.item.poster,
          title: e.item.title,
          color: showColor(e.cls, !!lib.stoppedShows[e.item.id]),
        }))
        .sort((a, b) => a.title.localeCompare(b.title))
    }
    return movies
      .filter((e) => lib.favoriteMovies[e.item.id])
      .map((e) => ({
        id: e.item.id,
        type: 'movie' as const,
        poster: e.item.poster,
        title: e.item.title,
        color: movieColor(!!lib.watchedMovies[e.item.id], isUnreleased(e.item.releaseDate)),
      }))
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [kind, shows, movies, lib.favoriteShows, lib.favoriteMovies, lib.stoppedShows, lib.watchedMovies, lib.books, lib.games])

  const removeFav = (type: ContentKind, id: string) => {
    if (type === 'show' || type === 'movie') return void toggleFavorite(type, id)
    const t = (type === 'book' ? lib.books : lib.games)[id]
    if (t) lib.trackFavorite(type, id, t.item, false)
  }

  return (
    <div className="scroll-area route-fade" ref={scrollRef}>
      <div className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button className="pressable" onClick={() => nav(-1)} aria-label="Back" style={{ color: 'var(--text-dim)' }}>
            <ChevronLeft size={26} />
          </button>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 24 }}>Favorites</h1>
            <div className="sub">{compositionLabel(favMovies, favShows, favBooks, favGames)}</div>
          </div>
        </div>
        <button className="icon-round pressable" onClick={() => setMenu(true)} aria-label="Favorites options">
          <DotsIcon size={20} />
        </button>
      </div>

      <div className="page-pad" style={{ paddingBottom: 10 }}>
        <Segmented
          options={KINDS_ON.map((k) =>
            KINDS_ON.length > 2 ? { key: k, label: <span className="seg-icon"><KindIcon kind={k} size={21} /></span>, aria: KIND[k].label } : { key: k, label: KIND[k].label },
          )}
          value={kind}
          onChange={(k) => {
            setKind(k)
            setEdit(false)
          }}
        />
      </div>

      {items.length === 0 ? (
        <div className="empty">
          <div className="empty-title">No favorites yet</div>
          <div className="empty-sub">Use the ••• menu to add {KIND[kind].label.toLowerCase()}</div>
        </div>
      ) : (
        <div className="poster-grid">
          {items.map((it) => (
            <div key={it.id} className="poster-thumb" style={{ width: 'auto' }}>
              <div
                className="poster-thumb-art"
                onClick={() => (edit ? removeFav(it.type, it.id) : nav(`/${it.type}/${it.id}`))}
              >
                <SmartImage src={it.poster} alt={it.title} />
                <span className="poster-thumb-dot">
                  <ProgressDot color={it.color} size={11} />
                </span>
                {edit && (
                  <span className="poster-remove">
                    <TrashIcon size={16} />
                  </span>
                )}
              </div>
              <div
                className="poster-thumb-title"
                onClick={() => (edit ? removeFav(it.type, it.id) : nav(`/${it.type}/${it.id}`))}
              >
                {it.title}
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ height: 24 }} />

      {menu && createPortal(
        <div className="sheet-backdrop" onClick={() => setMenu(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-title">Favorites</div>
            <button
              className="sheet-row"
              onClick={() => {
                setEdit((v) => !v)
                setMenu(false)
              }}
            >
              <span><EditIcon size={16} /> {edit ? 'Done editing' : 'Remove titles'}</span>
            </button>
            <button
              className="sheet-row"
              onClick={() => {
                setMenu(false)
                setAdding(true)
              }}
            >
              <span><PlusIcon size={16} /> Add titles</span>
            </button>
          </div>
        </div>,
        document.body,
      )}

      {adding && createPortal(
        <div className="picker-backdrop">
          <div className="picker">
            <div className="picker-head">
              <span className="picker-title">Add to favorites</span>
              <button className="settings-close pressable" onClick={() => setAdding(false)} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="picker-search">
              <SearchField value={q} onChange={setQ} placeholder={`Search ${KIND[kind].label.toLowerCase()}`} autoFocus />
            </div>
            <div className="picker-body">
              {!q.trim() ? (
                <div className="empty compact">
                  <div className="empty-sub">Search to favorite {KIND[kind].label.toLowerCase()}</div>
                </div>
              ) : (
                (results ?? []).map((m) => {
                  const fav = isFav(m)
                  return (
                    <button
                      key={`${m.type}:${m.id}`}
                      className="pick-row pressable"
                      onClick={() => toggleAny(m)}
                    >
                      <SmartImage src={m.poster} alt={m.title} className="pick-poster" />
                      <span className="pick-info">
                        <span className="pick-title">{m.title}</span>
                        <span className="pick-sub">{KIND[m.type].one}</span>
                      </span>
                      <span className={`pick-check ${fav ? 'on' : ''}`}>
                        {fav ? <CheckIcon size={16} /> : <PlusIcon size={16} />}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
