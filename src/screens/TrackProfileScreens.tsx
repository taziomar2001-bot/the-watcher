import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, GridIcon } from '../components/Icons'
import { PosterGrid, type GridItem } from '../ui/PosterGrid'
import { StatGrid, GenreBars } from '../ui/Dashboard'
import { useScrollMemory } from '../hooks/useScrollMemory'
import { fmtAvg } from '../logic/ratings'
import { WORDS, sectionsOf, trackTotals, useTrackEntries, type TrackEntry } from '../logic/tracks'
import type { TrackKind } from '../store/useLibrary'

export const ProfileBooksDashboard = () => <TrackDashboard kind="book" />
export const ProfileGamesDashboard = () => <TrackDashboard kind="game" />
export const ProfileBooksLibrary = () => <TrackLibrary kind="book" />
export const ProfileGamesLibrary = () => <TrackLibrary kind="game" />

function Header({ title }: { title: string }) {
  const nav = useNavigate()
  return (
    <div className="app-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="pressable" onClick={() => nav(-1)} aria-label="Back" style={{ color: 'var(--text-dim)' }}>
          <ChevronLeft size={26} />
        </button>
        <h1 style={{ fontSize: 24 }}>{title}</h1>
      </div>
    </div>
  )
}

/** Share of each value across entries, top N, as whole percentages. */
function topShares(entries: TrackEntry[], pick: (e: TrackEntry) => string[] | undefined, n = 6) {
  const counts = new Map<string, number>()
  let total = 0
  for (const e of entries) {
    const vals = pick(e) ?? []
    for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1)
    if (vals.length) total++
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, c]) => ({ name, pct: Math.round((c / Math.max(total, 1)) * 100) }))
}

/** Profile → Books / Games: the numbers that matter for that kind, then the full library. */
function TrackDashboard({ kind }: { kind: TrackKind }) {
  const nav = useNavigate()
  const w = WORDS[kind]
  const scrollRef = useScrollMemory<HTMLDivElement>(`dash-${kind}`)
  const entries = useTrackEntries(kind)
  const inLib = entries.filter((e) => e.t.followed || e.t.state)
  const t = trackTotals(inLib)
  const rated = entries.filter((e) => e.t.rating != null)
  const avg = rated.length ? rated.reduce((a, e) => a + (e.t.rating ?? 0), 0) / rated.length : null
  const finished = inLib.filter((e) => e.t.state === 'done')
  const year = new Date().getFullYear()
  const thisYear = finished.filter((e) => e.t.finishedAt && new Date(e.t.finishedAt).getFullYear() === year).length

  const stats =
    kind === 'book'
      ? [
          { label: 'In your library', value: t.followed },
          { label: 'Reading', value: t.active },
          { label: 'Finished', value: t.done },
          { label: `Finished in ${year}`, value: thisYear },
          { label: 'Want to read', value: t.backlog },
          { label: 'Stopped reading', value: t.stopped },
          { label: 'Pages in finished books', value: finished.reduce((n, e) => n + (e.t.item.pageCount ?? 0), 0).toLocaleString() },
          { label: 'Rated', value: rated.length },
          ...(avg != null ? [{ label: 'Avg book rating', value: `${fmtAvg(avg)} ★` }] : []),
        ]
      : [
          { label: 'In your library', value: t.followed },
          { label: 'Playing', value: t.active },
          { label: 'Finished', value: t.done },
          { label: `Finished in ${year}`, value: thisYear },
          { label: 'Backlog', value: t.backlog },
          { label: 'Stopped playing', value: t.stopped },
          { label: 'Rated', value: rated.length },
          ...(avg != null ? [{ label: 'Avg game rating', value: `${fmtAvg(avg)} ★` }] : []),
        ]

  const genres = topShares(inLib, (e) => e.t.item.genres)
  const second = kind === 'book' ? topShares(inLib, (e) => e.t.item.authors?.slice(0, 1), 5) : topShares(inLib, (e) => e.t.item.platforms, 5)

  return (
    <div className="scroll-area route-fade" ref={scrollRef}>
      <Header title={w.Many} />
      <StatGrid stats={stats} />
      <button className="cta-row pressable" onClick={() => nav(kind === 'book' ? '/library/books' : '/library/games')}>
        <GridIcon size={18} />
        <span>Complete {kind === 'book' ? 'Book' : 'Game'} Library</span>
        <ChevronRight size={20} />
      </button>
      <div className="page-pad" style={{ display: 'grid', gap: 12, marginTop: 4 }}>
        <GenreBars title="Top genres" genres={genres} accent={`var(--kind-${kind})`} />
        <GenreBars title={kind === 'book' ? 'Most-read authors' : 'Platforms'} genres={second} accent={`var(--kind-${kind})`} />
      </div>
      <div style={{ height: 24 }} />
    </div>
  )
}

type Filter = 'all' | 'active' | 'done' | 'backlog' | 'stopped'
const filterMem: Record<TrackKind, Filter> = { book: 'all', game: 'all' }

/** Every book / game you follow or have a status for, filterable by status. */
function TrackLibrary({ kind }: { kind: TrackKind }) {
  const nav = useNavigate()
  const w = WORDS[kind]
  const scrollRef = useScrollMemory<HTMLDivElement>(`lib-${kind}`)
  const entries = useTrackEntries(kind)
  const [filter, setFilterState] = useState<Filter>(filterMem[kind])
  const setFilter = (f: Filter) => ((filterMem[kind] = f), setFilterState(f))
  const s = useMemo(() => sectionsOf(entries), [entries])
  const lists: Record<Filter, TrackEntry[]> = {
    all: [...s.active, ...s.backlog, ...s.soon, ...s.done, ...s.stopped],
    active: s.active,
    done: s.done,
    backlog: [...s.backlog, ...s.soon],
    stopped: s.stopped,
  }
  const items: GridItem[] = lists[filter].map((e) => ({ id: e.id, poster: e.t.item.poster, title: e.t.item.title, color: e.color ?? 'orange' }))
  const chips: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: w.active },
    { key: 'done', label: w.done },
    { key: 'backlog', label: w.backlog },
    { key: 'stopped', label: 'Stopped' },
  ]
  return (
    <div className="scroll-area route-fade" ref={scrollRef}>
      <Header title={w.Many} />
      <div className="cat-nav scroll-x" style={{ paddingTop: 0 }}>
        {chips.map((c) => (
          <button key={c.key} className={`cat-chip ${filter === c.key ? 'active' : ''}`} onClick={() => setFilter(c.key)}>
            {c.label}
            <span className="chip-n">{lists[c.key].length}</span>
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <div className="empty">
          <div className="empty-title">Nothing here</div>
        </div>
      ) : (
        <PosterGrid items={items} onOpen={(id) => nav(`/${kind}/${id}`)} />
      )}
      <div style={{ height: 20 }} />
    </div>
  )
}
