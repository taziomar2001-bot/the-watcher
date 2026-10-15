import { effectiveSeen } from './status'
import type { TvEntry } from './status'
import type { MovieEntry } from './useLibraryData'
import type { TitleMeta } from '../data/tmdb'
import type { Media, Movie, Show, ContentKind, TrackMedia, Book, Game } from '../types'
import type { TrackMap } from '../store/useLibrary'

// Shared filters for "Pick for me" and "Watch together".

export type Kind = ContentKind
export type Source = 'anything' | 'watchlist' | 'not_started'
export interface Genre {
  id: number
  name: string
}
export interface LengthOpt {
  key: string
  label: string
  short: string
  min?: number
  max?: number
}

export const LENGTHS: Record<Kind, LengthOpt[]> = {
  movie: [
    { key: 'any', label: 'Any length', short: 'Any length' },
    { key: 'lt90', label: 'Under 1h30', short: '< 1h30', max: 89 },
    { key: '90-120', label: '1h30 – 2h', short: '1h30–2h', min: 90, max: 120 },
    { key: '120-150', label: '2h – 2h30', short: '2h–2h30', min: 121, max: 150 },
    { key: 'gt150', label: 'Over 2h30', short: '> 2h30', min: 151 },
  ],
  show: [
    { key: 'any', label: 'Any episode length', short: 'Any length' },
    { key: 'lt30', label: 'Under 30 min', short: '< 30 min', max: 29 },
    { key: '30-45', label: '30 – 45 min', short: '30–45 min', min: 30, max: 45 },
    { key: '45-60', label: '45 min – 1h', short: '45–60 min', min: 46, max: 60 },
    { key: 'gt60', label: 'Over 1h', short: '> 1h', min: 61 },
  ],
  // Books: page count.
  book: [
    { key: 'any', label: 'Any length', short: 'Any length' },
    { key: 'lt250', label: 'Under 250 pages', short: '< 250 p', max: 249 },
    { key: '250-400', label: '250 – 400 pages', short: '250–400 p', min: 250, max: 400 },
    { key: '400-600', label: '400 – 600 pages', short: '400–600 p', min: 401, max: 600 },
    { key: 'gt600', label: 'Over 600 pages', short: '> 600 p', min: 601 },
  ],
  // Games: hours to beat the main story (IGDB).
  game: [
    { key: 'any', label: 'Any length', short: 'Any length' },
    { key: 'lt10', label: 'Under 10 hours', short: '< 10 h', max: 9 },
    { key: '10-25', label: '10 – 25 hours', short: '10–25 h', min: 10, max: 25 },
    { key: '25-50', label: '25 – 50 hours', short: '25–50 h', min: 26, max: 50 },
    { key: 'gt50', label: 'Over 50 hours', short: '> 50 h', min: 51 },
  ],
}

export const SOURCES: Record<Kind, { key: Source; label: string; hint: string }[]> = {
  movie: [
    { key: 'anything', label: 'Anything', hint: 'Well-known movies you haven’t seen' },
    { key: 'watchlist', label: 'My watchlist', hint: 'Movies you follow and haven’t watched' },
  ],
  show: [
    { key: 'anything', label: 'Anything', hint: 'Well-known shows you haven’t started' },
    { key: 'watchlist', label: 'My watchlist', hint: 'Shows you follow and haven’t finished' },
    { key: 'not_started', label: 'Not started yet', hint: 'Shows you follow but never started' },
  ],
  book: [
    { key: 'anything', label: 'Anything', hint: 'Well-known books you haven’t read' },
    { key: 'watchlist', label: 'My books', hint: 'Books you follow and haven’t finished' },
    { key: 'not_started', label: 'Want to read', hint: 'Books you follow but haven’t started' },
  ],
  game: [
    { key: 'anything', label: 'Anything', hint: 'Well-known games you haven’t played' },
    { key: 'watchlist', label: 'My games', hint: 'Games you follow and haven’t finished' },
    { key: 'not_started', label: 'Backlog', hint: 'Games you follow but haven’t started' },
  ],
}

/** "Movie length", "Book length", "Time to beat"… */
export const LENGTH_TITLE: Record<Kind, string> = { movie: 'Movie length', show: 'Episode length', book: 'Book length', game: 'Time to beat (main story)' }
const KIND_WORD: Record<Kind, string> = { movie: 'movies', show: 'TV shows', book: 'books', game: 'games' }

export interface PickFilters {
  kind: Kind
  source: Source
  genre: Genre | null
  length: string // LengthOpt key
}

export const lengthOf = (kind: Kind, key: string) => LENGTHS[kind].find((l) => l.key === key) ?? LENGTHS[kind][0]
export const inLength = (opt: LengthOpt, minutes?: number) =>
  opt.key === 'any' || (minutes != null && minutes > 0 && (opt.min == null || minutes >= opt.min) && (opt.max == null || minutes <= opt.max))

export interface Candidate {
  id: string
  type: Kind
  title: string
  poster?: string
  year?: number
  score?: number
  votes?: number
  genres: string[]
  overview?: string
  runtime?: number
  media?: Media | TrackMedia
}

/** Candidates from a book or game. `runtime` holds pages / hours. */
export const fromTrack = (m: TrackMedia): Candidate => ({
  id: m.id,
  type: m.type,
  title: m.title,
  poster: m.poster,
  year: m.year,
  score: m.communityRating,
  votes: m.communityVotes,
  genres: m.genres,
  overview: m.overview,
  runtime: m.type === 'book' ? (m as Book).pageCount : (m as Game).timeToBeat?.normally,
})

/** Any catalogue title → candidate. */
export const fromAny = (m: Media | TrackMedia): Candidate => (m.type === 'book' || m.type === 'game' ? fromTrack(m as TrackMedia) : fromMedia(m as Media))

export const fromMedia = (m: Media): Candidate => ({
  id: m.id,
  type: m.type,
  title: m.title,
  poster: m.poster,
  year: m.type === 'movie' ? (m as Movie).year : (m as Show).firstAirYear,
  score: m.communityRating,
  votes: m.communityVotes,
  genres: m.genres,
  overview: m.overview,
  runtime: m.type === 'movie' ? (m as Movie).runtime : undefined,
})

/**
 * Titles from your own library that match. `unknown` = how many were left out
 * only because their length isn't known yet (their facts are still loading).
 */
export function libraryCandidates(
  f: PickFilters,
  shows: TvEntry[],
  movies: MovieEntry[],
  watchlistMovies: Record<string, true>,
  watchedEpisodes: Record<string, true>,
  meta: Record<string, TitleMeta>,
  tracks?: { book: TrackMap; game: TrackMap },
): { items: Candidate[]; unknown: string[] } {
  const len = lengthOf(f.kind, f.length)
  if (f.kind === 'book' || f.kind === 'game') {
    const items: Candidate[] = []
    for (const [id, t] of Object.entries(tracks?.[f.kind] ?? {})) {
      if (!t.followed || t.state === 'done' || t.state === 'stopped') continue
      if (f.source === 'not_started' && t.state) continue
      if (t.item.releaseDate && t.item.releaseDate > new Date().toISOString().slice(0, 10)) continue
      const genres = t.item.genres ?? []
      if (f.genre && !genres.includes(f.genre.name)) continue
      const size = f.kind === 'book' ? t.item.pageCount : t.item.ttb
      if (!inLength(len, size)) continue
      items.push({ id, type: f.kind, title: t.item.title, poster: t.item.poster, year: t.item.year, genres, runtime: size })
    }
    return { items, unknown: [] }
  }
  const unknown: string[] = []
  const out: Candidate[] = []
  const pool =
    f.kind === 'movie'
      ? movies.filter((e) => watchlistMovies[e.item.id] && e.status !== 'completed').map((e) => e.item)
      : shows
          .filter((e) => e.following && !e.stopped && e.cls !== 'finished')
          .filter((e) => f.source !== 'not_started' || effectiveSeen(e.item, watchedEpisodes) === 0)
          .map((e) => e.item)
  for (const it of pool) {
    const m = meta[`${f.kind}:${it.id}`]
    const genres = it.genres?.length ? it.genres : m?.g ?? []
    if (f.genre && !genres.includes(f.genre.name)) continue
    const runtime = f.kind === 'movie' ? it.runtime || m?.r : m?.r
    if (len.key !== 'any' && runtime == null) {
      if (!m) unknown.push(`${f.kind}:${it.id}`)
      continue
    }
    if (!inLength(len, runtime)) continue
    out.push({ id: it.id, type: f.kind, title: it.title, poster: it.poster, year: it.year ?? m?.y, score: m?.v, genres, runtime })
  }
  return { items: out, unknown }
}

export function describe(f: PickFilters): string {
  const len = lengthOf(f.kind, f.length)
  const src = SOURCES[f.kind].find((s) => s.key === f.source)
  return [
    f.source !== 'anything' ? src?.label : null,
    f.genre?.name,
    KIND_WORD[f.kind],
    len.key !== 'any' ? `· ${len.short}` : null,
  ]
    .filter(Boolean)
    .join(' ')
}
