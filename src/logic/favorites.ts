import { useLibrary, type LibraryItem } from '../store/useLibrary'
import { useToast } from '../store/useToast'
import { FAV_LIMIT } from './stats'

/**
 * Central favourite toggler used everywhere (Discover, Show/Movie detail, the
 * Favorites picker, Add-to-list). Enforces the per-category cap of 9 and, when
 * the cap is hit, tells the user to remove one first instead of silently doing
 * nothing or replacing an existing favourite. Removing is always allowed.
 */
export function useToggleFavorite() {
  const lib = useLibrary()
  const toast = useToast((s) => s.show)
  return (type: 'show' | 'movie', id: string, item?: LibraryItem): boolean => {
    const isFav = type === 'show' ? !!lib.favoriteShows[id] : !!lib.favoriteMovies[id]
    if (!isFav) {
      const count = type === 'show' ? Object.keys(lib.favoriteShows).length : Object.keys(lib.favoriteMovies).length
      if (count >= FAV_LIMIT) {
        toast(`You can have up to ${FAV_LIMIT} favorite ${type === 'show' ? 'TV shows' : 'movies'} — remove one first.`, {
          duration: 4200,
        })
        return false
      }
    }
    if (type === 'show') lib.toggleFavoriteShow(id, item)
    else lib.toggleFavoriteMovie(id, item)
    return true
  }
}
