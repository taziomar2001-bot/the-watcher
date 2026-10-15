import { useAppGestures } from './ui/gestures'
import { Suspense, lazy, useEffect, useState } from 'react'
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
import { useMe } from './store/useMe'
import { useSync } from './logic/sync'
import { useNavTracker } from './logic/nav'
import { useStatsSync } from './logic/stats'
import { initSync } from './logic/sync'
import { ensureUpcoming } from './logic/upcoming'

const ONBOARDED_KEY = 'tw-onboarded'
import { TVShowsScreen } from './screens/TVShowsScreen'
import { ShowScreen } from './screens/ShowScreen'
import { SeasonScreen } from './screens/SeasonScreen'
import { EpisodeScreen } from './screens/EpisodeScreen'
import { MoviesScreen } from './screens/MoviesScreen'
import { MovieScreen } from './screens/MovieScreen'
import { UpComingScreen } from './screens/UpComingScreen'
import { DiscoverScreen } from './screens/DiscoverScreen'
import { useCommunityListSync } from './logic/communityLists'
import { ProfileScreen, ProfileListsScreen } from './screens/ProfileScreen'
import { lastContentPath } from './logic/content'
import { useEscapeClosesSheets } from './ui/Sheet'

function readOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === '1'
  } catch {
    return false
  }
}

// Screens opened less often load on demand (and are prefetched when idle),
// so the app starts with a much smaller script.
const loaders = {
  TVCategoryScreen: () => import('./screens/TVCategoryScreen').then((m) => ({ default: m.TVCategoryScreen })),
  CommunityListScreen: () => import('./screens/CommunityListsTab').then((m) => ({ default: m.CommunityListScreen })),
  LibraryScreen: () => import('./screens/LibraryScreen').then((m) => ({ default: m.LibraryScreen })),
  ProfileTVLibraryScreen: () => import('./screens/ProfileTVLibraryScreen').then((m) => ({ default: m.ProfileTVLibraryScreen })),
  ProfileMoviesLibraryScreen: () => import('./screens/ProfileMoviesLibraryScreen').then((m) => ({ default: m.ProfileMoviesLibraryScreen })),
  ProfileTVDashboard: () => import('./screens/ProfileTVDashboard').then((m) => ({ default: m.ProfileTVDashboard })),
  ProfileMoviesDashboard: () => import('./screens/ProfileMoviesDashboard').then((m) => ({ default: m.ProfileMoviesDashboard })),
  ListScreen: () => import('./screens/ListScreen').then((m) => ({ default: m.ListScreen })),
  FavoritesScreen: () => import('./screens/FavoritesScreen').then((m) => ({ default: m.FavoritesScreen })),
  LeaderboardScreen: () => import('./screens/LeaderboardScreen').then((m) => ({ default: m.LeaderboardScreen })),
  PublicProfileScreen: () => import('./screens/PublicProfileScreen').then((m) => ({ default: m.PublicProfileScreen })),
  StatsScreen: () => import('./screens/StatsScreen').then((m) => ({ default: m.StatsScreen })),
  RandomScreen: () => import('./screens/RandomScreen').then((m) => ({ default: m.RandomScreen })),
  SettingsScreen: () => import('./screens/SettingsScreen').then((m) => ({ default: m.SettingsScreen })),
  CommunitiesScreen: () => import('./screens/CommunitiesScreen').then((m) => ({ default: m.CommunitiesScreen })),
  CommunitiesDiscoverScreen: () => import('./screens/CommunitiesDiscoverScreen').then((m) => ({ default: m.CommunitiesDiscoverScreen })),
  CommunityScreen: () => import('./screens/CommunityScreen').then((m) => ({ default: m.CommunityScreen })),
  CommunityEditScreen: () => import('./screens/CommunityEditScreen').then((m) => ({ default: m.CommunityEditScreen })),
  CommunityCreateScreen: () => import('./screens/CommunityEditScreen').then((m) => ({ default: m.CommunityCreateScreen })),
  ConnectionsScreen: () => import('./screens/ConnectionsScreen').then((m) => ({ default: m.ConnectionsScreen })),
  PublicLibraryScreen: () => import('./screens/PublicLibraryScreen').then((m) => ({ default: m.PublicLibraryScreen })),
  MatchHomeScreen: () => import('./screens/MatchScreen').then((m) => ({ default: m.MatchHomeScreen })),
  MatchSessionScreen: () => import('./screens/MatchScreen').then((m) => ({ default: m.MatchSessionScreen })),
}
const TVCategoryScreen = lazy(loaders.TVCategoryScreen)
const CommunityListScreen = lazy(loaders.CommunityListScreen)
const LibraryScreen = lazy(loaders.LibraryScreen)
const ProfileTVLibraryScreen = lazy(loaders.ProfileTVLibraryScreen)
const ProfileMoviesLibraryScreen = lazy(loaders.ProfileMoviesLibraryScreen)
const ProfileTVDashboard = lazy(loaders.ProfileTVDashboard)
const ProfileMoviesDashboard = lazy(loaders.ProfileMoviesDashboard)
const ListScreen = lazy(loaders.ListScreen)
const FavoritesScreen = lazy(loaders.FavoritesScreen)
const LeaderboardScreen = lazy(loaders.LeaderboardScreen)
const PublicProfileScreen = lazy(loaders.PublicProfileScreen)
const StatsScreen = lazy(loaders.StatsScreen)
const RandomScreen = lazy(loaders.RandomScreen)
const SettingsScreen = lazy(loaders.SettingsScreen)
const CommunitiesScreen = lazy(loaders.CommunitiesScreen)
const CommunitiesDiscoverScreen = lazy(loaders.CommunitiesDiscoverScreen)
const CommunityScreen = lazy(loaders.CommunityScreen)
const CommunityEditScreen = lazy(loaders.CommunityEditScreen)
const CommunityCreateScreen = lazy(loaders.CommunityCreateScreen)
const ConnectionsScreen = lazy(loaders.ConnectionsScreen)
const PublicLibraryScreen = lazy(loaders.PublicLibraryScreen)
const MatchHomeScreen = lazy(loaders.MatchHomeScreen)
const MatchSessionScreen = lazy(loaders.MatchSessionScreen)
function prefetchScreens() {
  const run = () => Object.values(loaders).forEach((load) => void load().catch(() => {}))
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
  if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 4000 })
  else setTimeout(run, 2500)
}

/** Background work that reads the whole library. Kept in its own component so
 *  a library change re-renders only this (it renders nothing), not the app. */
function BackgroundSync() {
  useStatsSync()
  useCommunityListSync()
  return null
}

export default function App() {
  const location = useLocation()
  useNavTracker()
  useEscapeClosesSheets()
  useAppGestures()
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
  // Keep the member's profile (username, follower counts) fresh in the
  // background; screens read the device copy so they never pop in late.
  const userId = useSync((s) => s.userId)
  useEffect(() => {
    if (syncStatus === 'signedIn' && userId) {
      if (useMe.getState().profile?.id !== userId) useMe.getState().clear()
      void useMe.getState().refresh()
    }
  }, [syncStatus, userId])
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
    prefetchScreens()
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
      <BackgroundSync />
      <Suspense fallback={<div className="scroll-area" />}>
      <Routes location={location}>
        <Route path="/" element={<Navigate to={lastContentPath()} replace />} />
        <Route path="/content" element={<Navigate to={lastContentPath()} replace />} />
        <Route path="/communities" element={<CommunitiesScreen />} />
        <Route path="/communities/new" element={<CommunityCreateScreen />} />
        <Route path="/communities/discover" element={<CommunitiesDiscoverScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/profile/stats" element={<StatsScreen />} />
        <Route path="/profile/lists" element={<ProfileListsScreen />} />
        <Route path="/c/:id" element={<CommunityScreen />} />
        <Route path="/c/:id/members" element={<CommunityScreen view="members" />} />
        <Route path="/c/:id/edit" element={<CommunityEditScreen />} />
        <Route path="/c/:id/l/:owner/:listId" element={<CommunityListScreen />} />
        <Route path="/tv" element={<TVShowsScreen />} />
        <Route path="/tv/category/:key" element={<TVCategoryScreen />} />
        <Route path="/show/:id" element={<ShowScreen />} />
        <Route path="/show/:id/season/:season" element={<SeasonScreen />} />
        <Route path="/show/:id/season/:season/episode/:number" element={<EpisodeScreen />} />
        <Route path="/movies" element={<MoviesScreen />} />
        <Route path="/movie/:id" element={<MovieScreen />} />
        <Route path="/upcoming" element={<UpComingScreen />} />
        <Route path="/discover" element={<DiscoverScreen />} />
        <Route path="/discover/random" element={<RandomScreen />} />
        <Route path="/discover/match" element={<MatchHomeScreen />} />
        <Route path="/discover/match/:id" element={<MatchSessionScreen />} />
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
        <Route path="*" element={<Navigate to={lastContentPath()} replace />} />
      </Routes>
      </Suspense>
      <BottomNav />
      <ToastHost />
      {showWelcome && <Welcome onSkip={dismissWelcome} />}
    </div>
  )
}
