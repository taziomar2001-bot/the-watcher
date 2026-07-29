import { useMemo } from 'react'
import { useAsync } from '../hooks/useAsync'
import { allShows, allMovies } from '../data/catalog'
import { useLibrary, type LibraryItem } from '../store/useLibrary'
import { toLibraryItem } from '../utils/media'
import { classifyShow, movieStatus, type Status, type TvEntry } from './status'

export interface MovieEntry {
  item: LibraryItem
  status: Status
  followedAt?: number
  addedAt?: number
  lastWatched?: number
}

function useShowCatalog() {
  const { data } = useAsync(() => allShows(), [])
  return useMemo(() => {
    const map: Record<string, LibraryItem> = {}
    for (const s of data ?? []) map[s.id] = toLibraryItem(s)
    return map
  }, [data])
}

function useMovieCatalog() {
  const { data } = useAsync(() => allMovies(), [])
  return useMemo(() => {
    const map: Record<string, LibraryItem> = {}
    for (const m of data ?? []) map[m.id] = toLibraryItem(m)
    return map
  }, [data])
}

/** All TV shows in the user's library, with derived status and recency. */
export function useShowEntries(): TvEntry[] {
  const lib = useLibrary()
  const catById = useShowCatalog()
  return useMemo(() => {
    const ids = new Set([
      ...Object.keys(lib.watchlistShows),
      ...Object.keys(lib.libraryShows),
      ...Object.keys(lib.favoriteShows),
    ])
    const out: TvEntry[] = []
    for (const id of ids) {
      const item = lib.libraryShows[id] ?? catById[id]
      if (!item) continue
      out.push({
        item,
        cls: classifyShow(item, lib.watchedEpisodes),
        following: !!lib.watchlistShows[id],
        stopped: !!lib.stoppedShows[id],
        lastWatched: lib.lastWatched[id],
        followedAt: lib.followedAt[id],
        addedAt: lib.addedAt[id],
      })
    }
    return out
  }, [lib.watchlistShows, lib.libraryShows, lib.favoriteShows, lib.stoppedShows, lib.watchedEpisodes, lib.lastWatched, lib.followedAt, lib.addedAt, catById])
}

/** All movies in the user's library, with derived status and recency. */
export function useMovieEntries(): MovieEntry[] {
  const lib = useLibrary()
  const catById = useMovieCatalog()
  return useMemo(() => {
    const ids = new Set([
      ...Object.keys(lib.watchlistMovies),
      ...Object.keys(lib.libraryMovies),
      ...Object.keys(lib.favoriteMovies),
      ...Object.keys(lib.watchedMovies),
    ])
    const out: MovieEntry[] = []
    for (const id of ids) {
      const item = lib.libraryMovies[id] ?? catById[id]
      if (!item) continue
      out.push({
        item,
        status: movieStatus(id, lib.watchedMovies),
        followedAt: lib.followedAt[id],
        addedAt: lib.addedAt[id],
        lastWatched: lib.lastWatched[id],
      })
    }
    return out
  }, [lib.watchlistMovies, lib.libraryMovies, lib.favoriteMovies, lib.watchedMovies, lib.followedAt, lib.addedAt, lib.lastWatched, catById])
}
