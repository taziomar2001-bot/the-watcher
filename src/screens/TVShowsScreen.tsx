import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { SectionHeader } from '../ui/primitives'
import { PosterGrid, type GridItem } from '../ui/PosterGrid'
import { useShowEntries } from '../logic/useLibraryData'
import { categorize, showColor, type TvEntry } from '../logic/status'

const toGrid = (list: TvEntry[]): GridItem[] =>
  list.map((e) => ({ id: e.item.id, poster: e.item.poster, title: e.item.title, color: showColor(e.cls, e.stopped) }))

const byLatestRelease = (list: TvEntry[]) =>
  [...list].sort(
    (a, b) =>
      (b.item.latestReleaseDate ?? '').localeCompare(a.item.latestReleaseDate ?? '') ||
      a.item.title.localeCompare(b.item.title),
  )
const byLastWatched = (list: TvEntry[]) =>
  [...list].sort((a, b) => (b.lastWatched ?? 0) - (a.lastWatched ?? 0) || a.item.title.localeCompare(b.item.title))
const byAlpha = (list: TvEntry[]) => [...list].sort((a, b) => a.item.title.localeCompare(b.item.title))

/**
 * Main Shows tab — an active-viewing dashboard (Discover-style titled grids).
 * Only the four "active" categories appear here. Finished and Stopped shows are
 * intentionally hidden from this tab but remain fully tracked and are accessible
 * from Profile → TV Shows.
 */
export function TVShowsScreen() {
  const nav = useNavigate()
  const entries = useShowEntries()

  const sections = useMemo(() => {
    const c = categorize(entries, Date.now())
    return [
      { key: 'watching', title: 'Currently Watching', items: toGrid(byLatestRelease(c.currentlyWatching)) },
      { key: 'uptodate', title: 'Up to Date', items: toGrid(byLastWatched(c.upToDate)) },
      { key: 'stale', title: 'Not Watched Recently', items: toGrid(byLastWatched(c.notWatchedRecently)) },
      { key: 'following', title: "Haven't Started Yet", items: toGrid(byAlpha(c.following)) },
    ]
  }, [entries])

  const hasAny = sections.some((s) => s.items.length > 0)

  return (
    <div className="scroll-area route-fade">
      <div className="app-header">
        <div>
          <h1>TV Shows</h1>
          <div className="sub">{entries.length} in your library</div>
        </div>
      </div>

      {sections.map((sec) => (
        <div key={sec.key} style={{ marginBottom: 6 }}>
          <SectionHeader title={sec.title} count={sec.items.length} />
          {sec.items.length > 0 ? (
            <PosterGrid items={sec.items} onOpen={(id) => nav(`/show/${id}`)} />
          ) : (
            <div className="page-pad" style={{ paddingBottom: 12 }}>
              <span style={{ color: 'var(--text-mute)', fontSize: 13 }}>Nothing here right now</span>
            </div>
          )}
        </div>
      ))}

      {!hasAny && entries.length === 0 && (
        <div className="empty">
          <div className="empty-title">No shows yet</div>
          <div className="empty-sub">Follow shows from Discover to start tracking</div>
        </div>
      )}
      <div style={{ height: 16 }} />
    </div>
  )
}
