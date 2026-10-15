import type { ComponentType } from 'react'
import { TvIcon, MovieCameraIcon, BookIcon, GamepadIcon } from '../components/Icons'
import { USE_TMDB } from '../data/catalog'
import { USE_IGDB } from '../data/games'

/**
 * The kinds of things you can track, shown together under the Content tab.
 * To add one later (books, podcasts, music…), add an entry here with its own
 * route and screen — nothing about TV or movies has to change.
 */
export interface ContentCategory {
  key: string
  label: string
  path: string
  Icon: ComponentType<{ size?: number }>
  /** Routes that belong to this category (for the Content tab's active state). */
  matches: (pathname: string) => boolean
}

// Games appear once the IGDB proxy is connected; without TMDB the app is in
// sample mode and shows all four kinds.
const SAMPLE_MODE = !USE_TMDB
// Books need no key (Open Library live, the sample catalogue otherwise).
export const BOOKS_ON = true
export const GAMES_ON = USE_IGDB || SAMPLE_MODE

/**
 * The one order every kind appears in across the app (toggles, drawers, lists,
 * cards): Books · Movies · TV Shows · Video Games. TV Shows stays the default view.
 */
export const KIND_ORDER = ['book', 'movie', 'show', 'game'] as const

const ALL_CATEGORIES: (ContentCategory & { on: boolean })[] = [
  { key: 'books', label: 'Books', path: '/books', Icon: BookIcon, matches: (p: string) => p === '/books', on: BOOKS_ON },
  { key: 'movies', label: 'Movies', path: '/movies', Icon: MovieCameraIcon, matches: (p) => p === '/movies' || p.startsWith('/movies/'), on: true },
  { key: 'tv', label: 'TV Shows', path: '/tv', Icon: TvIcon, matches: (p) => p === '/tv' || p.startsWith('/tv/'), on: true },
  { key: 'games', label: 'Video Games', path: '/games', Icon: GamepadIcon, matches: (p: string) => p === '/games', on: GAMES_ON },
]
export const CONTENT_CATEGORIES: ContentCategory[] = ALL_CATEGORIES.filter((c) => c.on)
const DEFAULT_CATEGORY = CONTENT_CATEGORIES.find((c) => c.key === 'movies')!

/** Kinds available in this build, in display order. */
export const KINDS_ON: ('show' | 'movie' | 'book' | 'game')[] = KIND_ORDER.filter((k) => (k === 'book' ? BOOKS_ON : k === 'game' ? GAMES_ON : true))

/** Content tab tapped again while on it: the next category, in order (wraps around). */
export function nextContentPath(pathname: string): string {
  const i = CONTENT_CATEGORIES.findIndex((c) => c.matches(pathname))
  return CONTENT_CATEGORIES[(i + 1) % CONTENT_CATEGORIES.length].path
}

// The Content tab opens on Movies each time the app starts, then remembers the
// category you were last on for the rest of that visit.
let lastKey: string | null = null

export function lastContentPath(): string {
  return CONTENT_CATEGORIES.find((c) => c.key === lastKey)?.path ?? DEFAULT_CATEGORY.path
}

export function rememberContent(key: string) {
  lastKey = key
}

export const isContentPath = (pathname: string) => CONTENT_CATEGORIES.some((c) => c.matches(pathname))
