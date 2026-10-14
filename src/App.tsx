import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { BottomNav } from './ui/BottomNav'
import { ToastHost } from './components/ToastHost'
import { Welcome } from './ui/Welcome'
import { SyncGate } from './ui/SyncGate'
import { SignedOutLibraryGate } from './ui/SignedOutLibraryGate'
import { CompleteProfile, useNeedsProfile } from './ui/CompleteProfile'
import { NewPassword } from './ui/NewPassword'
import { USE_TMDB } from './data/catalog'
import { SUPABASE_ENABLED } from './data/supabase'
import { useToast } from './store/useToast'
import { useSync } from './logic/sync'
import { useNavTracker } from './logic/nav'
import { useStatsSync } from './logic/stats'
import { initSync } from './logic/sync'
import { ensureUpcoming } from './logic/upcoming'

const ONBOARDED_KEY = 'tw-onboarded'
import { TVShowsScreen } from './screens/TVShowsScreen'
import { TVCategoryScreen } from './screens/TVCategoryScreen'
import { ShowScreen } from './screens/ShowScreen'
import { SeasonScreen } from './screens/SeasonScreen'
import { EpisodeScreen } from './screens/EpisodeScreen'
import { MoviesScreen } from './screens/MoviesScreen'
import { MovieScreen } from './screens/MovieScreen'
import { UpComingScreen } from './screens/UpComingScreen'
import { DiscoverScreen } from './screens/DiscoverScreen'
import { ProfileScreen } from './screens/ProfileScreen'
import { LibraryScreen } from './screens/LibraryScreen'
import { ProfileTVLibraryScreen } from './screens/ProfileTVLibraryScreen'
import { ProfileMoviesLibraryScreen } from './screens/ProfileMoviesLibraryScreen'
import { ProfileTVDashboard } from './screens/ProfileTVDashboard'
import { ProfileMoviesDashboard } from './screens/ProfileMoviesDashboard'
import { ListScreen } from './screens/ListScreen'
import { FavoritesScreen } from './screens/FavoritesScreen'
import { LeaderboardScreen } from './screens/LeaderboardScreen'
import { PublicProfileScreen } from './screens/PublicProfileScreen'
import { ConnectionsScreen } from './screens/ConnectionsScreen'
import { PublicLibraryScreen } from './screens/PublicLibraryScreen'

function readOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === '1'
  } catch {
    return false
  }
}

export default function App() {
  const location = useLocation()
  useNavTracker()
  useStatsSync()
  const syncStatus = useSync((s) => s.status)
  const showSyncGate = useSync((s) =>
    (s.status === 'signedIn' || s.status === 'busy') && s.mayShowLocal === false,
  )
  const showSignedOutLibraryGate = useSync((s) => s.status === 'signedOut' && s.mayShowLocal === false)
  const [onboarded, setOnboarded] = useState(readOnboarded)
  const [needsProfile, profileDone] = useNeedsProfile()
  // Until the stored session has been checked (status leaves its initial
  // 'busy'), don't flash the sign-in screen — e.g. while returning from Google.
  const [booted, setBooted] = useState(false)
  useEffect(() => {
    if (syncStatus !== 'busy') setBooted(true)
  }, [syncStatus])
  const recovering = useSync((s) => s.recovering)
  // A reset link that didn't produce a session (expired, or opened in another
  // browser) leaves the person signed out: say so instead of failing silently.
  useEffect(() => {
    if (booted && recovering && syncStatus === 'signedOut') {
      useSync.setState({ recovering: false })
      useToast.getState().show('That reset link didn’t work. Request a new one from Sign in → Forgot password.', { duration: 6000 })
    }
  }, [booted, recovering, syncStatus])

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
  const showWelcome = SUPABASE_ENABLED && booted && !onboarded && syncStatus !== 'signedIn' && syncStatus !== 'disabled'

  // Start cloud sync (no-op unless Supabase is configured).
  useEffect(() => {
    void initSync()
  }, [])

  // Warm the Up & Coming cache in the background. The TV Time import no longer
  // runs automatically — it would reconstruct the owner's library into EVERY
  // browser. It's now an explicit, owner-only action in Settings, so fresh
  // visitors and new accounts start empty.
  useEffect(() => {
    if (!USE_TMDB) return
    ensureUpcoming()
  }, [])

  if (showSyncGate) return (
    <div className="app-shell">
      <SyncGate />
      <ToastHost />
    </div>
  )

  if (recovering && syncStatus === 'signedIn') return (
    <div className="app-shell">
      <NewPassword />
      <ToastHost />
    </div>
  )

  if (needsProfile) return (
    <div className="app-shell">
      <CompleteProfile onDone={profileDone} />
      <ToastHost />
    </div>
  )

  if (showSignedOutLibraryGate) return (
    <div className="app-shell">
      <SignedOutLibraryGate />
      <ToastHost />
    </div>
  )

  return (
    <div className="app-shell">
      <Routes location={location}>
        <Route path="/" element={<Navigate to="/tv" replace />} />
        <Route path="/tv" element={<TVShowsScreen />} />
        <Route path="/tv/category/:key" element={<TVCategoryScreen />} />
        <Route path="/show/:id" element={<ShowScreen />} />
        <Route path="/show/:id/season/:season" element={<SeasonScreen />} />
        <Route path="/show/:id/season/:season/episode/:number" element={<EpisodeScreen />} />
        <Route path="/movies" element={<MoviesScreen />} />
        <Route path="/movie/:id" element={<MovieScreen />} />
        <Route path="/upcoming" element={<UpComingScreen />} />
        <Route path="/discover" element={<DiscoverScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />
        <Route path="/profile/tv" element={<ProfileTVDashboard />} />
        <Route path="/profile/movies" element={<ProfileMoviesDashboard />} />
        <Route path="/list/:id" element={<ListScreen />} />
        <Route path="/library" element={<LibraryScreen />} />
        <Route path="/library/shows" element={<ProfileTVLibraryScreen />} />
        <Route path="/library/movies" element={<ProfileMoviesLibraryScreen />} />
        <Route path="/favorites" element={<FavoritesScreen />} />
        <Route path="/leaderboard" element={<LeaderboardScreen />} />
        <Route path="/u/:id" element={<PublicProfileScreen />} />
        <Route path="/u/:id/tv" element={<PublicLibraryScreen kind="tv" />} />
        <Route path="/u/:id/movies" element={<PublicLibraryScreen kind="movies" />} />
        <Route path="/u/:id/favorites" element={<PublicLibraryScreen kind="favorites" />} />
        <Route path="/u/:id/list/:listId" element={<PublicLibraryScreen kind="list" />} />
        <Route path="/people/:id/:tab" element={<ConnectionsScreen />} />
        <Route path="*" element={<Navigate to="/tv" replace />} />
      </Routes>
      <BottomNav />
      <ToastHost />
      {showWelcome && <Welcome onSkip={dismissWelcome} />}
    </div>
  )
}
