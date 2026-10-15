import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from '../components/Icons'
import { SmartImage } from '../components/ui'
import { PublicScore } from '../ui/PublicScore'
import { PickFilterBar } from '../ui/PickFilters'
import { discoverPage, genreList } from '../data/catalog'
import { useLibrary } from '../store/useLibrary'
import { useTitleMeta, enrichTitles } from '../store/useTitleMeta'
import { useShowEntries, useMovieEntries } from '../logic/useLibraryData'
import { describe, fromMedia, lengthOf, libraryCandidates, type Candidate, type Genre, type PickFilters } from '../logic/pickFilters'
import { largePoster, toLibraryItem } from '../utils/media'
import { formatDuration } from '../utils/duration'
import { useToast } from '../store/useToast'

const mem: { f: PickFilters } = { f: { kind: 'movie', source: 'anything', genre: null, length: 'any' } }
const rand = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]

/** "What should I watch?" — draws a random title matching what you asked for. */
export function RandomScreen() {
  const nav = useNavigate()
  const toast = useToast((s) => s.show)
  const lib = useLibrary()
  const meta = useTitleMeta((s) => s.meta)
  const enriching = useTitleMeta((s) => s.running)
  const shows = useShowEntries()
  const movies = useMovieEntries()
  const [f, setF] = useState<PickFilters>(mem.f)
  const [genres, setGenres] = useState<Genre[]>([])
  const [pick, setPick] = useState<Candidate | null>(null)
  const [spinning, setSpinning] = useState<string | undefined>()
  const [drawing, setDrawing] = useState(false)
  const [empty, setEmpty] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const change = (next: PickFilters) => {
    mem.f = next
    setF(next)
    setPick(null)
    setEmpty(false)
  }

  useEffect(() => {
    let alive = true
    genreList(f.kind)
      .then((g) => alive && setGenres(g))
      .catch(() => alive && setGenres([]))
    return () => {
      alive = false
    }
  }, [f.kind])
  useEffect(() => () => clearInterval(timer.current), [])

  // Library picks with a length filter need each title's length: fetch the
  // missing facts in the background (cached on this device).
  const fromLibrary = f.source !== 'anything'
  const lib_ = useMemo(
    () => (fromLibrary ? libraryCandidates(f, shows, movies, lib.watchlistMovies, lib.watchedEpisodes, meta) : null),
    [fromLibrary, f, shows, movies, lib.watchlistMovies, lib.watchedEpisodes, meta],
  )
  useEffect(() => {
    if (lib_?.unknown.length) void enrichTitles(lib_.unknown)
  }, [lib_?.unknown.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const seen = (c: Candidate) => (c.type === 'movie' ? !!lib.watchedMovies[c.id] : !!lib.lastWatched[c.id])

  const candidates = async (): Promise<Candidate[]> => {
    if (lib_) return lib_.items
    const len = lengthOf(f.kind, f.length)
    const range = len.key === 'any' ? undefined : { min: len.min, max: len.max }
    const first = await discoverPage(f.kind, 1, f.genre ?? undefined, range)
    const pages = Math.min(first.totalPages, 15)
    for (let attempt = 0; attempt < 4; attempt++) {
      const page = attempt === 3 ? 1 : 1 + Math.floor(Math.random() * pages)
      const res = page === 1 ? first : await discoverPage(f.kind, page, f.genre ?? undefined, range)
      const fresh = res.items.map((m) => ({ ...fromMedia(m), media: m })).filter((c) => !seen(c))
      if (fresh.length) return fresh
    }
    return []
  }

  const draw = async () => {
    if (drawing) return
    setDrawing(true)
    setEmpty(false)
    let pool: Candidate[] = []
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
  const runtime = pick ? pick.runtime ?? meta[`${pick.type}:${pick.id}`]?.r : undefined

  return (
    <div className="scroll-area route-fade">
      <div className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="pressable" onClick={() => nav(-1)} aria-label="Back">
            <ChevronLeft size={26} />
          </button>
          <div>
            <h1 style={{ fontSize: 24 }}>Pick for me</h1>
            <div className="sub">Can’t decide? Let chance choose.</div>
          </div>
        </div>
      </div>

      <div className="page-pad">
        <PickFilterBar value={f} onChange={change} genres={genres} />
        {lib_ && (
          <div className="pf-count" role="status">
            {lib_.items.length.toLocaleString()} title{lib_.items.length === 1 ? '' : 's'} match
            {lib_.unknown.length > 0 && enriching ? ' · checking lengths…' : ''}
          </div>
        )}
      </div>

      <div className="page-pad rp-stage">
        {spinning !== undefined || drawing ? (
          <div className="rp-card spinning">
            <SmartImage src={spinning} alt="" className="rp-poster" />
          </div>
        ) : pick ? (
          <div className="rp-card pop">
            <button className="rp-poster-btn pressable" onClick={() => nav(`/${pick.type}/${pick.id}`)} aria-label={`Open ${pick.title}`}>
              <SmartImage src={largePoster(pick.poster)} alt={pick.title} className="rp-poster" />
            </button>
            <div className="rp-info">
              <div className="rp-title">{pick.title}</div>
              <div className="rp-meta">
                {[pick.year, pick.genres.slice(0, 2).join(', '), runtime ? (pick.type === 'show' ? `${runtime} min episodes` : formatDuration(runtime)) : null]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              <PublicScore value={pick.score} votes={pick.votes} />
              {pick.overview && <p className="rp-overview">{pick.overview}</p>}
              <div className="rp-actions">
                <button className="follow-btn primary pressable" onClick={() => nav(`/${pick.type}/${pick.id}`)}>
                  Open
                </button>
                <button className="follow-btn pressable" onClick={follow}>
                  {following ? 'Following' : 'Follow'}
                </button>
              </div>
            </div>
          </div>
        ) : empty ? (
          <div className="empty">
            <div className="empty-title">Nothing to pick from</div>
            <div className="empty-sub">No {describe(f)} {fromLibrary ? 'left to watch' : 'found'}. Try loosening a filter.</div>
          </div>
        ) : (
          <div className="pick-placeholder">
            <div className="pick-dice" aria-hidden="true">
              🎲
            </div>
            <div className="empty-sub">Set what you’re in the mood for, then draw.</div>
          </div>
        )}
      </div>
      <div className="rp-draw">
        <button className="welcome-primary pressable draw-btn" disabled={drawing} onClick={() => void draw()}>
          {pick ? 'Draw again' : 'Draw'}
        </button>
      </div>
    </div>
  )
}
