import { useEffect, useRef, useState } from 'react'
import { PosterThumb } from './cards'
import type { DotColor } from '../logic/status'

export interface GridItem {
  id: string
  poster?: string
  title: string
  color: DotColor
}

const PAGE = 60

/**
 * Three-up poster grid used across the main Shows/Movies tabs and the Profile
 * library grid views. Renders in pages of 60 and adds more as you scroll, so a
 * library of thousands opens instantly.
 */
export function PosterGrid({ items, onOpen }: { items: GridItem[]; onOpen: (id: string) => void }) {
  const [count, setCount] = useState(PAGE)
  const sentinel = useRef<HTMLDivElement>(null)

  // A different list (filter / sort) starts again from the top page.
  const key = items.length + ':' + (items[0]?.id ?? '')
  useEffect(() => setCount(PAGE), [key])

  useEffect(() => {
    const el = sentinel.current
    if (!el || count >= items.length) return
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setCount((n) => n + PAGE), { rootMargin: '800px' })
    io.observe(el)
    return () => io.disconnect()
  }, [count, items.length])

  return (
    <>
      <div className="poster-grid">
        {items.slice(0, count).map((it) => (
          <PosterThumb key={it.id} poster={it.poster} title={it.title} color={it.color} onClick={() => onOpen(it.id)} />
        ))}
      </div>
      {count < items.length && <div ref={sentinel} style={{ height: 1 }} />}
    </>
  )
}

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
