import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Show } from '../types'
import { SEED_WATCHED_EPISODES } from '../data/mock'

export interface CustomList {
  id: string
  name: string
  description?: string
  visibility: 'public' | 'private'
  kind: 'shows' | 'movies' | 'mixed'
  items: string[] // typed refs: "show:ID" | "movie:ID" — order = rank order when ranked
  cover?: string
  createdAt?: number
  ranked?: boolean // when true, items are ordered and shown with a rank badge
}

/** Build/parse a typed list-membership ref so shows & movies never collide. */
export const listRef = (type: 'show' | 'movie', id: string) => `${type}:${id}`
export const parseRef = (ref: string): { type: 'show' | 'movie'; id: string } => {
  const i = ref.indexOf(':')
  return { type: ref.slice(0, i) as 'show' | 'movie', id: ref.slice(i + 1) }
}

type IdMap = Record<string, true>

/** Lightweight cached summary of a library item so "my library" surfaces can
 *  render real posters/titles in live (TMDB) mode without re-fetching, and
 *  work offline. Populated when the user adds an item or via the TV Time import. */
export interface LibraryItem {
  id: string
  type: 'show' | 'movie'
  title: string
  poster?: string
  backdrop?: string
  totalEpisodes?: number
  releasedEpisodes?: number // episodes aired as of last enrichment
  latestReleaseDate?: string // air date of the most recent already-aired episode
  ended?: boolean // show concluded (TMDB status Ended/Canceled)
  seasonCount?: number
  seasonSizes?: Record<string, number> // season number -> episode count (for offline rating averages)
  year?: number
  runtime?: number
  releaseDate?: string
  seen?: number // imported episodes-watched count (drives progress)
  archived?: boolean
  genres?: string[] // populated when full detail is fetched (for genre analysis)
}

export interface ImportedShow {
  id: string
  item: LibraryItem
  followed: boolean
  favorite: boolean
  rating?: number
  followedAt?: number
  lastWatched?: number
}

interface LibraryState {
  watchlistShows: IdMap
  watchlistMovies: IdMap
  watchedEpisodes: IdMap
  watchedMovies: IdMap
  favoriteShows: IdMap
  favoriteMovies: IdMap
  notifyShows: IdMap
  ratings: Record<string, number>
  // Personal 1–5 whole-star ratings (never 0; absent = unrated).
  movieRatings: Record<string, number>
  episodeRatings: Record<string, number>
  ratingAt: Record<string, number> // rating timestamp, keyed by movie id / episode id
  libraryShows: Record<string, LibraryItem>
  libraryMovies: Record<string, LibraryItem>
  // Recency metadata (additive; drives categories & sorting). Keyed by media id.
  lastWatched: Record<string, number>
  followedAt: Record<string, number>
  addedAt: Record<string, number>
  stoppedShows: IdMap // manually "Stopped Watching" shows
  lists: CustomList[]
  profile: { username: string; displayName?: string; avatar?: string; following: number; followers: number; comments: number }
  tvTimeImported: boolean
  tvTimeMoviesImported: boolean
  migrationVersion: number
  // Per-item resolution ledger so the TV Time migration is resumable and never
  // re-resolves an item twice. Keyed by TheTVDB id (shows) / "name|year" (movies).
  importedShowIds: Record<string, true>
  importedMovieKeys: Record<string, true>

  toggleWatchlistShow: (id: string, item?: LibraryItem) => void
  toggleWatchlistMovie: (id: string, item?: LibraryItem) => void
  toggleFavoriteShow: (id: string, item?: LibraryItem) => void
  toggleFavoriteMovie: (id: string, item?: LibraryItem) => void
  toggleNotify: (id: string) => void
  setRating: (id: string, rating: number) => void
  // 1–5 whole stars. Passing the current value again clears the rating.
  // Never changes watched status.
  setMovieRating: (id: string, rating: number) => void
  setEpisodeRating: (epId: string, rating: number) => void
  updateProfile: (patch: Partial<{ username: string; displayName: string; avatar: string }>) => void
  renameList: (id: string, name: string) => void
  deleteList: (id: string) => void
  removeFromList: (listId: string, ref: string) => void
  reorderList: (listId: string, items: string[]) => void
  markEpisodeWatched: (epId: string, watched: boolean) => void
  markAllPrevious: (epIds: string[]) => void
  markAllUnwatched: (epIds: string[]) => void
  markMovieWatched: (id: string, watched: boolean, item?: LibraryItem) => void
  setStopped: (id: string, stopped: boolean, item?: LibraryItem) => void
  followShow: (id: string, item?: LibraryItem) => void
  addList: (list: Omit<CustomList, 'id'>) => void
  addToList: (listId: string, mediaId: string) => void
  applyImportedShows: (entries: ImportedShow[]) => void
  applyImportedMovies: (entries: LibraryItem[]) => void
  importMovies: (entries: ImportedMovie[]) => void
  setFavoriteMovies: (ids: string[]) => void
  setFavoriteShows: (ids: string[]) => void
  setTvTimeImported: (v: boolean) => void
  setTvTimeMoviesImported: (v: boolean) => void
  setMigrationVersion: (v: number) => void
  markShowsResolved: (tvdbIds: string[]) => void
  markMoviesResolved: (keys: string[]) => void
  patchLibraryShow: (id: string, patch: Partial<LibraryItem>) => void
  patchLibraryMovie: (id: string, patch: Partial<LibraryItem>) => void
  backfillSeen: (showId: string, orderedReleasedEpIds: string[], count: number) => void
}

export interface ImportedMovie {
  id: string
  item: LibraryItem
  watched: boolean
  followed: boolean
  favorite?: boolean
  followedAt?: number
  watchedAt?: number
}

// Per-category favourites cap (movies and shows independently). Mirrors
// FAV_LIMIT in logic/stats; kept as a local literal to avoid an import cycle.
const FAV_CAP = 12

const on = (map: IdMap, id: string): IdMap => ({ ...map, [id]: true })
const off = (map: IdMap, id: string): IdMap => {
  const next = { ...map }
  delete next[id]
  return next
}

// When a TMDB key is present the sample IDs won't match real TMDB IDs, so we
// start with a clean, empty library and let the user build it from live data.
// In mock mode we seed a lively sample library so the UI is populated on launch.
const USE_TMDB = Boolean(import.meta.env.VITE_TMDB_TOKEN || import.meta.env.VITE_TMDB_KEY)

const sampleSeed = {
  watchlistShows: {
    silo: true,
    hotd: true,
    rickmorty: true,
    tlou: true,
    severance: true,
    thebear: true,
    foundation: true,
    shogun: true,
    fallout: true,
  } as IdMap,
  watchlistMovies: { dune3: true, avatar3: true, oppen2: true, mission8: true, wicked2: true, sinners: true } as IdMap,
  watchedEpisodes: SEED_WATCHED_EPISODES,
  watchedMovies: { sinners: true, anora: true, brutalist: true, conclave: true, gladiator2: true } as IdMap,
  favoriteShows: { severance: true, thebear: true } as IdMap,
  favoriteMovies: { anora: true, brutalist: true } as IdMap,
  notifyShows: { silo: true, hotd: true, tlou: true } as IdMap,
  ratings: { anora: 9, brutalist: 8, severance: 10 } as Record<string, number>,
}

const emptySeed = {
  watchlistShows: {} as IdMap,
  watchlistMovies: {} as IdMap,
  watchedEpisodes: {} as IdMap,
  watchedMovies: {} as IdMap,
  favoriteShows: {} as IdMap,
  favoriteMovies: {} as IdMap,
  notifyShows: {} as IdMap,
  ratings: {} as Record<string, number>,
}

const seed = USE_TMDB ? emptySeed : sampleSeed

export const useLibrary = create<LibraryState>()(
  persist(
    (set) => ({
      ...seed,
      movieRatings: {},
      episodeRatings: {},
      ratingAt: {},
      libraryShows: {},
      libraryMovies: {},
      lastWatched: {},
      followedAt: {},
      addedAt: {},
      stoppedShows: {},
      lists: [],
      profile: { username: USE_TMDB ? '' : 'omar', following: USE_TMDB ? 0 : 48, followers: USE_TMDB ? 0 : 27, comments: USE_TMDB ? 0 : 132 },
      // In mock mode there is nothing to import, so mark it done up-front.
      tvTimeImported: !USE_TMDB,
      tvTimeMoviesImported: !USE_TMDB,
      migrationVersion: USE_TMDB ? 0 : 999,
      importedShowIds: {},
      importedMovieKeys: {},

      toggleWatchlistShow: (id, item) =>
        set((s) => {
          if (s.watchlistShows[id]) return { watchlistShows: off(s.watchlistShows, id) }
          const now = Date.now()
          return {
            watchlistShows: on(s.watchlistShows, id),
            libraryShows: item ? { ...s.libraryShows, [id]: { ...s.libraryShows[id], ...item } } : s.libraryShows,
            followedAt: { ...s.followedAt, [id]: s.followedAt[id] ?? now },
            addedAt: { ...s.addedAt, [id]: s.addedAt[id] ?? now },
          }
        }),
      toggleWatchlistMovie: (id, item) =>
        set((s) => {
          if (s.watchlistMovies[id]) return { watchlistMovies: off(s.watchlistMovies, id) }
          const now = Date.now()
          return {
            watchlistMovies: on(s.watchlistMovies, id),
            libraryMovies: item ? { ...s.libraryMovies, [id]: { ...s.libraryMovies[id], ...item } } : s.libraryMovies,
            followedAt: { ...s.followedAt, [id]: s.followedAt[id] ?? now },
            addedAt: { ...s.addedAt, [id]: s.addedAt[id] ?? now },
          }
        }),
      toggleFavoriteShow: (id, item) =>
        set((s) => {
          if (s.favoriteShows[id]) return { favoriteShows: off(s.favoriteShows, id) }
          // Safety net for the 12-per-category cap (the UI also blocks + explains).
          if (Object.keys(s.favoriteShows).length >= FAV_CAP) return {}
          return {
            favoriteShows: on(s.favoriteShows, id),
            libraryShows: item ? { ...s.libraryShows, [id]: { ...s.libraryShows[id], ...item } } : s.libraryShows,
          }
        }),
      toggleFavoriteMovie: (id, item) =>
        set((s) => {
          if (s.favoriteMovies[id]) return { favoriteMovies: off(s.favoriteMovies, id) }
          if (Object.keys(s.favoriteMovies).length >= FAV_CAP) return {}
          return {
            favoriteMovies: on(s.favoriteMovies, id),
            libraryMovies: item ? { ...s.libraryMovies, [id]: { ...s.libraryMovies[id], ...item } } : s.libraryMovies,
          }
        }),
      toggleNotify: (id) => set((s) => ({ notifyShows: s.notifyShows[id] ? off(s.notifyShows, id) : on(s.notifyShows, id) })),
      setRating: (id, rating) => set((s) => ({ ratings: { ...s.ratings, [id]: rating } })),
      // Toggle-off when clicking the current value; never touches watched state.
      setMovieRating: (id, rating) =>
        set((s) => {
          const movieRatings = { ...s.movieRatings }
          const ratingAt = { ...s.ratingAt }
          if (movieRatings[id] === rating) {
            delete movieRatings[id]
            delete ratingAt[id]
          } else {
            movieRatings[id] = rating
            ratingAt[id] = Date.now()
          }
          return { movieRatings, ratingAt }
        }),
      setEpisodeRating: (epId, rating) =>
        set((s) => {
          const episodeRatings = { ...s.episodeRatings }
          const ratingAt = { ...s.ratingAt }
          if (episodeRatings[epId] === rating) {
            delete episodeRatings[epId]
            delete ratingAt[epId]
          } else {
            episodeRatings[epId] = rating
            ratingAt[epId] = Date.now()
          }
          return { episodeRatings, ratingAt }
        }),
      updateProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
      renameList: (id, name) =>
        set((s) => ({ lists: s.lists.map((l) => (l.id === id ? { ...l, name } : l)) })),
      deleteList: (id) => set((s) => ({ lists: s.lists.filter((l) => l.id !== id) })),
      removeFromList: (listId, ref) =>
        set((s) => ({
          lists: s.lists.map((l) => (l.id === listId ? { ...l, items: l.items.filter((r) => r !== ref) } : l)),
        })),
      // Replace a list's item order wholesale (used by ranked-list reordering).
      reorderList: (listId, items) =>
        set((s) => ({
          lists: s.lists.map((l) => (l.id === listId ? { ...l, items } : l)),
        })),
      // Watching an episode implies following the parent show (spec §11).
      markEpisodeWatched: (epId, watched) =>
        set((s) => {
          const showId = epId.split('_')[0]
          const now = Date.now()
          if (watched) {
            return {
              watchedEpisodes: on(s.watchedEpisodes, epId),
              lastWatched: { ...s.lastWatched, [showId]: now },
              watchlistShows: on(s.watchlistShows, showId),
              followedAt: { ...s.followedAt, [showId]: s.followedAt[showId] ?? now },
              addedAt: { ...s.addedAt, [showId]: s.addedAt[showId] ?? now },
            }
          }
          return { watchedEpisodes: off(s.watchedEpisodes, epId) }
        }),
      markAllPrevious: (epIds) =>
        set((s) => {
          const next = { ...s.watchedEpisodes }
          epIds.forEach((id) => (next[id] = true))
          const showId = epIds[0]?.split('_')[0]
          const now = Date.now()
          return {
            watchedEpisodes: next,
            lastWatched: showId ? { ...s.lastWatched, [showId]: now } : s.lastWatched,
            watchlistShows: showId ? on(s.watchlistShows, showId) : s.watchlistShows,
            followedAt: showId ? { ...s.followedAt, [showId]: s.followedAt[showId] ?? now } : s.followedAt,
            addedAt: showId ? { ...s.addedAt, [showId]: s.addedAt[showId] ?? now } : s.addedAt,
          }
        }),
      // A watched movie is always also tracked/followed (spec §3). It stays
      // followed even after watching; the Movies tab hides it because it filters
      // out completed titles, while the Library and stats still include it.
      markAllUnwatched: (epIds) =>
        set((s) => {
          const next = { ...s.watchedEpisodes }
          epIds.forEach((id) => delete next[id])
          return { watchedEpisodes: next }
        }),
      markMovieWatched: (id, watched, item) =>
        set((s) => {
          const now = Date.now()
          if (watched) {
            return {
              watchedMovies: on(s.watchedMovies, id),
              watchlistMovies: on(s.watchlistMovies, id),
              libraryMovies: item ? { ...s.libraryMovies, [id]: { ...s.libraryMovies[id], ...item } } : s.libraryMovies,
              lastWatched: { ...s.lastWatched, [id]: now },
              followedAt: { ...s.followedAt, [id]: s.followedAt[id] ?? now },
              addedAt: { ...s.addedAt, [id]: s.addedAt[id] ?? now },
            }
          }
          return { watchedMovies: off(s.watchedMovies, id) }
        }),
      // Stopped Watching requires a followed show with ≥1 watched episode.
      setStopped: (id, stopped, item) =>
        set((s) => {
          if (stopped) {
            return {
              stoppedShows: on(s.stoppedShows, id),
              watchlistShows: on(s.watchlistShows, id),
              libraryShows: item ? { ...s.libraryShows, [id]: { ...s.libraryShows[id], ...item } } : s.libraryShows,
            }
          }
          return { stoppedShows: off(s.stoppedShows, id) }
        }),
      followShow: (id, item) =>
        set((s) => ({
          watchlistShows: on(s.watchlistShows, id),
          libraryShows: item ? { ...s.libraryShows, [id]: { ...s.libraryShows[id], ...item } } : s.libraryShows,
          followedAt: { ...s.followedAt, [id]: s.followedAt[id] ?? Date.now() },
          addedAt: { ...s.addedAt, [id]: s.addedAt[id] ?? Date.now() },
        })),
      setFavoriteMovies: (ids) =>
        set((s) => {
          const favoriteMovies = { ...s.favoriteMovies }
          ids.forEach((id) => (favoriteMovies[id] = true))
          return { favoriteMovies }
        }),
      // Add-only favorite-show setter (never removes) — used by the TV Time
      // reconcile to restore the full curated favorites set idempotently.
      setFavoriteShows: (ids) =>
        set((s) => {
          const favoriteShows = { ...s.favoriteShows }
          ids.forEach((id) => (favoriteShows[id] = true))
          return { favoriteShows }
        }),
      // Upsert a show summary into the library cache (so any show you open
      // renders in grids even before following it).
      patchLibraryShow: (id, patch) =>
        set((s) => ({ libraryShows: { ...s.libraryShows, [id]: { ...s.libraryShows[id], ...patch } } })),
      patchLibraryMovie: (id, patch) =>
        set((s) => ({ libraryMovies: { ...s.libraryMovies, [id]: { ...s.libraryMovies[id], ...patch } } })),
      addList: (list) =>
        set((s) => ({ lists: [...s.lists, { ...list, id: `list_${Date.now()}_${s.lists.length}`, createdAt: Date.now() }] })),
      addToList: (listId, mediaId) =>
        set((s) => ({
          lists: s.lists.map((l) =>
            l.id === listId && !l.items.includes(mediaId) ? { ...l, items: [...l.items, mediaId] } : l,
          ),
        })),

      // ---- TV Time import: merge a batch of resolved shows into the library ----
      applyImportedShows: (entries) =>
        set((s) => {
          const watchlistShows = { ...s.watchlistShows }
          const favoriteShows = { ...s.favoriteShows }
          const ratings = { ...s.ratings }
          const libraryShows = { ...s.libraryShows }
          const followedAt = { ...s.followedAt }
          const lastWatched = { ...s.lastWatched }
          const addedAt = { ...s.addedAt }
          for (const e of entries) {
            libraryShows[e.id] = { ...libraryShows[e.id], ...e.item }
            if (e.followed) watchlistShows[e.id] = true
            if (e.favorite) favoriteShows[e.id] = true
            // Non-clobbering merges so re-running the import never overwrites
            // the user's newer in-app activity (recent watches, own ratings).
            if (e.rating != null && ratings[e.id] == null) ratings[e.id] = e.rating
            if (e.followedAt) followedAt[e.id] = followedAt[e.id] ?? e.followedAt
            if (e.lastWatched) lastWatched[e.id] = Math.max(lastWatched[e.id] ?? 0, e.lastWatched)
            addedAt[e.id] = addedAt[e.id] ?? e.followedAt ?? e.lastWatched ?? 0
          }
          return { watchlistShows, favoriteShows, ratings, libraryShows, followedAt, lastWatched, addedAt }
        }),
      applyImportedMovies: (entries) =>
        set((s) => {
          const favoriteMovies = { ...s.favoriteMovies }
          const libraryMovies = { ...s.libraryMovies }
          for (const it of entries) {
            libraryMovies[it.id] = { ...libraryMovies[it.id], ...it }
            favoriteMovies[it.id] = true
          }
          return { favoriteMovies, libraryMovies }
        }),
      // Bulk-import movies with watched/followed status and dates from TV Time.
      importMovies: (entries) =>
        set((s) => {
          const watchlistMovies = { ...s.watchlistMovies }
          const watchedMovies = { ...s.watchedMovies }
          const favoriteMovies = { ...s.favoriteMovies }
          const libraryMovies = { ...s.libraryMovies }
          const followedAt = { ...s.followedAt }
          const lastWatched = { ...s.lastWatched }
          const addedAt = { ...s.addedAt }
          for (const e of entries) {
            libraryMovies[e.id] = { ...libraryMovies[e.id], ...e.item }
            if (e.followed || e.watched || e.favorite) watchlistMovies[e.id] = true // watched/favorite implies tracked
            if (e.watched) watchedMovies[e.id] = true
            if (e.favorite) favoriteMovies[e.id] = true
            // Non-clobbering (see applyImportedShows).
            if (e.followedAt) followedAt[e.id] = followedAt[e.id] ?? e.followedAt
            if (e.watchedAt) lastWatched[e.id] = Math.max(lastWatched[e.id] ?? 0, e.watchedAt)
            addedAt[e.id] = addedAt[e.id] ?? e.followedAt ?? e.watchedAt ?? 0
          }
          return { watchlistMovies, watchedMovies, favoriteMovies, libraryMovies, followedAt, lastWatched, addedAt }
        }),
      setTvTimeImported: (v) => set(() => ({ tvTimeImported: v })),
      setTvTimeMoviesImported: (v) => set(() => ({ tvTimeMoviesImported: v })),
      setMigrationVersion: (v) => set(() => ({ migrationVersion: v })),
      markShowsResolved: (tvdbIds) =>
        set((s) => {
          const importedShowIds = { ...s.importedShowIds }
          tvdbIds.forEach((id) => (importedShowIds[id] = true))
          return { importedShowIds }
        }),
      markMoviesResolved: (keys) =>
        set((s) => {
          const importedMovieKeys = { ...s.importedMovieKeys }
          keys.forEach((k) => (importedMovieKeys[k] = true))
          return { importedMovieKeys }
        }),
      // Reconstruct per-episode watched state for an imported show (which only
      // has an aggregate seen-count) so season/episode indicators are consistent.
      // Runs only when the show has no per-episode watched data yet.
      backfillSeen: (showId, orderedReleasedEpIds, count) =>
        set((s) => {
          const prefix = showId + '_'
          const already = Object.keys(s.watchedEpisodes).some((k) => k.startsWith(prefix))
          if (already || count <= 0) return {}
          const next = { ...s.watchedEpisodes }
          orderedReleasedEpIds.slice(0, count).forEach((id) => (next[id] = true))
          return { watchedEpisodes: next }
        }),
    }),
    { name: 'the-watcher-library-v1' },
  ),
)

// ---- Derived helpers ----

/** Released episode ids for a show (airDate today or earlier). */
export function releasedEpisodeIds(show: Show): string[] {
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  const out: string[] = []
  for (const se of show.seasons)
    for (const e of se.episodes) {
      if (!e.airDate || new Date(e.airDate + 'T00:00:00') <= today) out.push(e.id)
    }
  return out
}

export function allEpisodeIds(show: Show): string[] {
  return show.seasons.flatMap((se) => se.episodes.map((e) => e.id))
}

/** Progress fraction (0..1) based on watched / released episodes. */
export function showProgress(show: Show, watched: IdMap): number {
  const released = releasedEpisodeIds(show)
  if (!released.length) return 0
  const done = released.filter((id) => watched[id]).length
  return done / released.length
}

/** Progress for a cached library item, from imported seen-count vs total. */
export function libraryProgress(item: LibraryItem): number {
  if (item.seen != null && item.totalEpisodes) return Math.min(item.seen / item.totalEpisodes, 1)
  return 0
}

/** Next unwatched, already-released episode for a show, if any. */
export function nextEpisode(show: Show, watched: IdMap) {
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  for (const se of show.seasons)
    for (const e of se.episodes) {
      const released = !e.airDate || new Date(e.airDate + 'T00:00:00') <= today
      if (released && !watched[e.id]) return e
    }
  return undefined
}
