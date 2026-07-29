import type { Media, Show, Movie } from '../types'
import type { LibraryItem } from '../store/useLibrary'

/** Build a cached library summary from a full catalog Show/Movie. */
export function toLibraryItem(m: Media): LibraryItem {
  if (m.type === 'show') {
    const s = m as Show
    return {
      id: s.id,
      type: 'show',
      title: s.title,
      poster: s.poster,
      backdrop: s.backdrop,
      totalEpisodes: s.totalEpisodes,
      seasonCount: s.seasons?.length,
      year: s.firstAirYear,
    }
  }
  const mv = m as Movie
  return {
    id: mv.id,
    type: 'movie',
    title: mv.title,
    poster: mv.poster,
    backdrop: mv.backdrop,
    year: mv.year,
    runtime: mv.runtime,
    releaseDate: mv.releaseDate,
  }
}
