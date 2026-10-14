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
