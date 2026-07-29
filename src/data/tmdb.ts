import type { Show, Movie, Media, Season, Episode } from '../types'

// ---------------------------------------------------------------------------
// Live TMDB client. Activated automatically when a key/token is present in env:
//   VITE_TMDB_TOKEN  -> v4 read access token (recommended, Bearer auth)
//   VITE_TMDB_KEY    -> v3 api key (query param)
// The whole app also runs fully on mock data when neither is set.
// ---------------------------------------------------------------------------

const TOKEN = import.meta.env.VITE_TMDB_TOKEN as string | undefined
const KEY = import.meta.env.VITE_TMDB_KEY as string | undefined

const API = 'https://api.themoviedb.org/3'
const IMG = 'https://image.tmdb.org/t/p'

const img = (path: string | null, size = 'w500') => (path ? `${IMG}/${size}${path}` : undefined)

async function api<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(API + path)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
  if (KEY && !TOKEN) url.searchParams.set('api_key', KEY)
  const res = await fetch(url.toString(), {
    headers: TOKEN ? { Authorization: `Bearer ${TOKEN}`, accept: 'application/json' } : { accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`TMDB ${res.status} on ${path}`)
  return res.json() as Promise<T>
}

const GENRE_CACHE: Record<'tv' | 'movie', Record<number, string>> = { tv: {}, movie: {} }
async function genreMap(kind: 'tv' | 'movie'): Promise<Record<number, string>> {
  if (Object.keys(GENRE_CACHE[kind]).length) return GENRE_CACHE[kind]
  const data = await api<{ genres: { id: number; name: string }[] }>(`/genre/${kind}/list`)
  data.genres.forEach((g) => (GENRE_CACHE[kind][g.id] = g.name))
  return GENRE_CACHE[kind]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function mapShow(r: any, gm: Record<number, string>): Promise<Show> {
  return {
    id: String(r.id),
    type: 'show',
    title: r.name,
    poster: img(r.poster_path),
    backdrop: img(r.backdrop_path, 'w780'),
    overview: r.overview ?? '',
    genres: (r.genre_ids ?? r.genres?.map((g: { id: number }) => g.id) ?? []).map((id: number) => gm[id]).filter(Boolean),
    status: r.status ?? 'Returning Series',
    network: r.networks?.[0]?.name ?? '',
    platforms: r.networks?.map((n: { name: string }) => n.name) ?? [],
    firstAirYear: r.first_air_date ? Number(r.first_air_date.slice(0, 4)) : undefined,
    communityRating: r.vote_average,
    seasons: [],
    totalEpisodes: r.number_of_episodes ?? 0,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapMovie(r: any, gm: Record<number, string>): Movie {
  return {
    id: String(r.id),
    type: 'movie',
    title: r.title,
    poster: img(r.poster_path),
    backdrop: img(r.backdrop_path, 'w780'),
    overview: r.overview ?? '',
    genres: (r.genre_ids ?? r.genres?.map((g: { id: number }) => g.id) ?? []).map((id: number) => gm[id]).filter(Boolean),
    releaseDate: r.release_date || undefined,
    runtime: r.runtime,
    platforms: ['In Theaters'],
    communityRating: r.vote_average,
    year: r.release_date ? Number(r.release_date.slice(0, 4)) : undefined,
  }
}

export async function trendingShows(): Promise<Show[]> {
  const [data, gm] = await Promise.all([
    api<{ results: unknown[] }>('/trending/tv/week'),
    genreMap('tv'),
  ])
  return Promise.all(data.results.map((r) => mapShow(r, gm)))
}

export async function allShows(): Promise<Show[]> {
  const [data, gm] = await Promise.all([api<{ results: unknown[] }>('/tv/popular'), genreMap('tv')])
  return Promise.all(data.results.map((r) => mapShow(r, gm)))
}

export async function getShow(id: string): Promise<Show | undefined> {
  const gm = await genreMap('tv')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = await api<any>(`/tv/${id}`)
  const base = await mapShow(r, gm)
  // Fetch each season's episodes (skip specials / season 0).
  const seasons: Season[] = []
  for (const s of r.seasons ?? []) {
    if (s.season_number === 0) continue
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sd = await api<any>(`/tv/${id}/season/${s.season_number}`)
      const episodes: Episode[] = (sd.episodes ?? []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (e: any): Episode => ({
          id: `${id}_s${e.season_number}e${e.episode_number}`,
          season: e.season_number,
          number: e.episode_number,
          title: e.name,
          overview: e.overview,
          airDate: e.air_date || undefined,
          airTime: '03:00',
          still: img(e.still_path, 'w300'),
          runtime: e.runtime,
        }),
      )
      seasons.push({ season: s.season_number, name: s.name, episodes })
    } catch {
      /* ignore a failed season */
    }
  }
  return { ...base, seasons, totalEpisodes: seasons.reduce((n, s) => n + s.episodes.length, 0) }
}

export async function trendingMovies(): Promise<Movie[]> {
  const [data, gm] = await Promise.all([api<{ results: unknown[] }>('/trending/movie/week'), genreMap('movie')])
  return data.results.map((r) => mapMovie(r, gm))
}

export async function allMovies(): Promise<Movie[]> {
  const [data, gm] = await Promise.all([api<{ results: unknown[] }>('/movie/popular'), genreMap('movie')])
  return data.results.map((r) => mapMovie(r, gm))
}

export async function upcomingMovies(): Promise<Movie[]> {
  const [data, gm] = await Promise.all([api<{ results: unknown[] }>('/movie/upcoming'), genreMap('movie')])
  return data.results.map((r) => mapMovie(r, gm))
}

export async function nowPlayingMovies(): Promise<Movie[]> {
  const [data, gm] = await Promise.all([api<{ results: unknown[] }>('/movie/now_playing'), genreMap('movie')])
  return data.results.map((r) => mapMovie(r, gm))
}

export async function onTheAirShows(): Promise<Show[]> {
  const [data, gm] = await Promise.all([api<{ results: unknown[] }>('/tv/on_the_air'), genreMap('tv')])
  return Promise.all(data.results.map((r) => mapShow(r, gm)))
}

export async function airingTodayShows(): Promise<Show[]> {
  const [data, gm] = await Promise.all([api<{ results: unknown[] }>('/tv/airing_today'), genreMap('tv')])
  return Promise.all(data.results.map((r) => mapShow(r, gm)))
}

export async function getMovie(id: string): Promise<Movie | undefined> {
  const gm = await genreMap('movie')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = await api<any>(`/movie/${id}`, { append_to_response: 'credits' })
  const m = mapMovie(r, gm)
  m.director = r.credits?.crew?.find((c: { job: string; name: string }) => c.job === 'Director')?.name
  m.cast = r.credits?.cast?.slice(0, 10).map((c: { name: string }) => c.name)
  return m
}

// ---- External-ID resolution (TheTVDB -> TMDB), used by the TV Time import ----

export interface ResolvedSummary {
  id: string
  title: string
  poster?: string
  backdrop?: string
  year?: number
}

/** Resolve a TheTVDB series id to a TMDB show summary via /find. */
export async function findShowByTvdbId(tvdbId: number): Promise<ResolvedSummary | null> {
  try {
    const data = await api<{
      tv_results: { id: number; name: string; poster_path: string | null; backdrop_path: string | null; first_air_date?: string }[]
    }>(`/find/${tvdbId}`, { external_source: 'tvdb_id' })
    const r = data.tv_results?.[0]
    if (!r) return null
    return {
      id: String(r.id),
      title: r.name,
      poster: img(r.poster_path),
      backdrop: img(r.backdrop_path, 'w780'),
      year: r.first_air_date ? Number(r.first_air_date.slice(0, 4)) : undefined,
    }
  } catch {
    return null
  }
}

/** Resolve a TheTVDB movie id to a TMDB movie summary via /find (best effort). */
export async function findMovieByTvdbId(tvdbId: number): Promise<ResolvedSummary | null> {
  try {
    const data = await api<{
      movie_results: { id: number; title: string; poster_path: string | null; backdrop_path: string | null; release_date?: string }[]
    }>(`/find/${tvdbId}`, { external_source: 'tvdb_id' })
    const r = data.movie_results?.[0]
    if (!r) return null
    return {
      id: String(r.id),
      title: r.title,
      poster: img(r.poster_path),
      backdrop: img(r.backdrop_path, 'w780'),
      year: r.release_date ? Number(r.release_date.slice(0, 4)) : undefined,
    }
  } catch {
    return null
  }
}

/** Resolve a TV show by name (fallback when the TheTVDB id has no TMDB link). */
export async function searchShowByName(name: string): Promise<ResolvedSummary | null> {
  try {
    const data = await api<{
      results: { id: number; name: string; poster_path: string | null; backdrop_path: string | null; first_air_date?: string }[]
    }>('/search/tv', { query: name, include_adult: 'false' })
    const r = data.results?.[0]
    if (!r) return null
    return {
      id: String(r.id),
      title: r.name,
      poster: img(r.poster_path),
      backdrop: img(r.backdrop_path, 'w780'),
      year: r.first_air_date ? Number(r.first_air_date.slice(0, 4)) : undefined,
    }
  } catch {
    return null
  }
}

/** Resolve a movie by title (+ optional year) to a TMDB movie summary. */
export async function searchMovieByName(title: string, year?: number): Promise<ResolvedSummary | null> {
  try {
    const params: Record<string, string | number> = { query: title, include_adult: 'false' }
    if (year) params.primary_release_year = year
    const data = await api<{
      results: { id: number; title: string; poster_path: string | null; backdrop_path: string | null; release_date?: string }[]
    }>('/search/movie', params)
    let r = data.results?.[0]
    // If a year was given but the top hit doesn't match, prefer an exact-year hit.
    if (year) {
      const exact = data.results?.find((x) => x.release_date?.slice(0, 4) === String(year))
      if (exact) r = exact
    }
    if (!r) return null
    return {
      id: String(r.id),
      title: r.title,
      poster: img(r.poster_path),
      backdrop: img(r.backdrop_path, 'w780'),
      year: r.release_date ? Number(r.release_date.slice(0, 4)) : undefined,
    }
  } catch {
    return null
  }
}

/** Episode + season counts (and ended flag) for a TMDB show — one cheap request.
 *  Used to classify imported shows without the heavy per-season getShow fetch. */
export async function showMeta(id: string): Promise<{ episodes?: number; seasons?: number; ended?: boolean } | undefined> {
  try {
    const r = await api<{ number_of_episodes?: number; number_of_seasons?: number; status?: string }>(`/tv/${id}`)
    return {
      episodes: r.number_of_episodes,
      seasons: r.number_of_seasons,
      ended: /ended|canceled|cancelled/i.test(r.status || ''),
    }
  } catch {
    return undefined
  }
}

export interface ShowUpcoming {
  title: string
  poster?: string
  backdrop?: string
  episodes: { season: number; number: number; title: string; airDate: string; still?: string }[]
}

/**
 * Future scheduled episodes for one show, cheaply: read tv/{id} for the next
 * airing episode, then pull that season's episodes with air_date >= today.
 * Returns null for ended/none-scheduled shows (1 API call in that case).
 */
export async function upcomingForShow(id: string, todayIso: string): Promise<ShowUpcoming | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await api<any>(`/tv/${id}`)
    const next = r.next_episode_to_air
    if (!next) return null
    const seasonNo = next.season_number
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sd = await api<any>(`/tv/${id}/season/${seasonNo}`)
    const episodes = (sd.episodes ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((e: any) => e.air_date && e.air_date >= todayIso)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((e: any) => ({
        season: e.season_number,
        number: e.episode_number,
        title: e.name,
        airDate: e.air_date,
        still: img(e.still_path, 'w300'),
      }))
    if (!episodes.length) return null
    return { title: r.name, poster: img(r.poster_path), backdrop: img(r.backdrop_path, 'w780'), episodes }
  } catch {
    return null
  }
}

export async function search(query: string): Promise<Media[]> {
  const [data, tvg, mvg] = await Promise.all([
    api<{ results: { media_type: string }[] }>('/search/multi', { query }),
    genreMap('tv'),
    genreMap('movie'),
  ])
  const out: Media[] = []
  for (const r of data.results) {
    if (r.media_type === 'tv') out.push(await mapShow(r, tvg))
    else if (r.media_type === 'movie') out.push(mapMovie(r, mvg))
  }
  return out
}
