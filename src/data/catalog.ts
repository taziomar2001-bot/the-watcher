import type { Show, Movie, UpcomingEpisode, Media } from '../types'
import { SHOWS, MOVIES, SHOWS_BY_ID, MOVIES_BY_ID } from './mock'
import * as tmdb from './tmdb'

// Toggle: use live TMDB when a key is configured, otherwise rich mock data.
export const USE_TMDB = Boolean(import.meta.env.VITE_TMDB_KEY || import.meta.env.VITE_TMDB_TOKEN)

const wait = <T>(v: T): Promise<T> => Promise.resolve(v)

// ---- In-memory cache so tab switches / re-opens don't refetch ----
interface CacheEntry {
  at: number
  promise: Promise<unknown>
}
const _cache = new Map<string, CacheEntry>()
const MIN = 60_000

/** Memoize an async factory by key for `ttl` ms. Dedupes in-flight calls. */
function cached<T>(key: string, ttl: number, factory: () => Promise<T>): Promise<T> {
  const hit = _cache.get(key)
  if (hit && Date.now() - hit.at < ttl) return hit.promise as Promise<T>
  const promise = factory().catch((e) => {
    _cache.delete(key) // don't cache failures
    throw e
  })
  _cache.set(key, { at: Date.now(), promise })
  return promise as Promise<T>
}

function daysBetween(iso: string): number {
  const target = new Date(iso + 'T00:00:00')
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - now.getTime()) / 86400000)
}

// ---- Shows ----
export async function allShows(): Promise<Show[]> {
  if (USE_TMDB) return cached('allShows', 15 * MIN, () => tmdb.allShows())
  return wait(SHOWS)
}

export async function getShow(id: string): Promise<Show | undefined> {
  if (USE_TMDB) return cached('show:' + id, 30 * MIN, () => tmdb.getShow(id))
  return wait(SHOWS_BY_ID[id])
}

export async function trendingShows(): Promise<Show[]> {
  if (USE_TMDB) return cached('trendingShows', 30 * MIN, () => tmdb.trendingShows())
  return wait([...SHOWS].sort((a, b) => (b.communityRating ?? 0) - (a.communityRating ?? 0)))
}

// ---- Movies ----
export async function allMovies(): Promise<Movie[]> {
  if (USE_TMDB) return cached('allMovies', 15 * MIN, () => tmdb.allMovies())
  return wait(MOVIES)
}

export async function getMovie(id: string): Promise<Movie | undefined> {
  if (USE_TMDB) return cached('movie:' + id, 30 * MIN, () => tmdb.getMovie(id))
  return wait(MOVIES_BY_ID[id])
}

export async function trendingMovies(): Promise<Movie[]> {
  if (USE_TMDB) return cached('trendingMovies', 30 * MIN, () => tmdb.trendingMovies())
  return wait([...MOVIES].sort((a, b) => (b.communityRating ?? 0) - (a.communityRating ?? 0)))
}

/** Upcoming (unreleased) movies sorted by soonest release, with day countdowns. */
export async function upcomingMovies(): Promise<Movie[]> {
  const movies = USE_TMDB ? await tmdb.upcomingMovies() : MOVIES
  return movies
    .filter((m) => m.releaseDate && daysBetween(m.releaseDate) > 0)
    .sort((a, b) => daysBetween(a.releaseDate!) - daysBetween(b.releaseDate!))
}

/** Days until a movie releases (>=0). */
export function daysUntil(iso?: string): number {
  if (!iso) return 0
  return Math.max(0, daysBetween(iso))
}

// ---- Upcoming episode calendar ----
/**
 * Flattens episodes from the given shows (or all shows) into a date-sorted
 * release calendar spanning a window around now.
 */
export async function upcomingEpisodes(showIds?: string[]): Promise<UpcomingEpisode[]> {
  let shows: Show[]
  if (USE_TMDB && showIds && showIds.length) {
    // In live mode, summaries carry no episodes — fetch full details per show.
    shows = (await Promise.all(showIds.map((id) => tmdb.getShow(id)))).filter(Boolean) as Show[]
  } else {
    shows = (await allShows()).filter((s) => !showIds || showIds.includes(s.id))
  }
  const out: UpcomingEpisode[] = []
  for (const s of shows) {
    for (const se of s.seasons) {
      for (const e of se.episodes) {
        if (!e.airDate) continue
        const delta = daysBetween(e.airDate)
        if (delta < -5 || delta > 45) continue // window: recent past → next 6 weeks
        out.push({
          showId: s.id,
          showTitle: s.title,
          poster: s.poster,
          still: e.still,
          season: e.season,
          number: e.number,
          episodeTitle: e.title,
          airDate: e.airDate,
          airTime: e.airTime ?? '03:00',
          network: s.network,
          released: delta <= 0,
          isNew: delta >= 0 && delta <= 2,
          isLatest: e.number === se.episodes.length,
        })
      }
    }
  }
  return out.sort((a, b) => a.airDate.localeCompare(b.airDate) || a.airTime.localeCompare(b.airTime))
}

// ---- Search ----
export async function search(query: string): Promise<Media[]> {
  const q = query.trim().toLowerCase()
  if (!q) return []
  if (USE_TMDB) return tmdb.search(query)
  const hits: Media[] = [...SHOWS, ...MOVIES].filter(
    (m) => m.title.toLowerCase().includes(q) || m.genres.some((g) => g.toLowerCase().includes(q)),
  )
  return wait(hits)
}

export const TRENDING_SEARCHES = ['Silo', 'Dune', 'The Bear', 'Severance', 'Fallout', 'Shōgun']

// ---- Discover sections ----
export interface DiscoverSection<T> {
  key: string
  title: string
  items: T[]
}

function byYearDesc<T extends { firstAirYear?: number; year?: number }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => ((b.firstAirYear ?? b.year ?? 0) - (a.firstAirYear ?? a.year ?? 0)))
}

export function discoverShows(): Promise<DiscoverSection<Show>[]> {
  return cached('discoverShows', 15 * MIN, _discoverShows)
}
async function _discoverShows(): Promise<DiscoverSection<Show>[]> {
  if (USE_TMDB) {
    const [trending, popular, airing] = await Promise.all([
      tmdb.trendingShows(),
      tmdb.allShows(),
      tmdb.onTheAirShows(),
    ])
    return [
      { key: 'trending', title: 'Trending', items: trending },
      { key: 'popular', title: 'Popular', items: popular },
      { key: 'airing', title: 'Currently Airing', items: airing },
      { key: 'new', title: 'New Releases', items: byYearDesc(popular) },
      { key: 'soon', title: 'Coming Soon', items: [...airing].reverse() },
    ]
  }
  const rated = [...SHOWS].sort((a, b) => (b.communityRating ?? 0) - (a.communityRating ?? 0))
  const airing = SHOWS.filter((s) => s.status === 'Returning Series')
  return [
    { key: 'trending', title: 'Trending', items: rated },
    { key: 'popular', title: 'Popular', items: [...rated].reverse() },
    { key: 'airing', title: 'Currently Airing', items: airing },
    { key: 'new', title: 'New Releases', items: byYearDesc(SHOWS) },
    { key: 'soon', title: 'Coming Soon', items: byYearDesc(SHOWS).reverse() },
  ]
}

export function discoverMovies(): Promise<DiscoverSection<Movie>[]> {
  return cached('discoverMovies', 15 * MIN, _discoverMovies)
}
async function _discoverMovies(): Promise<DiscoverSection<Movie>[]> {
  if (USE_TMDB) {
    const [trending, popular, nowPlaying, soon] = await Promise.all([
      tmdb.trendingMovies(),
      tmdb.allMovies(),
      tmdb.nowPlayingMovies(),
      tmdb.upcomingMovies(),
    ])
    return [
      { key: 'trending', title: 'Trending', items: trending },
      { key: 'popular', title: 'Popular', items: popular },
      { key: 'playing', title: 'Now Playing', items: nowPlaying },
      { key: 'new', title: 'New Releases', items: byYearDesc(nowPlaying) },
      { key: 'soon', title: 'Coming Soon', items: soon },
    ]
  }
  const rated = [...MOVIES].sort((a, b) => (b.communityRating ?? 0) - (a.communityRating ?? 0))
  const now = new Date().toISOString().slice(0, 10)
  const released = MOVIES.filter((m) => m.releaseDate && m.releaseDate <= now)
  const soon = MOVIES.filter((m) => m.releaseDate && m.releaseDate > now)
  return [
    { key: 'trending', title: 'Trending', items: rated },
    { key: 'popular', title: 'Popular', items: [...rated].reverse() },
    { key: 'playing', title: 'Now Playing', items: released },
    { key: 'new', title: 'New Releases', items: byYearDesc(released) },
    { key: 'soon', title: 'Coming Soon', items: soon },
  ]
}
