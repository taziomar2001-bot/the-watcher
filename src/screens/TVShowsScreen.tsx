import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SectionHeader } from '../ui/primitives'
import { PosterGrid, type GridItem } from '../ui/PosterGrid'
import { useShowEntries } from '../logic/useLibraryData'
import { useScrollMemory } from '../hooks/useScrollMemory'
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

const NAV_LABELS: Record<string, string> = {
  watching: 'Watching',
  stale: 'Not Recent',
  following: 'Not Started',
  uptodate: 'Up to Date',
}

/**
 * Main Shows tab — an active-viewing dashboard (Discover-style titled grids).
 * A sticky chip bar jumps between the four active categories. Finished and
 * Stopped shows stay tracked but live under Profile → TV Shows.
 */
export function TVShowsScreen() {
  const nav = useNavigate()
  const entries = useShowEntries()
  const scrollRef = useScrollMemory<HTMLDivElement>('tv')
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [active, setActive] = useState('watching')

  const sections = useMemo(() => {
    const c = categorize(entries, Date.now())
    return [
      { key: 'watching', title: 'Currently Watching', items: toGrid(byLatestRelease(c.currentlyWatching)) },
      { key: 'stale', title: 'Not Watched Recently', items: toGrid(byLastWatched(c.notWatchedRecently)) },
      { key: 'following', title: "Haven't Started Yet", items: toGrid(byAlpha(c.following)) },
      { key: 'uptodate', title: 'Up to Date', items: toGrid(byLastWatched(c.upToDate)) },
    ]
  }, [entries])

  const hasAny = sections.some((s) => s.items.length > 0)

  const jumpTo = (key: string) => {
    const el = scrollRef.current
    const sec = sectionRefs.current[key]
    if (!el || !sec) return
    const top = sec.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - 54
    el.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
    setActive(key)
  }

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const elTop = el.getBoundingClientRect().top
    let cur = sections[0].key
    for (const s of sections) {
      const sec = sectionRefs.current[s.key]
      if (sec && sec.getBoundingClientRect().top - elTop <= 66) cur = s.key
    }
    setActive(cur)
  }

  return (
    <div className="scroll-area route-fade" ref={scrollRef} onScroll={onScroll}>
      <div className="app-header">
        <div>
          <h1>TV Shows</h1>
          <div className="sub">{entries.length} in your library</div>
        </div>
      </div>

      {/* Sticky category jump bar */}
      <div className="cat-nav">
        {sections.map((s) => (
          <button
            key={s.key}
            className={`cat-chip ${active === s.key ? 'active' : ''}`}
            onClick={() => jumpTo(s.key)}
          >
            {NAV_LABELS[s.key]}
          </button>
        ))}
      </div>

      {sections.map((sec) => (
        <div
          key={sec.key}
          ref={(el) => {
            sectionRefs.current[sec.key] = el
          }}
          style={{ marginBottom: 6, scrollMarginTop: 54 }}
        >
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
      <div style={{ height: 40 }} />
    </div>
  )
}
