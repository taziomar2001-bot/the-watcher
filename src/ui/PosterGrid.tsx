import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { PosterThumb } from './cards'
import type { DotColor } from '../logic/status'

export interface GridItem {
  id: string
  poster?: string
  title: string
  color: DotColor
}

const PAGE = 60
/** A grid ending in the top part of the screen (under sticky headers) counts as "above you". */
const TOP_ZONE = 0.35

// While a screen scrolls itself to a section (a category chip), grids hold off
// growing: a grid above the target that grew mid-scroll would push the target
// further down and the jump would land short. Growth resumes on release.
let held = 0
const onRelease = new Set<() => void>()
export function holdGridGrowth(): () => void {
  held++
  let done = false
  return () => {
    if (done) return
    done = true
    if (--held === 0) onRelease.forEach((f) => f())
  }
}

/**
 * Three-up poster grid used across the main Shows/Movies tabs and the Profile
 * library grid views. Renders in pages of 60 and adds more as you scroll, so a
 * library of thousands opens instantly.
 */
export const PosterGrid = memo(function PosterGrid({ items, onOpen }: { items: GridItem[]; onOpen: (id: string) => void }) {
  const [count, setCount] = useState(PAGE)
  const [recheck, setRecheck] = useState(0)
  const sentinel = useRef<HTMLDivElement>(null)

  // A different list (filter / sort) starts again from the top page.
  const key = items.length + ':' + (items[0]?.id ?? '')
  useEffect(() => setCount(PAGE), [key])
  useEffect(() => {
    const f = () => setRecheck((n) => n + 1)
    onRelease.add(f)
    return () => void onRelease.delete(f)
  }, [])

  // When a grid that ends above where you're reading grows (you jumped past
  // it, or scrolled back up towards its end), keep what's on screen still
  // instead of letting the new rows push it down. Safari has no scroll
  // anchoring and Chrome's misses these cases, so it's done here, and the
  // browser's own anchoring is off on pages with poster grids (ui.css) so
  // the two never both adjust.
  const grid = useRef<HTMLDivElement>(null)
  const anchor = useRef<{ scroller: HTMLElement; bottom: number } | null>(null)
  useLayoutEffect(() => {
    const a = anchor.current
    anchor.current = null
    const g = grid.current
    if (!a || !g) return
    const delta = g.getBoundingClientRect().bottom - a.bottom
    if (delta > 0) a.scroller.scrollTop += delta
  }, [count])

  useEffect(() => {
    const el = sentinel.current
    if (!el || count >= items.length) return
    const io = new IntersectionObserver(
      (es) => {
        if (held || !es.some((e) => e.isIntersecting)) return
        const g = grid.current
        const scroller = g?.closest<HTMLElement>('.scroll-area')
        const bottom = g?.getBoundingClientRect().bottom ?? 0
        anchor.current = scroller && bottom < window.innerHeight * TOP_ZONE ? { scroller, bottom } : null
        setCount((n) => n + PAGE)
      },
      { rootMargin: '800px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [count, items.length, recheck])

  return (
    <>
      <div className="poster-grid" ref={grid}>
        {items.slice(0, count).map((it) => (
          <PosterThumb key={it.id} poster={it.poster} title={it.title} color={it.color} onClick={() => onOpen(it.id)} />
        ))}
      </div>
      {count < items.length && <div ref={sentinel} style={{ height: 1 }} />}
    </>
  )
})

export type LibrarySort = 'recent' | 'az'

/** "Recently watched" / "A–Z" chips for library grids. */
export function SortChips({ value, onChange }: { value: LibrarySort; onChange: (v: LibrarySort) => void }) {
  return (
    <div className="sort-chips">
      {(
        [
          ['recent', 'Recently watched'],
          ['az', 'A–Z'],
        ] as const
      ).map(([k, label]) => (
        <button key={k} className={`toggle-pill pressable ${value === k ? 'active' : ''}`} onClick={() => onChange(k)}>
          {label}
        </button>
      ))}
    </div>
  )
}

/** Latest watched first; never-watched titles after, newest added first. */
export function byRecentlyWatched<T extends { item: { id: string; title: string } }>(lastWatched: Record<string, number>, addedAt: Record<string, number>) {
  return (a: T, b: T) => {
    const la = lastWatched[a.item.id] ?? 0
    const lb = lastWatched[b.item.id] ?? 0
    if (la !== lb) return lb - la
    const aa = addedAt[a.item.id] ?? 0
    const ab = addedAt[b.item.id] ?? 0
    return ab - aa || a.item.title.localeCompare(b.item.title)
  }
}
