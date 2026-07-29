import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SmartImage } from '../components/ui'
import { useUpcoming, ensureUpcoming } from '../logic/upcoming'
import { useLibrary } from '../store/useLibrary'
import { groupLabel, shortDate } from '../utils/dates'

interface UpItem {
  id: string
  showId: string
  date: string
  kind: 'tv' | 'movie'
  poster?: string
  title: string
  epTitle?: string
  season?: number
  number?: number
}
const pad = (n: number) => String(n).padStart(2, '0')

export function UpComingScreen() {
  const nav = useNavigate()
  const byShow = useUpcoming((s) => s.byShow)
  const building = useUpcoming((s) => s.building)
  const progress = useUpcoming((s) => s.progress)
  const watchlistShows = useLibrary((s) => s.watchlistShows)
  const stoppedShows = useLibrary((s) => s.stoppedShows)
  const libraryMovies = useLibrary((s) => s.libraryMovies)
  const watchlistMovies = useLibrary((s) => s.watchlistMovies)
  const watchedMovies = useLibrary((s) => s.watchedMovies)
  const [visible, setVisible] = useState(50)

  // Cache-first: renders from the persisted index immediately; refresh runs in bg.
  useEffect(() => {
    ensureUpcoming()
  }, [])

  const items = useMemo<UpItem[]>(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayIso = today.toISOString().slice(0, 10)
    const out: UpItem[] = []
    for (const [id, se] of Object.entries(byShow)) {
      if (!watchlistShows[id] || stoppedShows[id]) continue // exclude unfollowed & stopped
      for (const e of se.eps) {
        out.push({
          id: `${id}_${e.season}_${e.number}`,
          showId: id,
          date: e.airDate,
          kind: 'tv',
          poster: se.poster,
          title: se.title,
          epTitle: e.title,
          season: e.season,
          number: e.number,
        })
      }
    }
    for (const m of Object.values(libraryMovies)) {
      if (watchlistMovies[m.id] && !watchedMovies[m.id] && m.releaseDate && m.releaseDate >= todayIso) {
        out.push({ id: m.id, showId: m.id, date: m.releaseDate, kind: 'movie', poster: m.poster, title: m.title })
      }
    }
    const seen = new Set<string>()
    const dedup = out.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)))
    dedup.sort((a, b) => a.date.localeCompare(b.date))
    return dedup
  }, [byShow, watchlistShows, stoppedShows, libraryMovies, watchlistMovies, watchedMovies])

  const shown = items.slice(0, visible)
  const groups = useMemo(() => {
    const g: { date: string; items: UpItem[] }[] = []
    for (const it of shown) {
      const last = g[g.length - 1]
      if (last && last.date === it.date) last.items.push(it)
      else g.push({ date: it.date, items: [it] })
    }
    return g
  }, [shown])

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 600 && visible < items.length) {
      setVisible((v) => v + 50)
    }
  }

  return (
    <div className="scroll-area route-fade" onScroll={onScroll}>
      <div className="app-header">
        <div>
          <h1>Up &amp; Coming</h1>
          <div className="sub">
            {items.length === 0 && building
              ? 'Gathering your releases…'
              : `${items.length} upcoming ${items.length === 1 ? 'release' : 'releases'}${building ? ' · updating…' : ''}`}
          </div>
        </div>
      </div>

      {building && items.length > 0 && progress.total > 0 && (
        <div className="up-progress">
          <span style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
        </div>
      )}

      {items.length === 0 && building && (
        <div className="episode-list" style={{ marginTop: 8 }}>
          {Array.from({ length: 7 }).map((_, i) => (
            <span key={i} className="skeleton" style={{ height: 85, borderRadius: 12, display: 'block' }} />
          ))}
        </div>
      )}
      {items.length === 0 && !building && (
        <div className="empty">
          <div className="empty-title">Nothing on the horizon</div>
          <div className="empty-sub">Upcoming episodes and movies from everything you follow will appear here</div>
        </div>
      )}

      {groups.map((grp) => (
        <div className="day-group" key={grp.date}>
          <div className="day-label">
            <span className="d-main">{groupLabel(grp.date)}</span>
            <span className="d-sub">{shortDate(grp.date)}</span>
          </div>
          {grp.items.map((it) => (
            <button
              key={it.id}
              className="up-row pressable"
              onClick={() => nav(`/${it.kind === 'tv' ? 'show' : 'movie'}/${it.showId}`)}
            >
              <SmartImage src={it.poster} alt={it.title} className="up-poster" />
              <div className="up-body">
                <div className="up-title">{it.title}</div>
                <div className="up-sub">
                  {it.kind === 'tv'
                    ? `S${pad(it.season ?? 0)} · E${pad(it.number ?? 0)}${it.epTitle ? ` · ${it.epTitle}` : ''}`
                    : 'Movie'}
                </div>
              </div>
              <span className={`up-kind ${it.kind}`}>{it.kind === 'tv' ? 'EP' : 'FILM'}</span>
            </button>
          ))}
        </div>
      ))}
      {groups.length > 0 && <div style={{ height: 24 }} />}
    </div>
  )
}
