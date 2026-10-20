import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SectionHeader } from '../ui/primitives'
import { PosterGrid, holdGridGrowth, type GridItem } from '../ui/PosterGrid'
import { useShowEntries } from '../logic/useLibraryData'
import { useScrollMemory } from '../hooks/useScrollMemory'
import { ContentSwitcher } from '../ui/ContentSwitcher'
import { categorize, showColor, type TvEntry } from '../logic/status'
import { useUpcoming } from '../logic/upcoming'

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

const CATCH_UP_DAYS = 7
const isoDaysAgo = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Catch Up: every show you follow (except stopped ones) whose latest episode
 * aired in the past week, whatever its status. It's an extra view only — the
 * show stays in its own category too, and drops out of here a week after the
 * episode aired. Shows already in Currently Watching aren't repeated here.
 * `latestAiredOn` also counts episodes from the release index
 * that have aired since the show was last refreshed, so it updates on air day.
 */
function catchUp(entries: TvEntry[], latestAiredOn: (e: TvEntry) => string | undefined, skip: Set<string>): TvEntry[] {
  const since = isoDaysAgo(CATCH_UP_DAYS)
  return entries
    .filter((e) => !e.stopped && (e.following || e.cls !== 'notStarted') && !skip.has(e.item.id))
    .map((e) => ({ e, d: latestAiredOn(e) }))
    .filter((x): x is { e: TvEntry; d: string } => !!x.d && x.d >= since)
    .sort((a, b) => b.d.localeCompare(a.d) || a.e.item.title.localeCompare(b.e.item.title))
    .map((x) => x.e)
}

const NAV_LABELS: Record<string, string> = {
  watching: 'Watching',
  catchup: 'Catch Up',
  stale: 'Not Recent',
  following: 'Not Started',
  uptodate: 'Up to Date',
}

/**
 * Main Shows tab — an active-viewing dashboard (Discover-style titled grids).
 * A sticky chip bar jumps between the sections: the four active categories
 * plus Catch Up (new episodes from the past week; this tab only). Finished and
 * Stopped shows stay tracked but live under Profile → TV Shows.
 */
export function TVShowsScreen() {
  const nav = useNavigate()
  const entries = useShowEntries()
  const scrollRef = useScrollMemory<HTMLDivElement>('tv')
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const topRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState('watching')
  const chipsRef = useRef<HTMLDivElement>(null)
  // Five chips don't fit side by side: the bar scrolls, and keeps the current one in view.
  useEffect(() => {
    const bar = chipsRef.current
    const chip = bar?.querySelector<HTMLElement>('.cat-chip.active')
    if (bar && chip) bar.scrollTo({ left: chip.offsetLeft - (bar.clientWidth - chip.offsetWidth) / 2, behavior: 'smooth' })
  }, [active])

  const sections = useMemo(() => {
    const c = categorize(entries, Date.now())
    const today = isoDaysAgo(0)
    // Read (not subscribed): the release index updates once per show while it
    // syncs, and the library summaries it feeds change alongside it anyway.
    const releaseIndex = useUpcoming.getState().byShow
    const latestAiredOn = (e: TvEntry) => {
      let d = e.item.latestReleaseDate
      for (const ep of releaseIndex[e.item.id]?.eps ?? []) if (ep.airDate <= today && (!d || ep.airDate > d)) d = ep.airDate
      return d
    }
    const watching = new Set(c.currentlyWatching.map((e) => e.item.id))
    return [
      { key: 'watching', title: 'Currently Watching', items: toGrid(byLatestRelease(c.currentlyWatching)) },
      { key: 'catchup', title: 'Catch Up', items: toGrid(catchUp(entries, latestAiredOn, watching)) },
      { key: 'stale', title: 'Not Watched Recently', items: toGrid(byLastWatched(c.notWatchedRecently)) },
      { key: 'following', title: "Haven't Started Yet", items: toGrid(byAlpha(c.following)) },
      { key: 'uptodate', title: 'Up to Date', items: toGrid(byLastWatched(c.upToDate)) },
    ]
  }, [entries])

  const hasAny = sections.some((s) => s.items.length > 0)
  const openShow = useCallback((id: string) => nav(`/show/${id}`), [nav])

  const stickyH = () => topRef.current?.getBoundingClientRect().height ?? 96
  /** Scroll position that puts a section's title right under the sticky bar. */
  const topOf = (key: string) => {
    const el = scrollRef.current
    const sec = sectionRefs.current[key]
    if (!el || !sec) return null
    const top = sec.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - stickyH()
    return Math.max(0, Math.min(top, el.scrollHeight - el.clientHeight))
  }

  // A chip jump in progress: the highlighted chip stays on the one you tapped
  // (instead of flickering through every section it scrolls past), grids don't
  // grow under it, and once the scroll settles it's corrected to land exactly.
  const jump = useRef<{ key: string; release: () => void; timer?: ReturnType<typeof setTimeout> } | null>(null)
  const settleJump = () => {
    const j = jump.current
    if (!j) return
    clearTimeout(j.timer)
    j.timer = setTimeout(() => {
      const el = scrollRef.current
      const top = topOf(j.key)
      if (el && top != null && Math.abs(el.scrollTop - top) > 2) el.scrollTo({ top })
      j.release()
      jump.current = null
    }, 140)
  }
  const jumpTo = (key: string) => {
    const el = scrollRef.current
    const top = topOf(key)
    if (!el || top == null) return
    if (jump.current) {
      clearTimeout(jump.current.timer)
      jump.current.release()
    }
    jump.current = { key, release: holdGridGrowth() }
    setActive(key)
    el.scrollTo({ top, behavior: 'smooth' })
    settleJump() // also finishes when there was nothing to scroll
  }
  useEffect(
    () => () => {
      if (jump.current) {
        clearTimeout(jump.current.timer)
        jump.current.release()
      }
    },
    [],
  )

  // Highlight the section you're in, at most once per frame.
  const frame = useRef(0)
  const onScroll = () => {
    if (jump.current) return settleJump()
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const el = scrollRef.current
      if (!el) return
      // At the very bottom the last sections can't reach the top: the last one wins.
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) return setActive(sections[sections.length - 1].key)
      const elTop = el.getBoundingClientRect().top
      const threshold = stickyH() + 12
      let cur = sections[0].key
      for (const s of sections) {
        const sec = sectionRefs.current[s.key]
        if (sec && sec.getBoundingClientRect().top - elTop <= threshold) cur = s.key
      }
      setActive(cur)
    })
  }
  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  return (
    <div className="scroll-area route-fade" ref={scrollRef} onScroll={onScroll}>
      {/* Sticky top bar (title + category toggle) — clears the phone status bar */}
      <div className="sticky-top" ref={topRef}>
        <div className="app-header">
          <div>
            <ContentSwitcher current="tv" />
            <div className="sub">{entries.length} in your library</div>
          </div>
        </div>
        <div className="cat-nav scroll-x" ref={chipsRef} style={{ marginBottom: 0 }}>
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
      </div>

      {sections.map((sec) => (
        <Section key={sec.key} id={sec.key} title={sec.title} items={sec.items} refs={sectionRefs} onOpen={openShow} />
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

/** One titled grid. Memoised so the chip highlight changing doesn't redraw hundreds of posters. */
const Section = memo(function Section({
  id,
  title,
  items,
  refs,
  onOpen,
}: {
  id: string
  title: string
  items: GridItem[]
  refs: React.MutableRefObject<Record<string, HTMLDivElement | null>>
  onOpen: (id: string) => void
}) {
  return (
    <div
      ref={(el) => {
        refs.current[id] = el
      }}
      style={{ marginBottom: 6 }}
    >
      <SectionHeader title={title} count={items.length} />
      {items.length > 0 ? (
        <PosterGrid items={items} onOpen={onOpen} />
      ) : (
        <div className="page-pad" style={{ paddingBottom: 12 }}>
          <span style={{ color: 'var(--text-mute)', fontSize: 13 }}>Nothing here right now</span>
        </div>
      )}
    </div>
  )
})
