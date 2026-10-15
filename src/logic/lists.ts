import type { CustomList, LibraryItem, ListKind, RefMeta } from '../store/useLibrary'

// ---------------------------------------------------------------------------
// List items are typed refs:
//   show:ID · movie:ID · season:SHOW_ID:N · episode:SHOW_ID:S:E
// A list's kind decides which refs it takes. "mixed" (every list made before
// typed lists existed) takes shows and movies together.
// ---------------------------------------------------------------------------

export type RefType = 'show' | 'movie' | 'season' | 'episode'

export interface ParsedRef {
  type: RefType
  /** The movie id, or the show id for show / season / episode refs. */
  id: string
  season?: number
  episode?: number
}

export function parseItemRef(ref: string): ParsedRef {
  const [type, id, s, e] = ref.split(':')
  return {
    type: (type as RefType) || 'movie',
    id: id ?? '',
    season: s != null ? Number(s) : undefined,
    episode: e != null ? Number(e) : undefined,
  }
}

export const showRef = (id: string) => `show:${id}`
export const movieRef = (id: string) => `movie:${id}`
export const seasonRef = (showId: string, season: number) => `season:${showId}:${season}`
export const episodeRef = (showId: string, season: number, episode: number) => `episode:${showId}:${season}:${episode}`

export const LIST_KINDS: { key: ListKind; label: string; hint: string }[] = [
  { key: 'mixed', label: 'Mixed', hint: 'Shows and movies together' },
  { key: 'shows', label: 'Shows', hint: 'Whole TV shows' },
  { key: 'seasons', label: 'Seasons', hint: 'Individual seasons' },
  { key: 'episodes', label: 'Episodes', hint: 'Individual episodes' },
  { key: 'movies', label: 'Movies', hint: 'Films only' },
]

export function kindAccepts(kind: ListKind | undefined, ref: string): boolean {
  const t = parseItemRef(ref).type
  switch (kind ?? 'mixed') {
    case 'mixed':
      return t === 'show' || t === 'movie'
    case 'shows':
      return t === 'show'
    case 'movies':
      return t === 'movie'
    case 'seasons':
      return t === 'season'
    case 'episodes':
      return t === 'episode'
  }
}

/** Which kind a new list should default to for a given first item. */
export function kindForRef(ref: string): ListKind {
  const t = parseItemRef(ref).type
  return t === 'season' ? 'seasons' : t === 'episode' ? 'episodes' : 'mixed'
}

export function refLink(ref: string): string {
  const p = parseItemRef(ref)
  if (p.type === 'movie') return `/movie/${p.id}`
  if (p.type === 'show') return `/show/${p.id}`
  if (p.type === 'season') return `/show/${p.id}/season/${p.season}`
  return `/show/${p.id}/season/${p.season}/episode/${p.episode}`
}

const pad = (n?: number) => String(n ?? 0).padStart(2, '0')
export const episodeCode = (s?: number, e?: number) => `S${pad(s)} E${pad(e)}`

export interface ResolvedItem {
  ref: string
  type: RefType
  link: string
  title: string
  sub?: string
  poster?: string
  year?: number
}

interface Sources {
  libraryShows: Record<string, LibraryItem>
  libraryMovies: Record<string, LibraryItem>
}

/** Everything needed to draw a list item, from the library cache or the list's own snapshot. */
export function resolveItem(ref: string, lib: Sources, meta?: Record<string, RefMeta>): ResolvedItem | null {
  const p = parseItemRef(ref)
  const m = meta?.[ref]
  const link = refLink(ref)
  if (p.type === 'show' || p.type === 'movie') {
    const it = p.type === 'show' ? lib.libraryShows[p.id] : lib.libraryMovies[p.id]
    if (!it && !m) return null
    return { ref, type: p.type, link, title: it?.title ?? m!.t, poster: it?.poster ?? m?.p, year: it?.year ?? m?.y, sub: m?.s }
  }
  const show = lib.libraryShows[p.id]
  const showTitle = m?.s ?? show?.title ?? ''
  if (p.type === 'season') {
    return { ref, type: 'season', link, title: m?.t ?? `Season ${p.season}`, sub: showTitle, poster: m?.p ?? show?.poster, year: m?.y }
  }
  return {
    ref,
    type: 'episode',
    link,
    title: m?.t ?? episodeCode(p.season, p.episode),
    sub: `${showTitle ? showTitle + ' · ' : ''}${episodeCode(p.season, p.episode)}`,
    poster: m?.p ?? show?.backdrop ?? show?.poster,
    year: m?.y,
  }
}

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`

/** "9 Movies · 7 TV Shows", "12 Episodes", "No titles" — never a bare total. */
export function listSummary(list: Pick<CustomList, 'items'>): string {
  let movies = 0
  let shows = 0
  let seasons = 0
  let episodes = 0
  for (const r of list.items) {
    const t = r.slice(0, r.indexOf(':'))
    if (t === 'movie') movies++
    else if (t === 'show') shows++
    else if (t === 'season') seasons++
    else if (t === 'episode') episodes++
  }
  const parts: string[] = []
  if (movies) parts.push(plural(movies, 'Movie'))
  if (shows) parts.push(plural(shows, 'TV Show'))
  if (seasons) parts.push(plural(seasons, 'Season'))
  if (episodes) parts.push(plural(episodes, 'Episode'))
  return parts.length ? parts.join(' · ') : 'No titles'
}

export const kindLabel = (k?: ListKind) => LIST_KINDS.find((x) => x.key === (k ?? 'mixed'))!.label
