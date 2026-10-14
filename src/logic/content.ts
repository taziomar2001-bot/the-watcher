import type { ComponentType } from 'react'
import { TvIcon, ClapperboardIcon } from '../components/Icons'

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

export const CONTENT_CATEGORIES: ContentCategory[] = [
  { key: 'tv', label: 'TV Shows', path: '/tv', Icon: TvIcon, matches: (p) => p === '/tv' || p.startsWith('/tv/') },
  { key: 'movies', label: 'Movies', path: '/movies', Icon: ClapperboardIcon, matches: (p) => p === '/movies' || p.startsWith('/movies/') },
]

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
