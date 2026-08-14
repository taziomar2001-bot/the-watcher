import type { Show, Season } from '../types'

/** Format a personal average like "4.3 ★". */
export const fmtAvg = (n: number) => (Math.round(n * 10) / 10).toFixed(1)
export const fmtStars = (n: number) => `${fmtAvg(n)} ★`

/** Episodes-per-season map from a fetched show (for offline caching). */
export function seasonSizesOf(show: Show): Record<string, number> {
  const m: Record<string, number> = {}
  for (const se of show.seasons) m[String(se.season)] = se.episodes.length
  return m
}

/**
 * Personal season average from a fetched season. Only returned when MORE THAN
 * HALF of the season's episodes are rated; unrated episodes never count as 0.
 */
export function seasonAverageLive(season: Season, epRatings: Record<string, number>): number | null {
  const total = season.episodes.length
  if (!total) return null
  const rated = season.episodes.map((e) => epRatings[e.id]).filter((r): r is number => r != null)
  if (!(rated.length > total / 2)) return null
  return rated.reduce((a, b) => a + b, 0) / rated.length
}

/** How many episodes of a season are rated (for showing progress). */
export function seasonRatedCount(season: Season, epRatings: Record<string, number>): number {
  return season.episodes.filter((e) => epRatings[e.id] != null).length
}

/**
 * Personal show average from a fetched show. Only qualifying seasons (those with
 * a valid season average) count, and only when MORE THAN HALF of the seasons
 * qualify.
 */
export function showAverageLive(show: Show, epRatings: Record<string, number>): number | null {
  const seasons = show.seasons
  if (!seasons.length) return null
  const avgs = seasons.map((se) => seasonAverageLive(se, epRatings)).filter((a): a is number => a != null)
  if (!(avgs.length > seasons.length / 2)) return null
  return avgs.reduce((a, b) => a + b, 0) / avgs.length
}

/**
 * Show average computed offline from the cached seasonSizes map + episode
 * ratings (keys "<showId>_s<season>e<ep>"). Used by the Profile leaderboard so
 * it works without re-fetching every show.
 */
export function showAverageCached(
  showId: string,
  seasonSizes: Record<string, number> | undefined,
  epRatings: Record<string, number>,
): number | null {
  if (!seasonSizes) return null
  const seasonNums = Object.keys(seasonSizes)
  if (!seasonNums.length) return null
  const avgs: number[] = []
  for (const sn of seasonNums) {
    const size = seasonSizes[sn]
    const prefix = `${showId}_s${sn}e`
    const rated = Object.keys(epRatings)
      .filter((k) => k.startsWith(prefix))
      .map((k) => epRatings[k])
    if (size > 0 && rated.length > size / 2) avgs.push(rated.reduce((a, b) => a + b, 0) / rated.length)
  }
  if (!(avgs.length > seasonNums.length / 2)) return null
  return avgs.reduce((a, b) => a + b, 0) / avgs.length
}
