import { create } from 'zustand'
import { supabase, SUPABASE_ENABLED, LIBRARY_TABLE } from '../data/supabase'
import { useLibrary } from '../store/useLibrary'
import { useToast } from '../store/useToast'
import { claimUsername } from '../data/social'

export interface SignUpOpts {
  username?: string
  displayName?: string
  visibility?: 'public' | 'private'
}

const PENDING_USERNAME_KEY = 'tw-pending-username'

/** True while an email signup's chosen @username is still waiting to be claimed. */
export function hasPendingUsernameFor(email?: string): boolean {
  if (!email) return false
  try {
    const raw = localStorage.getItem(PENDING_USERNAME_KEY)
    if (!raw) return false
    return (JSON.parse(raw) as { email: string }).email === email.trim().toLowerCase()
  } catch {
    return false
  }
}

// Claim a username stored at signup, once a session exists (covers the
// email-confirmation flow where there's no session until first sign-in).
async function claimPendingUsername(email?: string) {
  let pending: { email: string; username: string } | null = null
  try {
    const raw = localStorage.getItem(PENDING_USERNAME_KEY)
    if (raw) pending = JSON.parse(raw) as { email: string; username: string }
  } catch {
    /* ignore */
  }
  // A pending signup must never claim its handle on a different signed-in account.
  if (!pending || !email || pending.email !== email.trim().toLowerCase()) return
  const r = await claimUsername(pending.username)
  if (r.ok || (!r.ok && r.code === 'username_taken')) {
    // Taken names are resolved by the user in Settings; stop retrying either way.
    try {
      localStorage.removeItem(PENDING_USERNAME_KEY)
    } catch {
      /* ignore */
    }
  }
}

// ---------------------------------------------------------------------------
// Cloud sync engine (optional). Stores each user's whole library as one JSON
// blob in Supabase. Auto-backs-up on change; restores on a fresh device.
// Local-only behaviour is unchanged when Supabase isn't configured.
// ---------------------------------------------------------------------------

// The state fields that make up the user's library (everything persisted,
// excluding actions). Kept explicit so we never sync functions.
const SYNC_KEYS = [
  'watchlistShows',
  'watchlistMovies',
  'watchedEpisodes',
  'watchedMovies',
  'favoriteShows',
  'favoriteMovies',
  'notifyShows',
  'ratings',
  'movieRatings',
  'episodeRatings',
  'ratingAt',
  'libraryShows',
  'libraryMovies',
  'lastWatched',
  'followedAt',
  'addedAt',
  'stoppedShows',
  'lists',
  'profile',
  'tvTimeImported',
  'tvTimeMoviesImported',
  'migrationVersion',
  'importedShowIds',
  'importedMovieKeys',
] as const

type Snap = Record<string, unknown>

// Empty value for every synced field, so hydrating a remote blob FULLY replaces
// local state — a missing/empty key resets to empty rather than keeping whatever
// the previous account left behind. This is what makes a fresh account truly
// virgin and prevents one user's data leaking into another on a shared browser.
const EMPTY_DEFAULTS: Snap = {
  watchlistShows: {}, watchlistMovies: {}, watchedEpisodes: {}, watchedMovies: {},
  favoriteShows: {}, favoriteMovies: {}, notifyShows: {}, ratings: {},
  movieRatings: {}, episodeRatings: {}, ratingAt: {}, libraryShows: {}, libraryMovies: {},
  lastWatched: {}, followedAt: {}, addedAt: {}, stoppedShows: {}, lists: [],
  profile: { username: '', following: 0, followers: 0, comments: 0 },
  tvTimeImported: true, tvTimeMoviesImported: true, migrationVersion: 999,
  importedShowIds: {}, importedMovieKeys: {},
}

function snapshot(): Snap {
  const s = useLibrary.getState() as unknown as Record<string, unknown>
  const o: Snap = {}
  for (const k of SYNC_KEYS) o[k] = s[k]
  return o
}
function hydrate(data: Snap) {
  const full: Snap = {}
  for (const k of SYNC_KEYS) full[k] = k in data && data[k] !== undefined ? data[k] : EMPTY_DEFAULTS[k]
  useLibrary.setState(full as never)
}
/** Does a snapshot contain any user-created library data? */
function snapHasData(d: Snap): boolean {
  const n = (v: unknown) => (v && typeof v === 'object' ? Object.keys(v as object).length : 0)
  return [
    d.watchlistShows, d.watchlistMovies, d.watchedEpisodes, d.watchedMovies,
    d.favoriteShows, d.favoriteMovies, d.notifyShows, d.ratings,
    d.movieRatings, d.episodeRatings, d.ratingAt, d.libraryShows,
    d.libraryMovies, d.lastWatched, d.followedAt, d.addedAt,
    d.stoppedShows, d.lists, d.importedShowIds, d.importedMovieKeys,
  ].some((v) => n(v) > 0) ||
    JSON.stringify(d.profile ?? EMPTY_DEFAULTS.profile) !== JSON.stringify(EMPTY_DEFAULTS.profile)
}

/** Recognize older TV Time imports that predate account ownership markers. */
function hasTvTimeImportData(d: Snap): boolean {
  const hasEntries = (value: unknown) => value !== null && typeof value === 'object' && Object.keys(value).length > 0
  return hasEntries(d.importedShowIds) || hasEntries(d.importedMovieKeys)
}
interface Meta {
  localUpdatedAt: number
  hasSynced?: boolean
  userId?: string
}
const META_KEY = 'tw-sync-meta'
const LOCAL_OWNER_KEY = 'tw-local-library-owner'
function getMeta(): Meta {
  try {
    const p = JSON.parse(localStorage.getItem(META_KEY) || '{}') as Partial<Meta>
    return { localUpdatedAt: p.localUpdatedAt ?? 0, hasSynced: p.hasSynced, userId: p.userId }
  } catch {
    return { localUpdatedAt: 0 }
  }
}
function setMeta(m: Meta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m))
    if (m.userId) localStorage.setItem(LOCAL_OWNER_KEY, m.userId)
  } catch {
    /* ignore */
  }
}

function localOwnerId(): string | undefined {
  try {
    return getMeta().userId || localStorage.getItem(LOCAL_OWNER_KEY) || undefined
  } catch {
    return getMeta().userId
  }
}

type Status = 'disabled' | 'signedOut' | 'signedIn' | 'busy'

interface SyncState {
  status: Status
  email?: string
  lastSyncedAt?: number
  remoteNewer?: boolean
  syncReady?: boolean
  mayShowLocal?: boolean
  canKeepDeviceCopy?: boolean
  /** The signed-in account's cloud library is empty, so "keep cloud" clears this device. */
  cloudEmpty?: boolean
  pendingWrite?: boolean
  error?: string
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, opts?: SignUpOpts) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  backupNow: () => Promise<void>
  restoreNow: () => Promise<void>
  retrySync: () => Promise<void>
  deleteCloudData: () => Promise<boolean>
}

let currentUserId: string | null = null
let applyingRemote = false
let lastJson = ''
let lastSavedJson: string | null = null
let pushTimer: ReturnType<typeof setTimeout> | undefined
let pushRetry: ReturnType<typeof setTimeout> | undefined
let pushInFlight: Promise<boolean> | null = null
let initialized = false
let sessionInitialized = false

export const useSync = create<SyncState>((set) => ({
  status: SUPABASE_ENABLED ? 'busy' : 'disabled',
  syncReady: false,
  mayShowLocal: !SUPABASE_ENABLED,

  signIn: async (email, password) => {
    if (!supabase) return
    set({ status: 'busy', mayShowLocal: !snapHasData(snapshot()), error: undefined })
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return set({ status: 'signedOut', error: error.message })
    // onAuthStateChange fires and drives reconcile.
  },

  signInWithGoogle: async () => {
    if (!supabase) return
    set({ status: 'busy', error: undefined })
    // Return to the app root without the #/route; HashRouter restores a route
    // and the auth client exchanges the ?code=… for a session on load.
    const redirectTo = window.location.origin + window.location.pathname
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, queryParams: { prompt: 'select_account' } },
    })
    if (error) set({ status: 'signedOut', error: error.message })
    // On success the browser navigates to Google; nothing else runs here.
  },

  signUp: async (email, password, opts) => {
    if (!supabase) return
    set({ status: 'busy', mayShowLocal: !snapHasData(snapshot()), error: undefined })
    const { error } = await supabase.auth.signUp({
      email,
      password,
      // display name + public/private choice are carried as signup metadata and
      // applied to the profile row by the handle_new_user trigger.
      options: { data: { display_name: opts?.displayName || '', visibility: opts?.visibility || 'public' } },
    })
    if (error) return set({ status: 'signedOut', error: error.message })
    // Remember the chosen username to claim once a session exists.
    if (opts?.username) {
      try {
        localStorage.setItem(PENDING_USERNAME_KEY, JSON.stringify({
          email: email.trim().toLowerCase(),
          username: opts.username,
        }))
      } catch {
        /* ignore */
      }
    }
    const { data } = await supabase.auth.getSession()
    if (data.session) {
      await claimPendingUsername(data.session.user.email)
    } else {
      set({ status: 'signedOut', error: 'Check your email to confirm your account, then sign in.' })
    }
  },

  signOut: async () => {
    if (!supabase || !currentUserId) return
    if (!useSync.getState().syncReady || useSync.getState().remoteNewer) {
      set({ error: 'Resolve the cloud sync issue before signing out. Your library is still on this device.' })
      return
    }
    set({ status: 'busy', error: undefined })
    clearTimeout(pushTimer)
    clearTimeout(pushRetry)
    // A previous successful backup does not prove that recent edits were saved.
    let saved = lastSavedJson === JSON.stringify(snapshot()) && !useSync.getState().pendingWrite
    for (let attempt = 0; !saved && attempt < 3; attempt++) {
      if (!await pushNow()) break
      saved = lastSavedJson === JSON.stringify(snapshot()) && !useSync.getState().pendingWrite
    }
    if (!saved) {
      set({ status: 'signedIn' })
      useToast.getState().show("Sign-out paused: your latest changes are not backed up.", { duration: 5000 })
      return
    }
    clearTimeout(pushTimer)
    clearTimeout(pushRetry)
    set({ syncReady: false })
    const { error } = await supabase.auth.signOut()
    if (error) {
      set({ status: 'signedIn', syncReady: true, error: error.message })
      return
    }
    currentUserId = null
    if (lastSavedJson !== JSON.stringify(snapshot())) {
      useToast.getState().show('Signed out, but a change made during sign-out remains on this device. Download a backup before switching accounts.', { duration: 7000 })
      return
    }
    clearLocalAccount()
    location.reload()
  },

  // Deletes the cloud library only. Auth identity and social data remain.
  deleteCloudData: async () => {
    if (!supabase || !currentUserId) return false
    const userId = currentUserId
    set({ status: 'busy' })
    clearTimeout(pushTimer)
    clearTimeout(pushRetry)
    if (pushInFlight) await pushInFlight
    if (currentUserId !== userId) return false
    clearTimeout(pushTimer)
    const { data: deleted, error } = await supabase.from(LIBRARY_TABLE)
      .delete().eq('user_id', userId).select('user_id')
    if (error) {
      set({ status: 'signedIn', error: error.message })
      return false
    }
    if (!deleted?.length) {
      try {
        if (await fetchRemote(userId)) {
          set({ status: 'signedIn', error: 'The cloud library could not be deleted.' })
          return false
        }
      } catch (e) {
        set({ status: 'signedIn', error: errorMessage(e) })
        return false
      }
    }
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) {
      set({ status: 'signedIn', syncReady: false, remoteNewer: true, error: signOutError.message })
      return false
    }
    currentUserId = null
    return true
  },

  backupNow: async () => {
    const ownerId = localOwnerId()
    if (currentUserId && (ownerId ? ownerId !== currentUserId : hasTvTimeImportData(snapshot()))) {
      set({ error: 'This device library belongs to a different account. Keep your cloud copy instead.' })
      return
    }
    if (!useSync.getState().syncReady && !useSync.getState().remoteNewer) {
      set({ error: 'Check the cloud connection before backing up.' })
      return
    }
    set({ status: 'busy' })
    const ok = await pushNow()
    set({ status: 'signedIn', ...(ok ? { remoteNewer: false, syncReady: true, mayShowLocal: true } : {}) })
  },

  restoreNow: async () => {
    set({ status: 'busy' })
    try {
      if (!await download()) {
        if (!useSync.getState().remoteNewer || !currentUserId) {
          set({ status: 'signedIn', error: 'No cloud library was found for this account.' })
          return
        }
        // Explicitly choosing the empty cloud account discards this device copy.
        applyingRemote = true
        try {
          hydrate({})
          lastJson = JSON.stringify(snapshot())
          lastSavedJson = lastJson
          setMeta({ localUpdatedAt: Date.now(), hasSynced: true, userId: currentUserId })
        } finally {
          applyingRemote = false
        }
      }
      set({ status: 'signedIn', remoteNewer: false, syncReady: true, mayShowLocal: true, pendingWrite: false, error: undefined })
    } catch (e) {
      set({ status: 'signedIn', error: errorMessage(e) })
    }
  },

  retrySync: async () => {
    if (currentUserId) await reconcile()
  },

}))

function clearLocalAccount() {
  try {
    localStorage.removeItem('the-watcher-library-v1')
    localStorage.removeItem(META_KEY)
    localStorage.removeItem(LOCAL_OWNER_KEY)
    localStorage.removeItem('tw-onboarded')
    localStorage.removeItem(PENDING_USERNAME_KEY)
  } catch {
    /* ignore */
  }
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Cloud sync failed. Try again.'
}

/**
 * Serialize writes so a slow older backup cannot land after a newer one.
 * A failed write leaves the device copy intact and is never marked as saved.
 */
async function pushNow(): Promise<boolean> {
  if (!supabase || !currentUserId) return false
  while (pushInFlight) {
    await pushInFlight
    if (lastSavedJson === JSON.stringify(snapshot())) return true
  }
  if (!currentUserId) return false
  const userId = currentUserId
  const data = snapshot()
  const json = JSON.stringify(data)
  const task = (async () => {
    try {
      const { data: saved, error } = await supabase!
        .from(LIBRARY_TABLE)
        .upsert({ user_id: userId, data }, { onConflict: 'user_id' })
        .select('updated_at')
        .single()
      if (currentUserId !== userId) return false
      if (error) throw error
      const ms = Date.parse(saved.updated_at)
      setMeta({ localUpdatedAt: ms, hasSynced: true, userId })
      lastSavedJson = json
      lastJson = json
      clearTimeout(pushRetry)
      const changedAgain = json !== JSON.stringify(snapshot())
      useSync.setState({ lastSyncedAt: ms, error: undefined, pendingWrite: changedAgain })
      if (changedAgain) pushTimer = setTimeout(() => void pushNow(), 1500)
      return true
    } catch (e) {
      if (currentUserId !== userId) return false
      useSync.setState({ error: errorMessage(e), pendingWrite: true })
      useToast.getState().show("Couldn't back up to the cloud — will retry", { duration: 4000 })
      clearTimeout(pushRetry)
      if (useSync.getState().syncReady) pushRetry = setTimeout(() => void pushNow(), 15000)
      return false
    }
  })()
  pushInFlight = task
  try {
    return await task
  } finally {
    if (pushInFlight === task) pushInFlight = null
  }
}

async function fetchRemote(userId: string): Promise<{ data: Snap; ms: number } | null> {
  if (!supabase) throw new Error('Cloud sync is unavailable.')
  const { data, error } = await supabase
    .from(LIBRARY_TABLE)
    .select('data, updated_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return { data: (data.data ?? {}) as Snap, ms: Date.parse(data.updated_at) }
}

async function download(): Promise<boolean> {
  if (!currentUserId) return false
  const userId = currentUserId
  const remote = await fetchRemote(userId)
  if (!remote || currentUserId !== userId) return false
  applyRemote(remote, userId)
  return true
}

function applyRemote(remote: { data: Snap; ms: number }, userId: string) {
  applyingRemote = true
  try {
    hydrate(remote.data)
    lastJson = JSON.stringify(snapshot())
    lastSavedJson = lastJson
    setMeta({ localUpdatedAt: remote.ms, hasSynced: true, userId })
  } finally {
    applyingRemote = false
  }
  useSync.setState({ lastSyncedAt: remote.ms })
}

// Never infer "no cloud library" from a failed read. Any populated device
// library needs an explicit choice before it enters an empty cloud account,
// since its last owner may be somebody else.
async function reconcile() {
  const userId = currentUserId
  if (!userId) return
  clearTimeout(pushTimer)
  clearTimeout(pushRetry)
  useSync.setState({ syncReady: false, error: undefined, remoteNewer: false, canKeepDeviceCopy: false, cloudEmpty: false })
  try {
    const remote = await fetchRemote(userId)
    if (currentUserId !== userId) return
    const local = snapshot()
    const localHasData = snapHasData(local)
    const remoteHasData = !!remote && snapHasData(remote.data)
    const ownerId = localOwnerId()
    const belongsElsewhere = ownerId ? ownerId !== userId : hasTvTimeImportData(local)

    if (!localHasData && remoteHasData && remote) {
      applyRemote(remote, userId)
      useSync.setState({ syncReady: true, mayShowLocal: true, pendingWrite: false })
      return
    }
    if (!localHasData && !remoteHasData) {
      applyingRemote = true
      try {
        hydrate(remote?.data ?? {})
      } finally {
        applyingRemote = false
      }
      lastJson = JSON.stringify(snapshot())
      lastSavedJson = lastJson
      setMeta({ localUpdatedAt: remote?.ms ?? Date.now(), hasSynced: true, userId })
      useSync.setState({ syncReady: true, mayShowLocal: true, pendingWrite: false })
      return
    }
    if (localHasData && !remoteHasData) {
      useSync.setState({
        remoteNewer: true,
        cloudEmpty: true,
        canKeepDeviceCopy: !belongsElsewhere,
        error: belongsElsewhere ? 'This device has another account’s library. Only the cloud copy can be used here.' : undefined,
      })
      return
    }
    // Even a locally newer copy can contain changes missing from the cloud.
    // Ask whenever both non-empty copies differ instead of guessing by time.
    const comparable = (d: Snap) => JSON.stringify(SYNC_KEYS.map((k) => d[k] ?? EMPTY_DEFAULTS[k]))
    // A legacy device library with no owner marker that is identical to this
    // account's cloud copy is provably this account's: adopt it instead of
    // forcing a "keep cloud copy" choice. Identical content exposes nothing.
    const sameOwnerOrUnknown = !ownerId || ownerId === userId
    if (remote && sameOwnerOrUnknown && comparable(local) === comparable(remote.data)) {
      lastJson = JSON.stringify(local)
      lastSavedJson = lastJson
      setMeta({ localUpdatedAt: remote.ms, hasSynced: true, userId })
      useSync.setState({ syncReady: true, mayShowLocal: true, pendingWrite: false })
    } else {
      useSync.setState({
        remoteNewer: true,
        canKeepDeviceCopy: !belongsElsewhere,
        error: belongsElsewhere ? 'This device has another account’s library. Only the cloud copy can be used here.' : undefined,
      })
    }
  } catch (e) {
    if (currentUserId === userId) {
      useSync.setState({ error: `Could not read your cloud library: ${errorMessage(e)}`, syncReady: false })
    }
  }
}

function subscribeChanges() {
  useLibrary.subscribe(() => {
    if (!currentUserId || !useSync.getState().syncReady || applyingRemote) return
    const j = JSON.stringify(snapshot())
    if (j === lastJson) return
    lastJson = j
    clearTimeout(pushTimer)
    pushTimer = setTimeout(() => void pushNow(), 1500)
  })
}

/** Call once on app start. Wires auth state → reconcile, and change → backup. */
export async function initSync() {
  if (!supabase || initialized) return
  initialized = true
  lastJson = JSON.stringify(snapshot())
  subscribeChanges()

  // Flush a failed write as soon as connectivity or focus returns.
  const flushPending = () => {
    if (currentUserId && useSync.getState().syncReady && useSync.getState().pendingWrite) void pushNow()
  }
  window.addEventListener('online', flushPending)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') flushPending()
  })

  const acceptSession = (session: { user: { id: string; email?: string } } | null) => {
    const userId = session?.user.id ?? null
    if (sessionInitialized && userId === currentUserId) return
    sessionInitialized = true
    clearTimeout(pushTimer)
    clearTimeout(pushRetry)
    currentUserId = userId
    lastSavedJson = null
    if (session) {
      const local = snapshot()
      const ownerId = localOwnerId()
      const mayShowLocal = !snapHasData(local) || ownerId === userId
      // Remember an account even if its first cloud write has not completed.
      // This prevents a later signed-out visit from exposing its device copy.
      if (!ownerId && !hasTvTimeImportData(local)) {
        try { localStorage.setItem(LOCAL_OWNER_KEY, session.user.id) } catch { /* ignore */ }
      }
      useSync.setState({
        status: 'signedIn', email: session.user.email, syncReady: false,
        remoteNewer: false, pendingWrite: false, mayShowLocal, canKeepDeviceCopy: false, error: undefined,
      })
      void claimPendingUsername(session.user.email)
      void reconcile()
    } else {
      useSync.setState({
        status: 'signedOut', email: undefined, syncReady: false,
        remoteNewer: false, pendingWrite: false,
        mayShowLocal: !localOwnerId() && !hasTvTimeImportData(snapshot()), canKeepDeviceCopy: false,
      })
    }
  }
  supabase.auth.onAuthStateChange((_event, session) => acceptSession(session))

  const { data, error } = await supabase.auth.getSession()
  if (error) useSync.setState({ error: error.message })
  else acceptSession(data.session)
}
