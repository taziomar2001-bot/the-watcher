import { PosterThumb } from './cards'
import type { DotColor } from '../logic/status'

export interface GridItem {
  id: string
  poster?: string
  title: string
  color: DotColor
}

/**
 * Three-up poster grid used across the main Shows/Movies tabs and the Profile
 * library grid views. Every card shows the poster, the title underneath, and the
 * existing status colour circle in the top-left — the same component as Discover.
 */
export function PosterGrid({ items, onOpen }: { items: GridItem[]; onOpen: (id: string) => void }) {
  return (
    <div className="poster-grid">
      {items.map((it) => (
        <PosterThumb key={it.id} poster={it.poster} title={it.title} color={it.color} onClick={() => onOpen(it.id)} />
      ))}
    </div>
  )
}
