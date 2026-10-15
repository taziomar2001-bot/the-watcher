import { effectiveSeen } from './status'
import type { TvEntry } from './status'
import type { MovieEntry } from './useLibraryData'
import type { TitleMeta } from '../data/tmdb'
import type { Media, Movie, Show } from '../types'

// Shared filters for "Pick for me" and "Watch together".

export type Kind = 'movie' | 'show'
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
}

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
  media?: Media
}

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
): { items: Candidate[]; unknown: string[] } {
  const len = lengthOf(f.kind, f.length)
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
    f.kind === 'movie' ? 'movies' : 'TV shows',
    len.key !== 'any' ? `· ${len.short}` : null,
  ]
    .filter(Boolean)
    .join(' ')
}
