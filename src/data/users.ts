import { makePoster } from './poster'

// ---------------------------------------------------------------------------
// Social layer (mock). The app's real data is a single per-account library, so
// other people — for search, public profiles and the leaderboard — come from a
// baked, self-contained dataset. Posters are generated from titles (data-URI
// SVGs) so everything renders identically in mock and live (TMDB) builds with
// no network calls and no dependency on catalog ids.
// ---------------------------------------------------------------------------

export interface PublicRef {
  id: string
  type: 'show' | 'movie'
  title: string
  poster: string
}

export interface PublicList {
  id: string
  name: string
  ranked?: boolean
  items: PublicRef[]
}

export interface PublicUser {
  id: string
  name: string
  handle: string
  accent: string
  bio?: string
  stats: {
    episodesWatched: number
    showsFollowed: number
    showsWatched: number // shows with >=1 episode watched (started)
    showsCompleted: number // shows fully finished
    moviesFollowed: number
    moviesWatched: number
    tvMin: number
    movieMin: number
  }
  shows: PublicRef[]
  movies: PublicRef[]
  favoriteShows: PublicRef[]
  favoriteMovies: PublicRef[]
  lists: PublicList[]
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
const S = (...titles: string[]): PublicRef[] =>
  titles.map((title) => ({ id: 'us_' + slug(title), type: 'show', title, poster: makePoster(title) }))
const M = (...titles: string[]): PublicRef[] =>
  titles.map((title) => ({ id: 'um_' + slug(title), type: 'movie', title, poster: makePoster(title) }))
const mix = (...refs: PublicRef[]): PublicRef[] => refs

export const totalMinutes = (u: PublicUser) => u.stats.tvMin + u.stats.movieMin

const SHOW_POOL = [
  'Breaking Bad', 'The Last of Us', 'Severance', 'Succession', 'The Bear', 'Shōgun',
  'House of the Dragon', 'Andor', 'Fallout', 'True Detective', 'The Boys', 'Arcane',
  'Dark', 'Chernobyl', 'Ted Lasso', 'Better Call Saul', 'The Wire', 'Fleabag',
  'Silo', 'Foundation', 'Rick and Morty', 'The Penguin',
]
const MOVIE_POOL = [
  'Oppenheimer', 'Dune: Part Two', 'Sinners', 'Anora', 'The Brutalist', 'Conclave',
  'Poor Things', 'Everything Everywhere All at Once', 'Interstellar', 'Parasite',
  'Whiplash', 'Blade Runner 2049', 'The Substance', 'Challengers', 'Past Lives',
  'Gladiator II', 'Wicked', 'The Zone of Interest', 'Nosferatu', 'Furiosa',
]

const showsFrom = (n: number, offset = 0) => S(...SHOW_POOL.slice(offset, offset + n))
const moviesFrom = (n: number, offset = 0) => M(...MOVIE_POOL.slice(offset, offset + n))

export const MOCK_USERS: PublicUser[] = [
  {
    id: 'u_lena',
    name: 'Lena Ortiz',
    handle: 'lenawatches',
    accent: '#ff9838',
    bio: 'Prestige TV enthusiast. Will defend slow-burn dramas to the death.',
    stats: { episodesWatched: 4820, showsFollowed: 142, showsWatched: 118, showsCompleted: 96, moviesFollowed: 88, moviesWatched: 74, tvMin: 4820 * 42, movieMin: 74 * 118 },
    shows: showsFrom(14, 0),
    movies: moviesFrom(11, 0),
    favoriteShows: S('Breaking Bad', 'Severance', 'Succession', 'The Wire', 'Better Call Saul', 'Chernobyl'),
    favoriteMovies: M('Parasite', 'Interstellar', 'Whiplash', 'Oppenheimer'),
    lists: [
      { id: 'l1', name: 'All-Time Top 5', ranked: true, items: mix(...S('Breaking Bad', 'The Wire', 'Succession'), ...S('Severance'), ...S('Chernobyl')) },
      { id: 'l2', name: 'Comfort Rewatches', items: mix(...S('Ted Lasso', 'Fleabag'), ...M('Past Lives')) },
    ],
  },
  {
    id: 'u_marcus',
    name: 'Marcus Bell',
    handle: 'marcusb',
    accent: '#46d369',
    bio: 'Sci-fi and anything with a twist ending.',
    stats: { episodesWatched: 6110, showsFollowed: 168, showsWatched: 149, showsCompleted: 121, moviesFollowed: 132, moviesWatched: 118, tvMin: 6110 * 42, movieMin: 118 * 121 },
    shows: showsFrom(15, 2),
    movies: moviesFrom(13, 3),
    favoriteShows: S('Dark', 'Severance', 'The Last of Us', 'Foundation', 'Andor'),
    favoriteMovies: M('Dune: Part Two', 'Blade Runner 2049', 'Interstellar', 'Everything Everywhere All at Once', 'The Substance'),
    lists: [
      { id: 'l1', name: 'Mind-Benders', ranked: true, items: mix(...S('Dark', 'Severance'), ...M('Everything Everywhere All at Once', 'Parasite')) },
    ],
  },
  {
    id: 'u_priya',
    name: 'Priya Nair',
    handle: 'priyanair',
    accent: '#b98cff',
    bio: 'A24 forever. Letterboxd is my diary.',
    stats: { episodesWatched: 2740, showsFollowed: 78, showsWatched: 66, showsCompleted: 52, moviesFollowed: 214, moviesWatched: 201, tvMin: 2740 * 42, movieMin: 201 * 115 },
    shows: showsFrom(9, 4),
    movies: moviesFrom(16, 0),
    favoriteShows: S('Fleabag', 'The Bear', 'Succession', 'Severance'),
    favoriteMovies: M('Poor Things', 'Past Lives', 'Anora', 'The Brutalist', 'Challengers', 'The Zone of Interest'),
    lists: [
      { id: 'l1', name: '2024 Favorites', ranked: true, items: mix(...M('Anora', 'The Brutalist', 'Challengers', 'Nosferatu')) },
      { id: 'l2', name: 'Comfort Films', items: mix(...M('Past Lives', 'Poor Things')) },
    ],
  },
  {
    id: 'u_devon',
    name: 'Devon Clarke',
    handle: 'devonc',
    accent: '#4aa8ff',
    bio: 'Weekend binger. Currently 3 shows behind.',
    stats: { episodesWatched: 8930, showsFollowed: 205, showsWatched: 188, showsCompleted: 160, moviesFollowed: 96, moviesWatched: 71, tvMin: 8930 * 42, movieMin: 71 * 116 },
    shows: showsFrom(16, 0),
    movies: moviesFrom(10, 5),
    favoriteShows: S('The Boys', 'House of the Dragon', 'The Last of Us', 'Fallout', 'Silo', 'Arcane'),
    favoriteMovies: M('Furiosa', 'Gladiator II', 'Dune: Part Two'),
    lists: [
      { id: 'l1', name: 'Binge Queue', items: mix(...S('Silo', 'Foundation', 'The Penguin', 'Andor')) },
    ],
  },
  {
    id: 'u_aiko',
    name: 'Aiko Tanaka',
    handle: 'aikot',
    accent: '#ff5964',
    bio: 'Animation + horror. No notes.',
    stats: { episodesWatched: 3510, showsFollowed: 112, showsWatched: 101, showsCompleted: 88, moviesFollowed: 140, moviesWatched: 129, tvMin: 3510 * 42, movieMin: 129 * 112 },
    shows: showsFrom(10, 6),
    movies: moviesFrom(12, 6),
    favoriteShows: S('Arcane', 'Rick and Morty', 'Dark', 'Chernobyl'),
    favoriteMovies: M('The Substance', 'Nosferatu', 'Poor Things', 'The Zone of Interest'),
    lists: [{ id: 'l1', name: 'Best Horror', ranked: true, items: mix(...M('The Substance', 'Nosferatu')) }],
  },
  {
    id: 'u_theo',
    name: 'Theo Nguyen',
    handle: 'theonguyen',
    accent: '#f2c744',
    bio: 'Trying to finish everything I start. Losing.',
    stats: { episodesWatched: 1980, showsFollowed: 64, showsWatched: 51, showsCompleted: 33, moviesFollowed: 58, moviesWatched: 44, tvMin: 1980 * 42, movieMin: 44 * 117 },
    shows: showsFrom(8, 8),
    movies: moviesFrom(8, 8),
    favoriteShows: S('The Bear', 'Shōgun', 'True Detective'),
    favoriteMovies: M('Conclave', 'Sinners', 'Wicked'),
    lists: [],
  },
  {
    id: 'u_sam',
    name: 'Sam Whitfield',
    handle: 'samw',
    accent: '#2fd4c4',
    bio: 'Documentaries, crime, and one reality show I won’t name.',
    stats: { episodesWatched: 5240, showsFollowed: 151, showsWatched: 133, showsCompleted: 104, moviesFollowed: 77, moviesWatched: 63, tvMin: 5240 * 42, movieMin: 63 * 114 },
    shows: showsFrom(13, 3),
    movies: moviesFrom(9, 2),
    favoriteShows: S('True Detective', 'Chernobyl', 'The Wire', 'Better Call Saul', 'Succession'),
    favoriteMovies: M('Oppenheimer', 'Conclave', 'The Brutalist'),
    lists: [{ id: 'l1', name: 'Crime Essentials', ranked: true, items: mix(...S('The Wire', 'True Detective', 'Better Call Saul')) }],
  },
  {
    id: 'u_maya',
    name: 'Maya Rossi',
    handle: 'mayarossi',
    accent: '#ff8ac4',
    bio: 'Casual watcher, strong opinions.',
    stats: { episodesWatched: 1240, showsFollowed: 41, showsWatched: 35, showsCompleted: 22, moviesFollowed: 39, moviesWatched: 31, tvMin: 1240 * 42, movieMin: 31 * 119 },
    shows: showsFrom(7, 10),
    movies: moviesFrom(7, 10),
    favoriteShows: S('The Bear', 'Ted Lasso', 'Fleabag'),
    favoriteMovies: M('Challengers', 'Wicked', 'Past Lives'),
    lists: [],
  },
]

const BY_ID: Record<string, PublicUser> = Object.fromEntries(MOCK_USERS.map((u) => [u.id, u]))

export function getUser(id: string): PublicUser | undefined {
  return BY_ID[id]
}

/** Search users by name or @handle. */
export function searchUsers(query: string): PublicUser[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return MOCK_USERS.filter((u) => u.name.toLowerCase().includes(q) || u.handle.toLowerCase().includes(q))
}
