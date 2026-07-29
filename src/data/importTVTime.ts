import { create } from 'zustand'
import { findShowByTvdbId, searchShowByName, findMovieByTvdbId, showMeta, searchMovieByName } from './tmdb'
import { TV_TIME_SHOWS, TV_TIME_FAVORITE_MOVIE_TVDB_IDS, TV_TIME_MOVIES } from './tvTimeImport'
import { useLibrary, type ImportedShow, type ImportedMovie, type LibraryItem } from '../store/useLibrary'
import { USE_TMDB } from './catalog'

// Run N promise-returning tasks with bounded concurrency.
async function pool<T>(items: T[], limit: number, worker: (t: T) => Promise<void>) {
  let idx = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) await worker(items[idx++])
  })
  await Promise.all(runners)
}

// ---------------------------------------------------------------------------
// Resumable, self-healing TV Time migration.
//
// The full history (471 shows, 1451 movies) ships baked into the app as
// TheTVDB ids / titles. The FIRST time the app runs on an internet-connected
// device it resolves each item to its TMDB counterpart (id + poster + totals +
// ended status) and records it in a per-item ledger (importedShowIds /
// importedMovieKeys). Every later launch skips everything already resolved, so
// once the library is complete the migration makes zero network calls — the
// resolved library is the permanent base, backed up to the account's cloud.
//
// Nothing is ever dropped silently: an item that fails to resolve is simply not
// marked done, so it is retried on the next launch (and can be force-retried
// from Settings). Merges never overwrite newer in-app activity.
// ---------------------------------------------------------------------------

export interface ImportStatus {
  running: boolean
  phase: 'idle' | 'shows' | 'movies' | 'done'
  showsTotal: number
  showsResolved: number
  showsFailed: number
  moviesTotal: number
  moviesResolved: number
  moviesFailed: number
  _set: (p: Partial<ImportStatus>) => void
}

/** Live progress of the migration (not persisted) — drives the Settings panel. */
export const useImportStatus = create<ImportStatus>((set) => ({
  running: false,
  phase: 'idle',
  showsTotal: 0,
  showsResolved: 0,
  showsFailed: 0,
  moviesTotal: 0,
  moviesResolved: 0,
  moviesFailed: 0,
  _set: (p) => set(p),
}))

const movieKey = (m: { n: string; y?: number }) => `${m.n}|${m.y ?? ''}`

let running = false

async function importShows(force: boolean): Promise<void> {
  const st = useImportStatus.getState()
  const ledger = useLibrary.getState().importedShowIds
  const pending = TV_TIME_SHOWS.filter((s) => force || !ledger[String(s.tvdbId)])
  st._set({ phase: 'shows', showsTotal: TV_TIME_SHOWS.length })
  if (!pending.length) return

  let resolved = 0
  let failed = 0
  let batch: ImportedShow[] = []
  const doneIds: string[] = []
  const flush = () => {
    if (batch.length) {
      useLibrary.getState().applyImportedShows(batch)
      batch = []
    }
  }

  await pool(pending, 5, async (s) => {
    // Resolve by TheTVDB id first, then fall back to a title search (recovers
    // shows whose TheTVDB id has no TMDB cross-link).
    let summary = await findShowByTvdbId(s.tvdbId)
    if (!summary) summary = await searchShowByName(s.name)
    if (summary) {
      const item: LibraryItem = {
        id: summary.id,
        type: 'show',
        title: summary.title || s.name,
        poster: summary.poster,
        backdrop: summary.backdrop,
        year: summary.year,
        seen: s.seen,
        archived: s.archived,
      }
      if (s.seen > 0) {
        // One cheap request gives real totals + ended status, so classification
        // (green Finished / purple Up-to-date / yellow in-progress) is correct
        // immediately — no dependency on the heavy Up & Coming sync.
        const meta = await showMeta(summary.id)
        const total = meta?.episodes ?? s.seen
        item.totalEpisodes = total
        item.seasonCount = meta?.seasons
        item.ended = meta?.ended
        if (meta?.ended && total) item.releasedEpisodes = total
        // Cap TV Time's "seen everything" sentinel (e.g. 999) to real totals.
        if (total && item.seen != null && item.seen > total) item.seen = total
      }
      batch.push({
        id: summary.id,
        item,
        followed: s.followed || s.seen > 0,
        favorite: s.favorite,
        rating: s.rating,
        followedAt: s.followedAt,
        lastWatched: s.lastWatched,
      })
      doneIds.push(String(s.tvdbId))
      resolved++
      if (batch.length >= 20) flush()
    } else {
      failed++
    }
    useImportStatus.getState()._set({ showsResolved: resolved, showsFailed: failed })
  })
  flush()
  if (doneIds.length) useLibrary.getState().markShowsResolved(doneIds)
}

async function importMoviesPhase(force: boolean): Promise<void> {
  const st = useImportStatus.getState()
  const ledger = useLibrary.getState().importedMovieKeys
  const pending = TV_TIME_MOVIES.filter((m) => force || !ledger[movieKey(m)])
  st._set({ phase: 'movies', moviesTotal: TV_TIME_MOVIES.length })

  let resolved = 0
  let failed = 0
  let batch: ImportedMovie[] = []
  const doneKeys: string[] = []
  const flush = () => {
    if (batch.length) {
      useLibrary.getState().importMovies(batch)
      batch = []
    }
  }

  if (pending.length) {
    await pool(pending, 5, async (mv) => {
      // Match by title + year, then retry without the year constraint.
      let summary = await searchMovieByName(mv.n, mv.y)
      if (!summary && mv.y) summary = await searchMovieByName(mv.n)
      if (summary) {
        const item: LibraryItem = {
          id: summary.id,
          type: 'movie',
          title: summary.title || mv.n,
          poster: summary.poster,
          backdrop: summary.backdrop,
          year: summary.year ?? mv.y,
          runtime: mv.rt,
          releaseDate: mv.rd,
        }
        batch.push({
          id: summary.id,
          item,
          watched: !!mv.w,
          followed: !!mv.f,
          favorite: !!mv.fav,
          followedAt: mv.fa,
          watchedAt: mv.wd ? Date.parse(mv.wd + 'T00:00:00') || undefined : undefined,
        })
        doneKeys.push(movieKey(mv))
        resolved++
        if (batch.length >= 25) flush()
      } else {
        failed++
      }
      useImportStatus.getState()._set({ moviesResolved: resolved, moviesFailed: failed })
    })
    flush()
    if (doneKeys.length) useLibrary.getState().markMoviesResolved(doneKeys)

    // Legacy favourite-movies pulled straight from the TV Time list by TheTVDB
    // id (idempotent, add-only). Only while there's work to do, so a fully
    // migrated library makes no calls at all. Cheap safety net for favourites.
    const favItems: LibraryItem[] = []
    await pool(TV_TIME_FAVORITE_MOVIE_TVDB_IDS, 4, async (id) => {
      const m = await findMovieByTvdbId(id)
      if (m) favItems.push({ id: m.id, type: 'movie', title: m.title, poster: m.poster, backdrop: m.backdrop, year: m.year })
    })
    if (favItems.length) useLibrary.getState().applyImportedMovies(favItems)
  }
}

/**
 * Resolve everything still outstanding (or, with force, re-resolve the whole
 * history). Safe to call on every launch and to trigger manually — converges to
 * a complete library, then does nothing.
 */
export async function runFullImport(force = false): Promise<void> {
  if (running || !USE_TMDB) return
  running = true
  useImportStatus.getState()._set({ running: true })
  try {
    await importShows(force)
    if (!useLibrary.getState().tvTimeImported) useLibrary.getState().setTvTimeImported(true)
    await importMoviesPhase(force)
    if (!useLibrary.getState().tvTimeMoviesImported) useLibrary.getState().setTvTimeMoviesImported(true)
    useImportStatus.getState()._set({ phase: 'done' })
  } finally {
    running = false
    useImportStatus.getState()._set({ running: false })
  }
}
