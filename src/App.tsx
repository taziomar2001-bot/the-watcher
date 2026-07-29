import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { BottomNav } from './ui/BottomNav'
import { ToastHost } from './components/ToastHost'
import { Welcome } from './ui/Welcome'
import { USE_TMDB } from './data/catalog'
import { SUPABASE_ENABLED } from './data/supabase'
import { useLibrary } from './store/useLibrary'
import { useToast } from './store/useToast'
import { useSync } from './logic/sync'
import { runTVTimeImport, runMovieImport, runReconcile } from './data/importTVTime'
import { initSync } from './logic/sync'
import { ensureUpcoming } from './logic/upcoming'

const ONBOARDED_KEY = 'tw-onboarded'
import { TVShowsScreen } from './screens/TVShowsScreen'
import { TVCategoryScreen } from './screens/TVCategoryScreen'
import { ShowScreen } from './screens/ShowScreen'
import { SeasonScreen } from './screens/SeasonScreen'
import { MoviesScreen } from './screens/MoviesScreen'
import { MovieScreen } from './screens/MovieScreen'
import { UpComingScreen } from './screens/UpComingScreen'
import { DiscoverScreen } from './screens/DiscoverScreen'
import { ProfileScreen } from './screens/ProfileScreen'
import { LibraryScreen } from './screens/LibraryScreen'

function readOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === '1'
  } catch {
    return false
  }
}

export default function App() {
  const location = useLocation()
  const syncStatus = useSync((s) => s.status)
  const [onboarded, setOnboarded] = useState(readOnboarded)

  const dismissWelcome = () => {
    try {
      localStorage.setItem(ONBOARDED_KEY, '1')
    } catch {
      /* ignore */
    }
    setOnboarded(true)
  }

  // Once the user is signed in, first-run is complete for good.
  useEffect(() => {
    if (syncStatus === 'signedIn' && !onboarded) dismissWelcome()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncStatus])

  // Show the welcome/sign-up screen once, on a fresh device, only when cloud
  // sync is available and nobody is signed in yet.
  const showWelcome = SUPABASE_ENABLED && !onboarded && syncStatus !== 'signedIn' && syncStatus !== 'disabled'

  // Start cloud sync (no-op unless Supabase is configured).
  useEffect(() => {
    void initSync()
  }, [])

  // One-time migration of TV Time history (shows, then movies), then warm the
  // Up & Coming cache so that tab is instant when first opened.
  useEffect(() => {
    if (!USE_TMDB) return
    const toast = useToast.getState().show
    ;(async () => {
      if (!useLibrary.getState().tvTimeImported) {
        toast('Importing your shows…', { duration: 8000 })
        await runTVTimeImport().catch(() => {})
      }
      if (!useLibrary.getState().tvTimeMoviesImported) {
        toast('Importing your movies… this can take a minute', { duration: 8000 })
        await runMovieImport().catch(() => {})
        const n = Object.keys(useLibrary.getState().libraryMovies).length
        if (n) toast(`Imported ${n.toLocaleString()} movies from TV Time`, { duration: 5000 })
      }
      await runReconcile().catch(() => {}) // fix statuses + restore favorite movies
      ensureUpcoming() // prefetch releases in the background
    })()
  }, [])

  return (
    <div className="app-shell">
      <Routes location={location}>
        <Route path="/" element={<Navigate to="/tv" replace />} />
        <Route path="/tv" element={<TVShowsScreen />} />
        <Route path="/tv/category/:key" element={<TVCategoryScreen />} />
        <Route path="/show/:id" element={<ShowScreen />} />
        <Route path="/show/:id/season/:season" element={<SeasonScreen />} />
        <Route path="/movies" element={<MoviesScreen />} />
        <Route path="/movie/:id" element={<MovieScreen />} />
        <Route path="/upcoming" element={<UpComingScreen />} />
        <Route path="/discover" element={<DiscoverScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />
        <Route path="/library" element={<LibraryScreen />} />
        <Route path="/favorites" element={<LibraryScreen favoritesOnly />} />
        <Route path="*" element={<Navigate to="/tv" replace />} />
      </Routes>
      <BottomNav />
      <ToastHost />
      {showWelcome && <Welcome onSkip={dismissWelcome} />}
    </div>
  )
}
