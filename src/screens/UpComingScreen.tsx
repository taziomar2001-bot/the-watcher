import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SmartImage } from '../components/ui'
import { useUpcoming, ensureUpcoming, refreshUpcoming, inUpcomingScope } from '../logic/upcoming'
import { useLibrary } from '../store/useLibrary'
import { groupLabel, shortDate } from '../utils/dates'

interface UpItem {
  id: string
  showId: string
  date: string
  kind: 'tv' | 'movie' | 'book' | 'game'
  poster?: string
  title: string
  epTitle?: string
  season?: number
  number?: number
}
const UP_BADGE = { tv: 'EP', movie: 'FILM', book: 'BOOK', game: 'GAME' } as const
const pad = (n: number) => String(n).padStart(2, '0')
const PTR_THRESHOLD = 70

export function UpComingScreen() {
  const nav = useNavigate()
  const byShow = useUpcoming((s) => s.byShow)
  const building = useUpcoming((s) => s.building)
  const progress = useUpcoming((s) => s.progress)
  const watchlistShows = useLibrary((s) => s.watchlistShows)
  const libraryShows = useLibrary((s) => s.libraryShows)
  const stoppedShows = useLibrary((s) => s.stoppedShows)
  const libraryMovies = useLibrary((s) => s.libraryMovies)
  const watchlistMovies = useLibrary((s) => s.watchlistMovies)
  const watchedMovies = useLibrary((s) => s.watchedMovies)
  const books = useLibrary((s) => s.books)
  const games = useLibrary((s) => s.games)
  const [visible, setVisible] = useState(50)

  // Pull-to-refresh state.
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)

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
      // Every non-stopped show you follow OR have any watch history for — the
      // same set the TV tab shows across Currently Watching / Up to Date /
      // Not Watched Recently / Haven't Started.
      if (!inUpcomingScope({ watchlistShows, libraryShows, stoppedShows }, id)) continue
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
    // Books and games you follow that aren't out yet (finished ones excluded).
    for (const [kind, map] of [['book', books], ['game', games]] as const) {
      for (const [id, t] of Object.entries(map)) {
        const d = t.item.releaseDate
        if (t.followed && t.state !== 'done' && d && d >= todayIso)
          out.push({ id: `${kind}:${id}`, showId: id, date: d, kind, poster: t.item.poster, title: t.item.title, epTitle: kind === 'book' ? t.item.authors?.[0] : t.item.platforms?.slice(0, 3).join(', ') })
      }
    }
    const seen = new Set<string>()
    const dedup = out.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)))
    dedup.sort((a, b) => a.date.localeCompare(b.date))
    return dedup
  }, [byShow, watchlistShows, libraryShows, stoppedShows, libraryMovies, watchlistMovies, watchedMovies, books, games])

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

  // ---- Pull-to-refresh (touch) ----
  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    startY.current = e.currentTarget.scrollTop <= 0 && !refreshing ? e.touches[0].clientY : null
  }
  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (startY.current == null || refreshing) return
    const dy = e.touches[0].clientY - startY.current
    setPull(dy > 0 && e.currentTarget.scrollTop <= 0 ? Math.min(dy * 0.5, 90) : 0)
  }
  const onTouchEnd = async () => {
    const shouldRefresh = startY.current != null && pull >= PTR_THRESHOLD && !refreshing
    startY.current = null
    if (shouldRefresh) {
      setRefreshing(true)
      setPull(0)
      try {
        await refreshUpcoming()
      } catch {
        /* ignore */
      }
      setRefreshing(false)
    } else {
      setPull(0)
    }
  }

  const indicatorH = refreshing ? 46 : pull
  const dragging = startY.current != null && pull > 0

  return (
    <div
      className="scroll-area route-fade"
      onScroll={onScroll}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <style>{`@keyframes ptr-spin{to{transform:rotate(360deg)}} .ptr-spin{width:20px;height:20px;border-radius:50%;border:2px solid var(--border);border-top-color:var(--accent);animation:ptr-spin .7s linear infinite}`}</style>

      {/* Pull-to-refresh indicator */}
      <div
        style={{
          height: indicatorH,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-mute)',
          fontSize: 13,
          fontWeight: 600,
          transition: dragging ? 'none' : 'height .2s ease',
        }}
      >
        {refreshing ? <span className="ptr-spin" /> : pull > 4 ? (pull >= PTR_THRESHOLD ? 'Release to refresh' : 'Pull to refresh') : null}
      </div>

      <div className="app-header">
        <div>
          <h1>Up &amp; Coming</h1>
          <div className="sub">
            {refreshing
              ? 'Refreshing your releases…'
              : items.length === 0 && building
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
      {items.length === 0 && !building && !refreshing && (
        <div className="empty">
          <div className="empty-title">Nothing on the horizon</div>
          <div className="empty-sub">New episodes, movies, books and games from everything you follow will appear here</div>
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
              onClick={() => nav(`/${it.kind === 'tv' ? 'show' : it.kind}/${it.showId}`)}
            >
              <SmartImage src={it.poster} alt={it.title} className="up-poster" />
              <div className="up-body">
                <div className="up-title">{it.title}</div>
                <div className="up-sub">
                  {it.kind === 'tv'
                    ? `S${pad(it.season ?? 0)} · E${pad(it.number ?? 0)}${it.epTitle ? ` · ${it.epTitle}` : ''}`
                    : it.kind === 'movie'
                      ? 'Movie'
                      : [it.kind === 'book' ? 'Book' : 'Video game', it.epTitle].filter(Boolean).join(' · ')}
                </div>
              </div>
              <span className={`up-kind ${it.kind}`}>{UP_BADGE[it.kind]}</span>
            </button>
          ))}
        </div>
      ))}
      {groups.length > 0 && <div style={{ height: 24 }} />}
    </div>
  )
}
