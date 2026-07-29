import { findShowByTvdbId, findMovieByTvdbId, showMeta, searchMovieByName } from './tmdb'
import { TV_TIME_SHOWS, TV_TIME_FAVORITE_MOVIE_TVDB_IDS, TV_TIME_MOVIES } from './tvTimeImport'
import { useLibrary, type ImportedShow, type ImportedMovie, type LibraryItem } from '../store/useLibrary'
import { USE_TMDB } from './catalog'

// Run N promise-returning tasks with bounded concurrency.
async function pool<T>(items: T[], limit: number, worker: (t: T, i: number) => Promise<void>) {
  let idx = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const cur = idx++
      await worker(items[cur], cur)
    }
  })
  await Promise.all(runners)
}

let runningShows = false
let runningMovies = false

/**
 * One-time migration of TV Time TV history. Resolves TheTVDB ids to TMDB ids
 * via /find. Runs once, live-mode only, self-guarding.
 */
export async function runTVTimeImport(onProgress?: (done: number, total: number) => void): Promise<void> {
  if (runningShows) return
  const store = useLibrary.getState()
  if (!USE_TMDB || store.tvTimeImported) return
  runningShows = true

  try {
    const shows = TV_TIME_SHOWS
    const total = shows.length
    let done = 0
    let batch: ImportedShow[] = []
    const flush = () => {
      if (batch.length) {
        useLibrary.getState().applyImportedShows(batch)
        batch = []
      }
    }

    await pool(shows, 8, async (s) => {
      const summary = await findShowByTvdbId(s.tvdbId)
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
          // Fetch real episode/season totals + ended status for every watched show
          // (archived included) in ONE cheap request so classification (green
          // "Finished" / purple "Up to date" / yellow "in progress") is accurate
          // immediately — without waiting on the heavy per-season Up & Coming sync.
          const meta = await showMeta(summary.id)
          const total = meta?.episodes ?? s.seen
          item.totalEpisodes = total
          item.seasonCount = meta?.seasons
          item.ended = meta?.ended
          // An ended show has all its episodes released, so caught-up == finished.
          if (meta?.ended && total) item.releasedEpisodes = total
          // Guard against TV Time's "seen everything" sentinel (e.g. 999) inflating
          // counts — a show can't have more watched episodes than it has.
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
        if (batch.length >= 20) flush()
      }
      done++
      onProgress?.(done, total)
    })
    flush()

    // Best-effort favorite movies from the TV Time lists (TheTVDB movie ids).
    const movieItems: LibraryItem[] = []
    await pool(TV_TIME_FAVORITE_MOVIE_TVDB_IDS, 4, async (id) => {
      const m = await findMovieByTvdbId(id)
      if (m) movieItems.push({ id: m.id, type: 'movie', title: m.title, poster: m.poster, backdrop: m.backdrop, year: m.year })
    })
    if (movieItems.length) useLibrary.getState().applyImportedMovies(movieItems)

    useLibrary.getState().setTvTimeImported(true)
  } finally {
    runningShows = false
  }
}

/**
 * One-time migration of TV Time MOVIE history (watched / followed / runtimes /
 * dates). Resolves each title to a TMDB movie by name + year. Runs once,
 * live-mode only. Separate flag so already-imported accounts still get movies.
 */
export async function runMovieImport(onProgress?: (done: number, total: number) => void): Promise<void> {
  if (runningMovies) return
  const store = useLibrary.getState()
  if (!USE_TMDB || store.tvTimeMoviesImported) return
  runningMovies = true

  try {
    const movies = TV_TIME_MOVIES
    const total = movies.length
    let done = 0
    let batch: ImportedMovie[] = []
    const flush = () => {
      if (batch.length) {
        useLibrary.getState().importMovies(batch)
        batch = []
      }
    }

    await pool(movies, 8, async (mv) => {
      const summary = await searchMovieByName(mv.n, mv.y)
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
        if (batch.length >= 25) flush()
      }
      done++
      onProgress?.(done, total)
    })
    flush()

    useLibrary.getState().setTvTimeMoviesImported(true)
  } finally {
    runningMovies = false
  }
}

export const MIGRATION_VERSION = 3
let runningReconcile = false

/**
 * Idempotent reconciliation for already-imported accounts. Enriches every
 * watched show with real episode totals + ended status (so Finished / Up-to-date
 * / in-progress colours are correct without the heavy Up & Coming sync), restores
 * the full favourites set, and restores favorite movies. Safe to run repeatedly.
 */
export async function runReconcile(): Promise<void> {
  if (runningReconcile) return
  const store = useLibrary.getState()
  if (!USE_TMDB || store.migrationVersion >= MIGRATION_VERSION) return
  runningReconcile = true
  try {
    // 1. Enrich EVERY watched show (not just archived) with real totals + ended
    //    status in one cheap request each, so classification is correct up-front.
    const watchedIds = Object.values(store.libraryShows)
      .filter((it) => (it.seen ?? 0) > 0)
      .map((it) => it.id)
    await pool(watchedIds, 8, async (id) => {
      const it = useLibrary.getState().libraryShows[id]
      const meta = await showMeta(id)
      const patch: Partial<LibraryItem> = { archived: false }
      if (meta?.episodes) {
        patch.totalEpisodes = meta.episodes
        patch.seasonCount = meta.seasons
      }
      if (meta?.ended != null) patch.ended = meta.ended
      const total = patch.totalEpisodes ?? it?.totalEpisodes
      if (meta?.ended && total) patch.releasedEpisodes = total
      if (total && it?.seen != null && it.seen > total) patch.seen = total
      useLibrary.getState().patchLibraryShow(id, patch)
    })

    // 1b. Restore the full curated favourites set (union of every TV Time
    //     favourite source — some were previously dropped). Resolve to TMDB ids.
    const favShowIds: string[] = []
    await pool(
      TV_TIME_SHOWS.filter((s) => s.favorite),
      6,
      async (s) => {
        const summary = await findShowByTvdbId(s.tvdbId)
        if (summary) favShowIds.push(summary.id)
      },
    )
    if (favShowIds.length) useLibrary.getState().setFavoriteShows(favShowIds)

    // 2. Restore favorite movies (resolve the flagged titles, mark favorite).
    const favMovies = TV_TIME_MOVIES.filter((m) => m.fav)
    const favIds: string[] = []
    await pool(favMovies, 6, async (mv) => {
      const summary = await searchMovieByName(mv.n, mv.y)
      if (summary) {
        useLibrary.getState().importMovies([
          {
            id: summary.id,
            item: {
              id: summary.id,
              type: 'movie',
              title: summary.title || mv.n,
              poster: summary.poster,
              backdrop: summary.backdrop,
              year: summary.year ?? mv.y,
              runtime: mv.rt,
              releaseDate: mv.rd,
            },
            watched: !!mv.w,
            followed: true,
            favorite: true,
            followedAt: mv.fa,
            watchedAt: mv.wd ? Date.parse(mv.wd + 'T00:00:00') || undefined : undefined,
          },
        ])
        favIds.push(summary.id)
      }
    })
    if (favIds.length) useLibrary.getState().setFavoriteMovies(favIds)

    useLibrary.getState().setMigrationVersion(MIGRATION_VERSION)
  } finally {
    runningReconcile = false
  }
}
