import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CategoryCard } from '../ui/cards'
import { Segmented } from '../ui/primitives'
import { PosterGrid, SortChips, byRecentlyWatched, type GridItem, type LibrarySort } from '../ui/PosterGrid'
import { useLibrary } from '../store/useLibrary'
import { ChevronLeft } from '../components/Icons'
import { useShowEntries } from '../logic/useLibraryData'
import { useScrollMemory } from '../hooks/useScrollMemory'
import { categorize, showColor } from '../logic/status'

// Preserve Category/Grid view when leaving to open a show and returning.
let tvLibViewMem: 'category' | 'grid' = 'category'
let tvLibSortMem: LibrarySort = 'recent'

/**
 * Profile → TV Shows: the COMPLETE followed-TV library, every status included
 * (Finished and Stopped too). Category View reproduces the original Shows-tab
 * layout; Grid View shows everything together, most recently watched first (or A–Z).
 */
export function ProfileTVLibraryScreen() {
  const nav = useNavigate()
  const scrollRef = useScrollMemory<HTMLDivElement>('lib-shows')
  const [view, setViewState] = useState<'category' | 'grid'>(tvLibViewMem)
  const setView = (v: 'category' | 'grid') => {
    tvLibViewMem = v
    setViewState(v)
  }
  const entries = useShowEntries()
  const [sort, setSortState] = useState<LibrarySort>(tvLibSortMem)
  const setSort = (v: LibrarySort) => ((tvLibSortMem = v), setSortState(v))
  const lastWatched = useLibrary((s) => s.lastWatched)
  const addedAt = useLibrary((s) => s.addedAt)

  const cats = useMemo(() => categorize(entries, Date.now()), [entries])

  const categoryCards = [
    { key: 'watching', title: 'Currently Watching', list: cats.currentlyWatching },
    { key: 'uptodate', title: 'Up to Date', list: cats.upToDate },
    { key: 'stale', title: 'Not Watched Recently', list: cats.notWatchedRecently },
    { key: 'following', title: "Haven't Started Yet", list: cats.following },
    { key: 'finished', title: 'Finished', list: cats.finished },
    { key: 'stopped', title: 'Stopped Watching', list: cats.stopped },
  ]

  // Grid View: every followed show (the union of all categories), alphabetical.
  const gridItems = useMemo<GridItem[]>(() => {
    const all = [
      ...cats.currentlyWatching,
      ...cats.upToDate,
      ...cats.notWatchedRecently,
      ...cats.following,
      ...cats.finished,
      ...cats.stopped,
    ]
    const seen = new Set<string>()
    return all
      .filter((e) => (seen.has(e.item.id) ? false : (seen.add(e.item.id), true)))
      .sort(sort === 'recent' ? byRecentlyWatched(lastWatched, addedAt) : (a, b) => a.item.title.localeCompare(b.item.title))
      .map((e) => ({ id: e.item.id, poster: e.item.poster, title: e.item.title, color: showColor(e.cls, e.stopped) }))
  }, [cats, sort, lastWatched, addedAt])

  return (
    <div className="scroll-area route-fade" ref={scrollRef}>
      <div className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="pressable" onClick={() => nav(-1)} aria-label="Back" style={{ color: 'var(--text-dim)' }}>
            <ChevronLeft size={26} />
          </button>
          <h1 style={{ fontSize: 24 }}>TV Shows</h1>
        </div>
      </div>

      <div className="page-pad" style={{ paddingBottom: 10 }}>
        <Segmented
          options={[
            { key: 'category', label: 'Category View' },
            { key: 'grid', label: 'Grid View' },
          ]}
          value={view}
          onChange={setView}
        />
      </div>

      {view === 'category' ? (
        <div className="card-list" style={{ gap: 12, marginTop: 2 }}>
          {categoryCards.map((c) => (
            <CategoryCard
              key={c.key}
              title={c.title}
              count={c.list.length}
              posters={c.list.slice(0, 3).map((e) => e.item.poster)}
              onClick={() => nav(`/tv/category/${c.key}`)}
            />
          ))}
        </div>
      ) : gridItems.length > 0 ? (
        <>
          <SortChips value={sort} onChange={setSort} />
          <PosterGrid items={gridItems} onOpen={(id) => nav(`/show/${id}`)} />
        </>
      ) : (
        <div className="empty">
          <div className="empty-title">No shows yet</div>
        </div>
      )}
      <div style={{ height: 20 }} />
    </div>
  )
}
