import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { SmartImage } from '../components/ui'
import { ProgressDot, Segmented, SearchField } from '../ui/primitives'
import { ChevronLeft, DotsIcon, TrashIcon, EditIcon, PlusIcon, CheckIcon } from '../components/Icons'
import { useLibrary } from '../store/useLibrary'
import { useShowEntries, useMovieEntries } from '../logic/useLibraryData'
import { useScrollMemory } from '../hooks/useScrollMemory'
import { useAsync } from '../hooks/useAsync'
import { search as searchCatalog } from '../data/catalog'
import { toLibraryItem } from '../utils/media'
import { showColor, movieColor } from '../logic/status'

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
  const [kind, setKind] = useState<'show' | 'movie'>('show')
  const [menu, setMenu] = useState(false)
  const [edit, setEdit] = useState(false)
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState('')
  const { data: results } = useAsync(() => (q.trim() ? searchCatalog(q) : Promise.resolve([])), [q])

  const items = useMemo(() => {
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
        color: movieColor(!!lib.watchedMovies[e.item.id]),
      }))
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [kind, shows, movies, lib.favoriteShows, lib.favoriteMovies, lib.stoppedShows, lib.watchedMovies])

  const removeFav = (type: 'show' | 'movie', id: string) => {
    if (type === 'show') lib.toggleFavoriteShow(id)
    else lib.toggleFavoriteMovie(id)
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
            <div className="sub">{items.length} {items.length === 1 ? 'title' : 'titles'}</div>
          </div>
        </div>
        <button className="icon-round pressable" onClick={() => setMenu(true)} aria-label="Favorites options">
          <DotsIcon size={20} />
        </button>
      </div>

      <div className="page-pad" style={{ paddingBottom: 10 }}>
        <Segmented
          options={[
            { key: 'show', label: 'TV Shows' },
            { key: 'movie', label: 'Movies' },
          ]}
          value={kind}
          onChange={(k) => {
            setKind(k)
            setEdit(false)
          }}
        />
      </div>

      <div className="page-pad" style={{ paddingBottom: 10 }}>
        <button className="add-titles-btn pressable" onClick={() => setAdding(true)}>
          <PlusIcon size={17} /> Add titles
        </button>
      </div>

      {items.length === 0 ? (
        <div className="empty">
          <div className="empty-title">No favorites yet</div>
          <div className="empty-sub">Tap “Add titles” to star shows and movies</div>
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
        <div className="modal-backdrop" onClick={() => setAdding(false)}>
          <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
            <div className="settings-head">
              <span className="settings-title">Add to favorites</span>
              <button className="settings-close pressable" onClick={() => setAdding(false)} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="page-pad" style={{ paddingTop: 4, paddingBottom: 8 }}>
              <SearchField value={q} onChange={setQ} placeholder="Search movies & TV shows" autoFocus />
            </div>
            <div className="settings-body" style={{ paddingTop: 0 }}>
              {!q.trim() ? (
                <div className="empty compact">
                  <div className="empty-sub">Search to favorite shows or movies</div>
                </div>
              ) : (
                (results ?? []).map((m) => {
                  const fav = m.type === 'show' ? !!lib.favoriteShows[m.id] : !!lib.favoriteMovies[m.id]
                  return (
                    <button
                      key={`${m.type}:${m.id}`}
                      className="pick-row pressable"
                      onClick={() => {
                        if (m.type === 'show') lib.toggleFavoriteShow(m.id, toLibraryItem(m))
                        else lib.toggleFavoriteMovie(m.id, toLibraryItem(m))
                      }}
                    >
                      <SmartImage src={m.poster} alt={m.title} className="pick-poster" />
                      <span className="pick-info">
                        <span className="pick-title">{m.title}</span>
                        <span className="pick-sub">{m.type === 'show' ? 'TV' : 'Film'}</span>
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
