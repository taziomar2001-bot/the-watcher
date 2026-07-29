import type { LibraryItem } from '../store/useLibrary'

// ---- Colour system ----
// Shows: orange (not started) · yellow (started, incomplete) · purple (up to
//        date) · green (finished) · red (stopped watching)
// Seasons: orange (not started) · yellow (partial) · green (all watched)
// Episodes & movies: orange (unwatched) · green (watched)
export type DotColor = 'orange' | 'yellow' | 'green' | 'purple' | 'red'
export const DOT_COLOR: Record<DotColor, string> = {
  orange: 'var(--orange)',
  yellow: 'var(--yellow)',
  green: 'var(--green)',
  purple: 'var(--purple)',
  red: 'var(--red)',
}
export const DOT_LABEL: Record<DotColor, string> = {
  orange: 'Not started / unwatched',
  yellow: 'In progress',
  green: 'Watched / completed',
  purple: 'Up to date',
  red: 'Stopped watching',
}

/** Progress classification of a TV show (independent of recency & stopped). */
export type ShowClass = 'notStarted' | 'incomplete' | 'upToDate' | 'finished'

/** Coarse status used for library filtering (both movies & shows). */
export type Status = 'notStarted' | 'inProgress' | 'completed'
export function classToStatus(cls: ShowClass): Status {
  if (cls === 'notStarted') return 'notStarted'
  if (cls === 'finished') return 'completed'
  return 'inProgress'
}
export function movieStatus(id: string, watchedMovies: Record<string, true>): Status {
  return watchedMovies[id] ? 'completed' : 'notStarted'
}

export const RECENT_DAYS = 14
export const RECENT_MS = RECENT_DAYS * 86_400_000

export function watchedCountForShow(showId: string, watched: Record<string, true>): number {
  const prefix = showId + '_'
  let n = 0
  for (const k in watched) if (k.startsWith(prefix)) n++
  return n
}

/** Best watched count: max of imported aggregate `seen` and in-app episodes. */
export function effectiveSeen(item: LibraryItem, watched: Record<string, true>): number {
  return Math.max(item.seen || 0, watchedCountForShow(item.id, watched))
}

/**
 * Classify a show:
 *  - notStarted: no watched episodes
 *  - finished:   ended AND every episode watched
 *  - upToDate:   every *released* episode watched, but more content expected
 *  - incomplete: at least one released episode still unwatched
 * `releasedEpisodes`/`ended` come from the show's cached summary (enriched from
 * getShow); when absent we fall back to totalEpisodes.
 */
export function classifyShow(item: LibraryItem, watched: Record<string, true>): ShowClass {
  const seen = effectiveSeen(item, watched)
  if (seen <= 0) return 'notStarted'
  const total = item.totalEpisodes
  const released = item.releasedEpisodes ?? total // fallback: assume all released
  const ended = !!item.ended
  if (released != null && released > 0) {
    if (seen >= released) {
      // Caught up on everything aired.
      if (ended && (total == null || seen >= total)) return 'finished'
      return 'upToDate'
    }
    return 'incomplete'
  }
  // No episode-count info yet — best-effort.
  if (total != null && total > 0 && seen >= total) return ended ? 'finished' : 'upToDate'
  return 'incomplete'
}

/** Overall TV show colour (priority: stopped→finished→upToDate→notStarted→incomplete). */
export function showColor(cls: ShowClass, stopped: boolean): DotColor {
  if (stopped) return 'red'
  if (cls === 'finished') return 'green'
  if (cls === 'upToDate') return 'purple'
  if (cls === 'notStarted') return 'orange'
  return 'yellow'
}

/** Season colour — always independent of the parent's stopped status. */
export function seasonColor(allWatched: boolean, anyWatched: boolean): DotColor {
  if (allWatched) return 'green'
  if (anyWatched) return 'yellow'
  return 'orange'
}

export function episodeColor(watched: boolean): DotColor {
  return watched ? 'green' : 'orange'
}
export function movieColor(watched: boolean): DotColor {
  return watched ? 'green' : 'orange'
}

// ---- TV Shows tab categorisation ----
export interface TvEntry {
  item: LibraryItem
  cls: ShowClass
  following: boolean
  stopped: boolean
  lastWatched?: number
  followedAt?: number
  addedAt?: number
}

// Six mutually-exclusive cards. Priority: Stopped → Finished → Up to Date →
// Haven't Started → (recency) Currently Watching / Not Watched Recently.
export function categorize(entries: TvEntry[], now: number) {
  const currentlyWatching: TvEntry[] = []
  const upToDate: TvEntry[] = []
  const notWatchedRecently: TvEntry[] = []
  const following: TvEntry[] = []
  const finished: TvEntry[] = []
  const stopped: TvEntry[] = []
  for (const e of entries) {
    if (e.stopped) {
      stopped.push(e)
      continue
    }
    if (e.cls === 'finished') {
      finished.push(e)
    } else if (e.cls === 'upToDate') {
      upToDate.push(e)
    } else if (e.cls === 'notStarted') {
      if (e.following) following.push(e)
    } else {
      // incomplete → recency split
      if (e.lastWatched != null && now - e.lastWatched <= RECENT_MS) currentlyWatching.push(e)
      else notWatchedRecently.push(e)
    }
  }
  return { currentlyWatching, upToDate, notWatchedRecently, following, finished, stopped }
}

// ---- Sorting ----
export type ShowSort = 'alpha' | 'lastFollowed' | 'lastWatched' | 'nextEpisode'
export type MovieSort = 'alpha' | 'lastFollowed' | 'release'
export type LibrarySort = 'alpha' | 'dateAdded' | 'lastWatched' | 'release'

export const SHOW_SORTS: { key: ShowSort; label: string }[] = [
  { key: 'alpha', label: 'Alphabetical' },
  { key: 'lastFollowed', label: 'Last Followed' },
  { key: 'lastWatched', label: 'Last Watched' },
  { key: 'nextEpisode', label: 'Next Episode' },
]
export const MOVIE_SORTS: { key: MovieSort; label: string }[] = [
  { key: 'alpha', label: 'Alphabetical' },
  { key: 'lastFollowed', label: 'Last Followed' },
  { key: 'release', label: 'Release Date' },
]
export const LIBRARY_SORTS: { key: LibrarySort; label: string }[] = [
  { key: 'alpha', label: 'Alphabetical' },
  { key: 'dateAdded', label: 'Date Added' },
  { key: 'lastWatched', label: 'Last Watched' },
  { key: 'release', label: 'Release Date' },
]

export function sortEntries(entries: TvEntry[], sort: ShowSort, nextEpMap?: Record<string, string>): TvEntry[] {
  const arr = [...entries]
  switch (sort) {
    case 'alpha':
      arr.sort((a, b) => a.item.title.localeCompare(b.item.title))
      break
    case 'lastFollowed':
      arr.sort((a, b) => (b.followedAt ?? 0) - (a.followedAt ?? 0))
      break
    case 'lastWatched':
      arr.sort((a, b) => (b.lastWatched ?? 0) - (a.lastWatched ?? 0))
      break
    case 'nextEpisode':
      arr.sort((a, b) => {
        const da = nextEpMap?.[a.item.id]
        const db = nextEpMap?.[b.item.id]
        if (da && db) return da.localeCompare(db)
        if (da) return -1
        if (db) return 1
        return a.item.title.localeCompare(b.item.title)
      })
      break
  }
  return arr
}
