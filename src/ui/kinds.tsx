import type { ComponentType } from 'react'
import { TvIcon, MovieCameraIcon, BookIcon, GamepadIcon } from '../components/Icons'
import type { ContentKind } from '../types'

/** One place for each kind's name, icon, badge and accent class. */
export const KIND: Record<ContentKind, { label: string; one: string; badge: string; Icon: ComponentType<{ size?: number }>; source: string }> = {
  show: { label: 'TV Shows', one: 'TV show', badge: 'TV', Icon: TvIcon, source: 'TMDB' },
  movie: { label: 'Movies', one: 'Movie', badge: 'FILM', Icon: MovieCameraIcon, source: 'TMDB' },
  book: { label: 'Books', one: 'Book', badge: 'BOOK', Icon: BookIcon, source: 'Open Library' },
  game: { label: 'Video Games', one: 'Video game', badge: 'GAME', Icon: GamepadIcon, source: 'IGDB' },
}

export function KindIcon({ kind, size = 20 }: { kind: ContentKind; size?: number }) {
  const I = KIND[kind].Icon
  return <I size={size} />
}

/** Small coloured kind label ("BOOK", "GAME"…), same accents as Up & Coming. */
export function KindBadge({ kind, label }: { kind: ContentKind; label?: string }) {
  return <span className={`kind-badge k-${kind}`}>{label ?? KIND[kind].badge}</span>
}
