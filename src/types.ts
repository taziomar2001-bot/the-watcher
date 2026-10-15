export type MediaType = 'show' | 'movie'

export interface Genre {
  id: number
  name: string
}

export interface Episode {
  id: string
  season: number
  number: number
  title: string
  overview?: string
  airDate?: string // ISO date
  airTime?: string // "03:00"
  still?: string // thumbnail image url
  runtime?: number // minutes
  communityRating?: number // TMDB vote_average, 0-10
  communityVotes?: number // TMDB vote_count
}

export interface Season {
  season: number
  name: string
  episodes: Episode[]
  communityRating?: number // TMDB season vote_average (or episode-weighted)
  communityVotes?: number
}

export interface Show {
  id: string
  type: 'show'
  title: string
  poster?: string
  backdrop?: string
  overview: string
  genres: string[]
  status: string // "Returning Series", "Ended"
  network: string
  platforms: string[]
  firstAirYear?: number
  communityRating?: number // 0-10
  communityVotes?: number
  seasons: Season[]
  totalEpisodes: number
}

export interface Movie {
  id: string
  type: 'movie'
  title: string
  poster?: string
  backdrop?: string
  overview: string
  genres: string[]
  releaseDate?: string // ISO
  runtime?: number // minutes
  platforms: string[]
  communityRating?: number
  communityVotes?: number
  director?: string
  cast?: string[]
  year?: number
}

export type Media = Show | Movie

/** A concrete upcoming episode release, denormalized for the calendar. */
export interface UpcomingEpisode {
  showId: string
  showTitle: string
  poster?: string
  still?: string
  season: number
  number: number
  episodeTitle: string
  airDate: string // ISO
  airTime: string
  network: string
  isNew?: boolean
  isLatest?: boolean
  released: boolean
}

// ---- Books & video games (status-only tracking) ----

/** Every kind of title the app tracks. */
export type ContentKind = 'show' | 'movie' | 'book' | 'game'
/** The two status-tracked kinds (no episodes / runtimes). */
export type TrackKind = 'book' | 'game'

export interface Book {
  id: string // Google Books volume id
  type: 'book'
  title: string
  subtitle?: string
  authors: string[]
  poster?: string
  overview: string
  genres: string[]
  pageCount?: number
  releaseDate?: string // ISO (YYYY-MM-DD when known)
  year?: number
  publisher?: string
  language?: string
  isbn?: string
  communityRating?: number // 0-10 (Google's 1–5 average × 2)
  communityVotes?: number
}

export interface Game {
  id: string // IGDB game id
  type: 'game'
  title: string
  poster?: string
  backdrop?: string
  overview: string
  genres: string[]
  platforms: string[]
  releaseDate?: string // ISO, first release
  year?: number
  developer?: string
  publisher?: string
  modes?: string[] // Single player, Multiplayer…
  communityRating?: number // 0-10 (IGDB total rating / 10)
  communityVotes?: number
  /** IGDB average time to beat, in hours. */
  timeToBeat?: { hastily?: number; normally?: number; completely?: number }
}

export type TrackMedia = Book | Game
