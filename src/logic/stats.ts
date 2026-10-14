import { useEffect, useMemo, useRef } from 'react'
import { useLibrary } from '../store/useLibrary'
import { useShowEntries, useMovieEntries } from './useLibraryData'
import { effectiveSeen } from './status'
import { useSync } from './sync'
import { pushMyStats, pushMyShowcase, type Showcase, type ShowcaseItem } from '../data/social'
import { parseRef, type LibraryItem } from '../store/useLibrary'

// Shared watch-time assumptions (kept in one place so Profile, public profiles
// and the Leaderboard all agree).
export const EP_MIN = 42
export const MOVIE_MIN = 115

/** Maximum favourites allowed per category (movies and TV shows independently). */
export const FAV_LIMIT = 12

export interface UserTotals {
  showsFollowed: number
  // "Watched" = shows with at least one episode watched (started).
  showsStarted: number
  // "Finished" = shows fully completed (a stricter, separate metric).
  showsFinished: number
  episodesWatched: number
  tvMin: number
  moviesFollowed: number
  moviesWatched: number
  movieMin: number
  totalMin: number
}

/** Compute the signed-in user's totals the same way the Profile tab does. */
export function useMyStats(): UserTotals {
  const lib = useLibrary()
  const shows = useShowEntries()
  const movies = useMovieEntries()
  return useMemo(() => {
    const showsFollowed = Object.keys(lib.watchlistShows).length
    const showsStarted = shows.filter((e) => effectiveSeen(e.item, lib.watchedEpisodes) >= 1).length
    const showsFinished = shows.filter((e) => e.cls === 'finished').length
    const episodesWatched = shows.reduce((n, e) => n + effectiveSeen(e.item, lib.watchedEpisodes), 0)
    const tvMin = episodesWatched * EP_MIN
    const moviesFollowed = Object.keys(lib.watchlistMovies).length
    const watched = movies.filter((e) => lib.watchedMovies[e.item.id])
    const moviesWatched = watched.length
    const movieMin = watched.reduce((n, e) => n + (e.item.runtime || MOVIE_MIN), 0)
    return {
      showsFollowed,
      showsStarted,
      showsFinished,
      episodesWatched,
      tvMin,
      moviesFollowed,
      moviesWatched,
      movieMin,
      totalMin: tvMin + movieMin,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lib.watchlistShows, lib.watchlistMovies, lib.watchedMovies, lib.watchedEpisodes, shows, movies])
}

/**
 * "9 Movies · 7 TV Shows" — the composition of a mixed collection, never a bare
 * total. Drops any zero category and pluralises naturally; empty → "No titles".
 */
export function compositionLabel(movies: number, shows: number): string {
  const parts: string[] = []
  if (movies > 0) parts.push(`${movies} ${movies === 1 ? 'Movie' : 'Movies'}`)
  if (shows > 0) parts.push(`${shows} ${shows === 1 ? 'TV Show' : 'TV Shows'}`)
  if (parts.length === 0) return 'No titles'
  return parts.join(' · ')
}

/** Count movie vs show refs ("show:ID" | "movie:ID") in a custom list. */
export function countRefs(refs: string[]): { movies: number; shows: number } {
  let movies = 0
  let shows = 0
  for (const r of refs) {
    if (r.startsWith('movie:')) movies++
    else if (r.startsWith('show:')) shows++
  }
  return { movies, shows }
}

/**
 * While signed in, mirror the user's aggregate stats to Supabase (profile_stats)
 * so the leaderboard and public profiles read real numbers. Debounced; only
 * writes when a value actually changed. No-op (and harmless) when Supabase is
 * off or the write fails. Mount once near the app root.
 */
export function useStatsSync() {
  const status = useSync((s) => s.status)
  const syncReady = useSync((s) => s.syncReady)
  const stats = useMyStats()
  const showcase = useMyShowcase()
  const last = useRef('')
  const lastShowcase = useRef('')
  useEffect(() => {
    if (status !== 'signedIn' || !syncReady) {
      last.current = ''
      return
    }
    const payload = {
      episodes_watched: stats.episodesWatched,
      shows_watched: stats.showsStarted,
      shows_finished: stats.showsFinished,
      movies_watched: stats.moviesWatched,
      minutes_watched: stats.totalMin,
      shows_followed: stats.showsFollowed,
      movies_followed: stats.moviesFollowed,
      tv_minutes: stats.tvMin,
      movie_minutes: stats.movieMin,
    }
    const key = JSON.stringify(payload)
    if (key === last.current) return
    const t = setTimeout(() => {
      last.current = key
      void pushMyStats(payload)
    }, 2500)
    return () => clearTimeout(t)
  }, [status, syncReady, stats])

  useEffect(() => {
    if (status !== 'signedIn' || !syncReady) {
      lastShowcase.current = ''
      return
    }
    const key = JSON.stringify(showcase)
    if (key === lastShowcase.current) return
    const t = setTimeout(async () => {
      if (await pushMyShowcase(showcase)) lastShowcase.current = key
    }, 3000)
    return () => clearTimeout(t)
  }, [status, syncReady, showcase])
}

const toShowcaseItem = (type: 'show' | 'movie', id: string, it?: LibraryItem): ShowcaseItem | null =>
  it?.title ? { id, type, title: it.title, poster: it.poster, year: it.year } : null

/**
 * What this user shows on their public profile: favorites (unless hidden in
 * Settings) and lists marked Public. Nothing else from the private library.
 */
export function useMyShowcase(): Showcase {
  const favoriteShows = useLibrary((s) => s.favoriteShows)
  const favoriteMovies = useLibrary((s) => s.favoriteMovies)
  const libraryShows = useLibrary((s) => s.libraryShows)
  const libraryMovies = useLibrary((s) => s.libraryMovies)
  const lists = useLibrary((s) => s.lists)
  const hideFavorites = useLibrary((s) => !!s.profile.hideFavorites)
  return useMemo(() => {
    const favorites = hideFavorites
      ? []
      : [
          ...Object.keys(favoriteShows).map((id) => toShowcaseItem('show', id, libraryShows[id])),
          ...Object.keys(favoriteMovies).map((id) => toShowcaseItem('movie', id, libraryMovies[id])),
        ].filter((x): x is ShowcaseItem => !!x)
    const publicLists = lists
      .filter((l) => l.visibility === 'public')
      .map((l) => ({
        id: l.id,
        name: l.name,
        ranked: !!l.ranked,
        cover: l.cover,
        items: l.items
          .slice(0, 250)
          .map((ref) => {
            const { type, id } = parseRef(ref)
            return toShowcaseItem(type, id, type === 'show' ? libraryShows[id] : libraryMovies[id])
          })
          .filter((x): x is ShowcaseItem => !!x),
      }))
    return { favorites, lists: publicLists }
  }, [favoriteShows, favoriteMovies, libraryShows, libraryMovies, lists, hideFavorites])
}
