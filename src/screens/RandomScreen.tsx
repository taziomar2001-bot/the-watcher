import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from '../components/Icons'
import { SmartImage } from '../components/ui'
import { Segmented } from '../ui/primitives'
import { PublicScore } from '../ui/PublicScore'
import { discoverPage, genreList } from '../data/catalog'
import { useLibrary, type LibraryItem } from '../store/useLibrary'
import { useTitleMeta } from '../store/useTitleMeta'
import { toLibraryItem } from '../utils/media'
import { useToast } from '../store/useToast'
import type { Media, Movie, Show } from '../types'

type Kind = 'movie' | 'show'
type Source = 'anything' | 'watchlist'
interface Pick {
  id: string
  type: Kind
  title: string
  poster?: string
  year?: number
  score?: number
  votes?: number
  genres: string[]
  overview?: string
  media?: Media
}
const mem: { kind: Kind; source: Source; genre: { id: number; name: string } | null } = { kind: 'movie', source: 'anything', genre: null }

const rand = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]

/** "What should I watch?" — draws a random title matching what you asked for. */
export function RandomScreen() {
  const nav = useNavigate()
  const toast = useToast((s) => s.show)
  const lib = useLibrary()
  const meta = useTitleMeta((s) => s.meta)
  const [kind, setKindState] = useState<Kind>(mem.kind)
  const [source, setSourceState] = useState<Source>(mem.source)
  const [genre, setGenreState] = useState(mem.genre)
  const [genres, setGenres] = useState<{ id: number; name: string }[]>([])
  const [pick, setPick] = useState<Pick | null>(null)
  const [spinning, setSpinning] = useState<string | undefined>()
  const [drawing, setDrawing] = useState(false)
  const [empty, setEmpty] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const setKind = (k: Kind) => {
    mem.kind = k
    mem.genre = null
    setKindState(k)
    setGenreState(null)
    setPick(null)
  }
  const setSource = (s: Source) => ((mem.source = s), setSourceState(s), setPick(null))
  const setGenre = (g: { id: number; name: string } | null) => ((mem.genre = g), setGenreState(g), setPick(null))

  useEffect(() => {
    let alive = true
    genreList(kind)
      .then((g) => alive && setGenres(g))
      .catch(() => alive && setGenres([]))
    return () => {
      alive = false
    }
  }, [kind])
  useEffect(() => () => clearInterval(timer.current), [])

  const watched = (type: Kind, id: string) => (type === 'movie' ? !!lib.watchedMovies[id] : !!lib.lastWatched[id])
  const fromMedia = (m: Media): Pick => ({
    id: m.id,
    type: m.type,
    title: m.title,
    poster: m.poster,
    year: m.type === 'movie' ? (m as Movie).year : (m as Show).firstAirYear,
    score: m.communityRating,
    votes: m.communityVotes,
    genres: m.genres,
    overview: m.overview,
    media: m,
  })
  const fromItem = (it: LibraryItem, type: Kind): Pick => {
    const f = meta[`${type}:${it.id}`]
    return { id: it.id, type, title: it.title, poster: it.poster, year: it.year ?? f?.y, score: f?.v, genres: it.genres ?? f?.g ?? [] }
  }

  const candidates = async (): Promise<Pick[]> => {
    if (source === 'watchlist') {
      const ids = Object.keys(kind === 'movie' ? lib.watchlistMovies : lib.watchlistShows)
      const items = ids
        .map((id) => (kind === 'movie' ? lib.libraryMovies[id] : lib.libraryShows[id]))
        .filter((it): it is LibraryItem => !!it && !watched(kind, it.id))
        .map((it) => fromItem(it, kind))
      return genre ? items.filter((p) => p.genres.includes(genre.name)) : items
    }
    const first = await discoverPage(kind, 1, genre ?? undefined)
    const pages = Math.min(first.totalPages, 15)
    for (let attempt = 0; attempt < 4; attempt++) {
      const page = attempt === 3 ? 1 : 1 + Math.floor(Math.random() * pages)
      const res = page === 1 ? first : await discoverPage(kind, page, genre ?? undefined)
      const fresh = res.items.filter((m) => !watched(kind, m.id)).map(fromMedia)
      if (fresh.length) return fresh
    }
    return []
  }

  const draw = async () => {
    if (drawing) return
    setDrawing(true)
    setEmpty(false)
    let pool: Pick[] = []
    try {
      pool = await candidates()
    } catch {
      setDrawing(false)
      return toast('Couldn’t reach the catalog — try again')
    }
    if (!pool.length) {
      setDrawing(false)
      setPick(null)
      setEmpty(true)
      return
    }
    // A short shuffle of posters before landing on the pick.
    const posters = pool.map((p) => p.poster).filter(Boolean) as string[]
    let n = 0
    clearInterval(timer.current)
    timer.current = setInterval(() => {
      setSpinning(rand(posters))
      if (++n >= 9) {
        clearInterval(timer.current)
        setSpinning(undefined)
        setPick(rand(pool))
        setDrawing(false)
      }
    }, 90)
  }

  const following = pick ? (pick.type === 'movie' ? !!lib.watchlistMovies[pick.id] : !!lib.watchlistShows[pick.id]) : false
  const follow = () => {
    if (!pick) return
    const item = pick.media ? toLibraryItem(pick.media) : undefined
    if (pick.type === 'movie') lib.toggleWatchlistMovie(pick.id, item)
    else lib.toggleWatchlistShow(pick.id, item)
    if (!following) toast(`Following ${pick.title}`)
  }

  return (
    <div className="scroll-area route-fade">
      <div className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="pressable" onClick={() => nav(-1)} aria-label="Back" style={{ color: 'var(--text-dim)' }}>
            <ChevronLeft size={26} />
          </button>
          <div>
            <h1 style={{ fontSize: 24 }}>Pick for me</h1>
            <div className="sub">Can’t decide? Let chance choose.</div>
          </div>
        </div>
      </div>

      <div className="page-pad picker-controls">
        <Segmented
          options={[
            { key: 'movie', label: 'Movie' },
            { key: 'show', label: 'TV show' },
          ]}
          value={kind}
          onChange={setKind}
        />
        <div className="genre-chips" role="radiogroup" aria-label="Pick from">
          {(
            [
              ['anything', 'Anything'],
              ['watchlist', 'From my watchlist'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} role="radio" aria-checked={source === k} className={`toggle-pill pressable ${source === k ? 'active' : ''}`} onClick={() => setSource(k)}>
              {label}
            </button>
          ))}
        </div>
        {genres.length > 0 && (
          <div className="genre-chips" role="listbox" aria-label="Genre">
            <button className={`toggle-pill pressable ${!genre ? 'active' : ''}`} onClick={() => setGenre(null)}>
              Any genre
            </button>
            {genres.map((g) => (
              <button key={g.id} className={`toggle-pill pressable ${genre?.id === g.id ? 'active' : ''}`} onClick={() => setGenre(g)}>
                {g.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="page-pad">
        {spinning !== undefined || drawing ? (
          <div className="pick-card spinning">
            <SmartImage src={spinning} alt="" className="pick-poster" />
          </div>
        ) : pick ? (
          <div className="pick-card pop">
            <button className="pick-poster-btn pressable" onClick={() => nav(`/${pick.type}/${pick.id}`)}>
              <SmartImage src={pick.poster} alt={pick.title} className="pick-poster" />
            </button>
            <div className="pick-info">
              <div className="pick-title">{pick.title}</div>
              <div className="pick-meta">
                {[pick.year, pick.genres.slice(0, 2).join(', ')].filter(Boolean).join(' · ')}
              </div>
              <PublicScore value={pick.score} votes={pick.votes} />
              {pick.overview && <p className="pick-overview">{pick.overview}</p>}
              <div className="pick-actions">
                <button className="follow-btn primary pressable" onClick={() => nav(`/${pick.type}/${pick.id}`)}>
                  Open
                </button>
                <button className={`follow-btn pressable ${following ? '' : ''}`} onClick={follow}>
                  {following ? 'Following' : 'Follow'}
                </button>
              </div>
            </div>
          </div>
        ) : empty ? (
          <div className="empty">
            <div className="empty-title">Nothing to pick from</div>
            <div className="empty-sub">
              {source === 'watchlist'
                ? `No unwatched ${kind === 'movie' ? 'movies' : 'shows'} in your watchlist${genre ? ` for ${genre.name}` : ''}. Try “Anything”.`
                : 'Try another genre.'}
            </div>
          </div>
        ) : (
          <div className="pick-placeholder">
            <div className="pick-dice" aria-hidden="true">
              🎲
            </div>
            <div className="empty-sub">Choose what you’re in the mood for, then draw.</div>
          </div>
        )}
        <button className="welcome-primary pressable draw-btn" disabled={drawing} onClick={() => void draw()}>
          {pick ? 'Draw again' : 'Draw'}
        </button>
      </div>
      <div style={{ height: 24 }} />
    </div>
  )
}
