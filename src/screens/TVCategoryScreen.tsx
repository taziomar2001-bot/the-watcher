import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ShowCard } from '../ui/cards'
import { SortMenu } from '../ui/primitives'
import { ChevronLeft } from '../components/Icons'
import { useShowEntries } from '../logic/useLibraryData'
import { useScrollMemory } from '../hooks/useScrollMemory'
import { categorize, sortEntries, showColor, SHOW_SORTS, type ShowSort } from '../logic/status'
import { useAsync } from '../hooks/useAsync'
import { upcomingEpisodes } from '../data/catalog'

const TITLES: Record<string, string> = {
  watching: 'Currently Watching',
  uptodate: 'Up to Date',
  stale: 'Not Watched Recently',
  following: "Haven't Started Yet",
  finished: 'Finished',
  stopped: 'Stopped Watching',
}

export function TVCategoryScreen() {
  const { key = 'watching' } = useParams()
  const nav = useNavigate()
  const scrollRef = useScrollMemory<HTMLDivElement>(`tv-cat-${key}`)
  const [sort, setSort] = useState<ShowSort>('lastWatched')
  const entries = useShowEntries()
  const cats = categorize(entries, Date.now())
  const list =
    key === 'watching'
      ? cats.currentlyWatching
      : key === 'uptodate'
        ? cats.upToDate
        : key === 'stale'
          ? cats.notWatchedRecently
          : key === 'finished'
            ? cats.finished
            : key === 'stopped'
              ? cats.stopped
              : cats.following

  const ids = useMemo(() => list.map((e) => e.item.id), [list])
  // Only fetch next-episode dates when that sort is active (can be network-heavy).
  const { data: ups } = useAsync(
    () => (sort === 'nextEpisode' ? upcomingEpisodes(ids.slice(0, 60)) : Promise.resolve([])),
    [sort, ids.join(',')],
  )
  const nextEpMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const e of ups ?? []) if (!map[e.showId]) map[e.showId] = e.airDate
    return map
  }, [ups])

  const sorted = useMemo(() => sortEntries(list, sort, nextEpMap), [list, sort, nextEpMap])

  return (
    <div className="scroll-area route-fade" ref={scrollRef}>
      <div className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="pressable" onClick={() => nav(-1)} aria-label="Back" style={{ color: 'var(--text-dim)' }}>
            <ChevronLeft size={26} />
          </button>
          <h1 style={{ fontSize: 24 }}>{TITLES[key] ?? 'Shows'}</h1>
        </div>
      </div>

      <div className="toolbar">
        <span className="toolbar-title">{sorted.length} {sorted.length === 1 ? 'show' : 'shows'}</span>
        <SortMenu options={SHOW_SORTS} value={sort} onChange={setSort} />
      </div>

      {sorted.length === 0 ? (
        <div className="empty">
          <div className="empty-title">Nothing here yet</div>
        </div>
      ) : (
        <div className="card-list">
          {sorted.map((e) => (
            <ShowCard
              key={e.item.id}
              poster={e.item.poster}
              title={e.item.title}
              year={e.item.year}
              seasons={e.item.seasonCount}
              color={showColor(e.cls, e.stopped)}
              onClick={() => nav(`/show/${e.item.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
