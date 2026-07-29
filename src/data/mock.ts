import type { Show, Movie, Season, Episode } from '../types'
import { makePoster, makeBackdrop, makeStill } from './poster'

// Reference "now" the mock calendar is built around. The live app uses the real
// clock; these ISO dates are chosen to spread nicely across the current week
// (spec was authored around 2026-07-11).
function daysFromNow(n: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

let epSeq = 1
function ep(
  showId: string,
  season: number,
  number: number,
  title: string,
  offsetDays: number,
  airTime: string,
  runtime = 48,
): Episode {
  return {
    id: `${showId}_s${season}e${number}_${epSeq++}`,
    season,
    number,
    title,
    airDate: daysFromNow(offsetDays),
    airTime,
    runtime,
    still: makeStill(showId, `${season}x${number}`),
    overview:
      'A pivotal chapter that raises the stakes for everyone involved as long-buried secrets finally come to light.',
  }
}

function season(n: number, name: string, episodes: Episode[]): Season {
  return { season: n, name, episodes }
}

function show(
  id: string,
  title: string,
  overview: string,
  genres: string[],
  network: string,
  platforms: string[],
  status: string,
  year: number,
  rating: number,
  seasons: Season[],
): Show {
  const totalEpisodes = seasons.reduce((s, se) => s + se.episodes.length, 0)
  return {
    id,
    type: 'show',
    title,
    poster: makePoster(title),
    backdrop: makeBackdrop(title),
    overview,
    genres,
    status,
    network,
    platforms,
    firstAirYear: year,
    communityRating: rating,
    seasons,
    totalEpisodes,
  }
}

// A helper to build a full watched-through season plus a current airing season.
function pastSeason(showId: string, n: number, count: number, prefix = 'Episode'): Season {
  const eps: Episode[] = []
  for (let i = 1; i <= count; i++) {
    eps.push(ep(showId, n, i, `${prefix} ${i}`, -120 + i * 5, '21:00'))
  }
  return season(n, `Season ${n}`, eps)
}

export const SHOWS: Show[] = [
  show(
    'silo',
    'Silo',
    'In a ruined and toxic future, thousands live in a giant underground silo. When those who break its stringent rules get their wish to go outside, the truth begins to unravel.',
    ['Sci-Fi', 'Drama', 'Mystery'],
    'Apple TV+',
    ['Apple TV+'],
    'Returning Series',
    2023,
    8.1,
    [
      pastSeason('silo', 1, 10),
      pastSeason('silo', 2, 10),
      season(3, 'Season 3', [
        ep('silo', 3, 1, 'Descent', -3, '03:00'),
        ep('silo', 3, 2, "It's All Good", 1, '03:00'),
        ep('silo', 3, 3, 'The Pact', 8, '03:00'),
      ]),
    ],
  ),
  show(
    'hotd',
    'House of the Dragon',
    'The reign of House Targaryen begins with a story of blood and fire that tears a dynasty apart 200 years before the events of Game of Thrones.',
    ['Fantasy', 'Drama', 'Action'],
    'HBO',
    ['Max'],
    'Returning Series',
    2022,
    8.4,
    [
      pastSeason('hotd', 1, 10),
      pastSeason('hotd', 2, 8),
      season(3, 'Season 3', [
        ep('hotd', 3, 1, 'A Son for a Son', -1, '03:00'),
        ep('hotd', 3, 2, 'The Burning Mill', 5, '03:00'),
      ]),
    ],
  ),
  show(
    'rickmorty',
    'Rick and Morty',
    'An animated series that follows the exploits of a super scientist and his not-so-bright grandson as they travel across dimensions.',
    ['Animation', 'Comedy', 'Sci-Fi'],
    'Adult Swim',
    ['Max', 'Hulu'],
    'Returning Series',
    2013,
    8.7,
    [
      pastSeason('rickmorty', 6, 10),
      season(7, 'Season 7', [
        ep('rickmorty', 7, 1, 'How Poopy Got His Poop Back', -2, '06:00', 24),
        ep('rickmorty', 7, 2, 'Rickuiem Mort a Dream', 1, '06:00', 24),
        ep('rickmorty', 7, 3, 'TBA', 8, '06:00', 24),
      ]),
    ],
  ),
  show(
    'tlou',
    'The Last of Us',
    'Twenty years after modern civilization has been destroyed, a hardened survivor is hired to smuggle a 14-year-old girl out of an oppressive quarantine zone.',
    ['Drama', 'Sci-Fi', 'Thriller'],
    'HBO',
    ['Max'],
    'Returning Series',
    2023,
    8.6,
    [
      pastSeason('tlou', 1, 9),
      season(2, 'Season 2', [
        ep('tlou', 2, 1, 'Future Days', 0, '03:00'),
        ep('tlou', 2, 2, 'Through the Valley', 7, '03:00'),
      ]),
    ],
  ),
  show(
    'severance',
    'Severance',
    'Mark leads a team of office workers whose memories have been surgically divided between their work and personal lives.',
    ['Sci-Fi', 'Thriller', 'Drama'],
    'Apple TV+',
    ['Apple TV+'],
    'Returning Series',
    2022,
    8.7,
    [
      pastSeason('severance', 1, 9),
      pastSeason('severance', 2, 10),
      season(3, 'Season 3', [ep('severance', 3, 1, 'Cold Harbor', 12, '03:00')]),
    ],
  ),
  show(
    'thebear',
    'The Bear',
    'A young chef from the fine-dining world returns to Chicago to run his late brother’s chaotic sandwich shop.',
    ['Comedy', 'Drama'],
    'FX',
    ['Hulu', 'Disney+'],
    'Returning Series',
    2022,
    8.5,
    [pastSeason('thebear', 1, 8), pastSeason('thebear', 2, 10), pastSeason('thebear', 3, 10)],
  ),
  show(
    'foundation',
    'Foundation',
    'A band of exiles must find a way to save humanity as the Galactic Empire begins to crumble.',
    ['Sci-Fi', 'Drama'],
    'Apple TV+',
    ['Apple TV+'],
    'Returning Series',
    2021,
    7.4,
    [
      pastSeason('foundation', 1, 10),
      pastSeason('foundation', 2, 10),
      season(3, 'Season 3', [ep('foundation', 3, 1, 'In Seldon’s Shadow', 2, '03:00')]),
    ],
  ),
  show(
    'andor',
    'Andor',
    'The tale of the burgeoning rebellion against the Empire and how people and planets became involved.',
    ['Sci-Fi', 'Drama', 'Action'],
    'Disney+',
    ['Disney+'],
    'Ended',
    2022,
    8.4,
    [pastSeason('andor', 1, 12), pastSeason('andor', 2, 12)],
  ),
  show(
    'shogun',
    'Shōgun',
    'A ruthless English navigator becomes key to the survival of a powerful lord in feudal Japan.',
    ['Drama', 'History', 'War'],
    'FX',
    ['Hulu'],
    'Returning Series',
    2024,
    8.7,
    [pastSeason('shogun', 1, 10), season(2, 'Season 2', [ep('shogun', 2, 1, 'The Sea Wall', 20, '03:00')])],
  ),
  show(
    'darkmatter',
    'Dark Matter',
    'A physicist is abducted into an alternate version of his life and must fight to reclaim the reality he once knew.',
    ['Sci-Fi', 'Thriller'],
    'Apple TV+',
    ['Apple TV+'],
    'Returning Series',
    2024,
    7.9,
    [pastSeason('darkmatter', 1, 9)],
  ),
  show(
    'fallout',
    'Fallout',
    'In a future ravaged by nuclear war, dwellers of a fallout shelter venture out into a strange and violent wasteland.',
    ['Sci-Fi', 'Action', 'Adventure'],
    'Prime Video',
    ['Prime Video'],
    'Returning Series',
    2024,
    8.3,
    [pastSeason('fallout', 1, 8)],
  ),
  show(
    'thepenguin',
    'The Penguin',
    'Oswald Cobb makes a play to seize control of Gotham’s criminal underworld in the wake of chaos.',
    ['Crime', 'Drama'],
    'HBO',
    ['Max'],
    'Returning Series',
    2024,
    8.6,
    [pastSeason('thepenguin', 1, 8)],
  ),
]

export const MOVIES: Movie[] = [
  movie('dune3', 'Dune: Part Three', ['Sci-Fi', 'Adventure'], 341, 165, 8.6, 'Denis Villeneuve', 2026),
  movie('avatar3', 'Avatar: Fire and Ash', ['Sci-Fi', 'Action'], 158, 190, 7.9, 'James Cameron', 2025),
  movie('batman2', 'The Batman Part II', ['Crime', 'Action'], 730, 150, 8.2, 'Matt Reeves', 2027),
  movie('oppen2', 'After the Fall', ['Drama', 'History'], 12, 138, 8.0, 'Christopher Nolan', 2026),
  movie('spiderverse3', 'Beyond the Spider-Verse', ['Animation', 'Action'], 1258, 120, 9.0, 'Kemp Powers', 2029),
  movie('mission8', 'Mission: Impossible — Ares', ['Action', 'Thriller'], 47, 155, 7.8, 'Christopher McQuarrie', 2026),
  movie('sinners', 'Sinners', ['Horror', 'Thriller'], -60, 137, 8.1, 'Ryan Coogler', 2025),
  movie('anora', 'Anora', ['Drama', 'Comedy'], -200, 139, 7.6, 'Sean Baker', 2024),
  movie('brutalist', 'The Brutalist', ['Drama', 'History'], -150, 215, 7.7, 'Brady Corbet', 2024),
  movie('conclave', 'Conclave', ['Drama', 'Thriller'], -180, 120, 7.4, 'Edward Berger', 2024),
  movie('wicked2', 'Wicked: For Good', ['Musical', 'Fantasy'], 130, 140, 7.5, 'Jon M. Chu', 2025),
  movie('gladiator2', 'Gladiator II', ['Action', 'Drama'], -220, 148, 6.9, 'Ridley Scott', 2024),
]

function movie(
  id: string,
  title: string,
  genres: string[],
  releaseOffsetDays: number,
  runtime: number,
  rating: number,
  director: string,
  year: number,
): Movie {
  return {
    id,
    type: 'movie',
    title,
    poster: makePoster(title),
    backdrop: makeBackdrop(title),
    overview:
      'An ambitious, visually staggering epic that pushes its characters to the edge and asks what they are willing to sacrifice for what they believe in.',
    genres,
    releaseDate: daysFromNow(releaseOffsetDays),
    runtime,
    platforms: ['In Theaters'],
    communityRating: rating,
    director,
    cast: ['Lead Actor', 'Supporting Actor', 'Featured Player', 'Ensemble Cast'],
    year,
  }
}

export const SHOWS_BY_ID: Record<string, Show> = Object.fromEntries(SHOWS.map((s) => [s.id, s]))
export const MOVIES_BY_ID: Record<string, Movie> = Object.fromEntries(MOVIES.map((m) => [m.id, m]))

// Seed a believable, varied amount of watched progress per show so the
// watchlist posters display partial yellow progress bars on first launch.
export const SEED_WATCHED_EPISODES: Record<string, true> = (() => {
  const fractions: Record<string, number> = {
    silo: 0.7,
    hotd: 0.55,
    rickmorty: 0.3,
    tlou: 0.85,
    severance: 0.5,
    thebear: 0.95,
    foundation: 0.4,
    shogun: 0.6,
    fallout: 0.2,
  }
  const map: Record<string, true> = {}
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  for (const s of SHOWS) {
    const f = fractions[s.id]
    if (f === undefined) continue
    const released = s.seasons
      .flatMap((se) => se.episodes)
      .filter((e) => !e.airDate || new Date(e.airDate + 'T00:00:00') <= today)
    const k = Math.round(released.length * f)
    released.slice(0, k).forEach((e) => (map[e.id] = true))
  }
  return map
})()
