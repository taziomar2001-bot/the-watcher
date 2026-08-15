import { useMemo } from 'react'
import { useLibrary } from '../store/useLibrary'
import { useShowEntries, useMovieEntries } from './useLibraryData'
import { effectiveSeen } from './status'

// Shared watch-time assumptions (kept in one place so Profile, public profiles
// and the Leaderboard all agree).
export const EP_MIN = 42
export const MOVIE_MIN = 115

/** Maximum favourites allowed per category (movies and TV shows independently). */
export const FAV_LIMIT = 12

export interface UserTotals {
  showsFollowed: number
  showsCompleted: number
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
    const showsCompleted = shows.filter((e) => e.cls === 'finished').length
    const episodesWatched = shows.reduce((n, e) => n + effectiveSeen(e.item, lib.watchedEpisodes), 0)
    const tvMin = episodesWatched * EP_MIN
    const moviesFollowed = Object.keys(lib.watchlistMovies).length
    const watched = movies.filter((e) => lib.watchedMovies[e.item.id])
    const moviesWatched = watched.length
    const movieMin = watched.reduce((n, e) => n + (e.item.runtime || MOVIE_MIN), 0)
    return {
      showsFollowed,
      showsCompleted,
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
