import type { ComponentType } from 'react'
import { TvIcon, MovieCameraIcon, BookIcon, GamepadIcon } from '../components/Icons'
import { USE_TMDB } from '../data/catalog'
import { USE_GOOGLE_BOOKS } from '../data/books'
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

// Books and games appear once their catalogue is connected (Google Books key /
// IGDB proxy); without TMDB either, the app is in sample mode and shows all four.
const SAMPLE_MODE = !USE_TMDB
export const BOOKS_ON = USE_GOOGLE_BOOKS || SAMPLE_MODE
export const GAMES_ON = USE_IGDB || SAMPLE_MODE

export const CONTENT_CATEGORIES: ContentCategory[] = [
  { key: 'tv', label: 'TV Shows', path: '/tv', Icon: TvIcon, matches: (p) => p === '/tv' || p.startsWith('/tv/') },
  { key: 'movies', label: 'Movies', path: '/movies', Icon: MovieCameraIcon, matches: (p) => p === '/movies' || p.startsWith('/movies/') },
  ...(BOOKS_ON ? [{ key: 'books', label: 'Books', path: '/books', Icon: BookIcon, matches: (p: string) => p === '/books' }] : []),
  ...(GAMES_ON ? [{ key: 'games', label: 'Video Games', path: '/games', Icon: GamepadIcon, matches: (p: string) => p === '/games' }] : []),
]

/** Kinds available in this build, in display order. */
export const KINDS_ON: ('show' | 'movie' | 'book' | 'game')[] = ['show', 'movie', ...(BOOKS_ON ? ['book' as const] : []), ...(GAMES_ON ? ['game' as const] : [])]

const LAST_KEY = 'tw-content-last'

export function lastContentPath(): string {
  try {
    const k = localStorage.getItem(LAST_KEY)
    return CONTENT_CATEGORIES.find((c) => c.key === k)?.path ?? CONTENT_CATEGORIES[0].path
  } catch {
    return CONTENT_CATEGORIES[0].path
  }
}

export function rememberContent(key: string) {
  try {
    localStorage.setItem(LAST_KEY, key)
  } catch {
    /* ignore */
  }
}

export const isContentPath = (pathname: string) => CONTENT_CATEGORIES.some((c) => c.matches(pathname))
