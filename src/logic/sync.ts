import { discardPending } from '../utils/deferredStorage'
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

// Where auth emails and OAuth send people back: the app root, no #/route.
const appUrl = () => window.location.origin + window.location.pathname

// A password-reset email links back with ?reset=1 (plus Supabase's ?code=).
const OPENED_FROM_RESET = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('reset')

/** Supabase auth messages → plain language. */
function friendlyAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login')) return 'Wrong email or password.'
  if (m.includes('already registered') || m.includes('already been registered')) return 'That email already has an account. Sign in instead.'
  if (m.includes('email not confirmed')) return 'Confirm your email first. Check your inbox for the link.'
  if (m.includes('password should be') || m.includes('at least')) return 'Use a password with at least 6 characters.'
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Wait a minute and try again.'
  if (m.includes('unable to validate email') || m.includes('invalid email')) return 'That email address doesn’t look right.'
  if (m.includes('failed to fetch') || m.includes('network')) return 'Can’t reach the server. Check your connection.'
  return message
}

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
  /** Server time of the cloud copy this device last matched (saved or loaded). */
  localUpdatedAt: number
  hasSynced?: boolean
  userId?: string
  /** This account changed the library on this device and the cloud doesn't have it yet. */
  dirty?: boolean
}
const META_KEY = 'tw-sync-meta'
const LOCAL_OWNER_KEY = 'tw-local-library-owner'
function getMeta(): Meta {
  try {
    const p = JSON.parse(localStorage.getItem(META_KEY) || '{}') as Partial<Meta>
    return { localUpdatedAt: p.localUpdatedAt ?? 0, hasSynced: p.hasSynced, userId: p.userId, dirty: p.dirty }
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
  userId?: string
  lastSyncedAt?: number
  syncReady?: boolean
  mayShowLocal?: boolean
  pendingWrite?: boolean
  error?: string
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, opts?: SignUpOpts) => Promise<'signedIn' | 'confirm' | 'error'>
  signInWithGoogle: () => Promise<void>
  sendPasswordReset: (email: string) => Promise<boolean>
  updatePassword: (password: string) => Promise<boolean>
  /** Opened from a password-reset email: ask for a new password once signed in. */
  recovering?: boolean
  signOut: () => Promise<void>
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
  recovering: OPENED_FROM_RESET,
  mayShowLocal: !SUPABASE_ENABLED,

  signIn: async (email, password) => {
    if (!supabase) return
    set({ status: 'busy', mayShowLocal: !snapHasData(snapshot()), error: undefined })
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) return set({ status: 'signedOut', error: friendlyAuthError(error.message) })
    // onAuthStateChange fires and drives reconcile.
  },

  signInWithGoogle: async () => {
    if (!supabase) return
    set({ status: 'busy', error: undefined })
    // Return to the app root without the #/route; HashRouter restores a route
    // and the auth client exchanges the ?code=… for a session on load.
    const redirectTo = appUrl()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, queryParams: { prompt: 'select_account' } },
    })
    if (error) set({ status: 'signedOut', error: friendlyAuthError(error.message) })
    // On success the browser navigates to Google; nothing else runs here.
  },

  signUp: async (email, password, opts) => {
    if (!supabase) return 'error'
    set({ status: 'busy', mayShowLocal: !snapHasData(snapshot()), error: undefined })
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      // @username and public/private are chosen on the "Finish your profile"
      // step right after the first sign-in (same for email and Google).
      options: {
        emailRedirectTo: appUrl(),
        data: { display_name: opts?.displayName || '', visibility: opts?.visibility || 'public' },
      },
    })
    if (error) {
      set({ status: 'signedOut', error: friendlyAuthError(error.message) })
      return 'error'
    }
    if (data.session) return 'signedIn'
    // Email confirmation is on: no session until the link is opened.
    set({ status: 'signedOut' })
    return 'confirm'
  },

  sendPasswordReset: async (email) => {
    if (!supabase) return false
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl() + '?reset=1' })
    if (error) set({ error: friendlyAuthError(error.message) })
    return !error
  },

  updatePassword: async (password) => {
    if (!supabase) return false
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      set({ error: friendlyAuthError(error.message) })
      return false
    }
    set({ recovering: false, error: undefined })
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete('reset')
      window.history.replaceState(window.history.state, '', url.toString())
    } catch {
      /* ignore */
    }
    return true
  },

  signOut: async () => {
    if (!supabase || !currentUserId) return
    if (!useSync.getState().syncReady) {
      useToast.getState().show('Connect to the internet to sign out, so your latest changes are saved first.', { duration: 4000 })
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
      useToast.getState().show('Couldn’t save your latest changes, so you’re still signed in. Try again in a moment.', { duration: 5000 })
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
      set({ status: 'signedIn', syncReady: false, error: signOutError.message })
      return false
    }
    currentUserId = null
    return true
  },

  retrySync: async () => {
    if (currentUserId) await reconcile()
  },

}))

/** Did this device's account change its library without the cloud getting it yet? */
export function hasUnsavedDeviceChanges(): boolean {
  return !!getMeta().dirty
}

/** Remove the library saved on this device (explicit user choice, signed out). */
export function forgetDeviceLibrary() {
  clearLocalAccount()
  try {
    localStorage.setItem('tw-onboarded', '1')
  } catch {
    /* ignore */
  }
  location.reload()
}

function clearLocalAccount() {
  try {
    discardPending('the-watcher-library-v1')
    localStorage.removeItem('the-watcher-library-v1')
    localStorage.removeItem(META_KEY)
    localStorage.removeItem(LOCAL_OWNER_KEY)
    localStorage.removeItem('tw-onboarded')
    localStorage.removeItem(PENDING_USERNAME_KEY)
    localStorage.removeItem('tw-me')
    localStorage.removeItem('tw-clsync')
    // Cached community/comment screens (stale-while-revalidate copies).
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k?.startsWith('tw-cache:')) localStorage.removeItem(k)
    }
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
      lastSavedJson = json
      lastJson = json
      clearTimeout(pushRetry)
      const changedAgain = json !== JSON.stringify(snapshot())
      setMeta({ localUpdatedAt: ms, hasSynced: true, userId, dirty: changedAgain })
      useSync.setState({ lastSyncedAt: ms, error: undefined, pendingWrite: changedAgain })
      if (changedAgain) pushTimer = setTimeout(() => void pushNow(), 1500)
      return true
    } catch (e) {
      if (currentUserId !== userId) return false
      // Quietly retry; the change is kept on this device (marked dirty) meanwhile.
      useSync.setState({ error: errorMessage(e), pendingWrite: true })
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

function applyRemote(remote: { data: Snap; ms: number }, userId: string) {
  applyingRemote = true
  try {
    hydrate(remote.data)
    lastJson = JSON.stringify(snapshot())
    lastSavedJson = lastJson
    setMeta({ localUpdatedAt: remote.ms, hasSynced: true, userId, dirty: false })
  } finally {
    applyingRemote = false
  }
  useSync.setState({ lastSyncedAt: remote.ms })
}

/**
 * Combine two copies of the library when both changed (e.g. two devices edited
 * while one was offline). Nothing anyone added is lost: per-title maps are
 * unioned (this device wins where both set the same key), lists are merged by
 * id. The only trade-off: something removed on one side while the other side
 * still had it comes back.
 */
function mergeLibraries(remote: Snap, local: Snap): Snap {
  const out: Snap = {}
  for (const k of SYNC_KEYS) {
    const r = remote[k]
    const l = local[k]
    if (k === 'lists') {
      const byId = new Map<string, unknown>()
      for (const x of (Array.isArray(r) ? r : []) as { id: string }[]) byId.set(x.id, x)
      for (const x of (Array.isArray(l) ? l : []) as { id: string }[]) byId.set(x.id, x)
      out[k] = [...byId.values()]
    } else if (r && l && typeof r === 'object' && typeof l === 'object' && !Array.isArray(r)) {
      out[k] = { ...(r as object), ...(l as object) }
    } else {
      out[k] = l !== undefined ? l : r
    }
  }
  return out
}

/**
 * The cloud is the real library; this device keeps a copy so the app opens
 * instantly and works offline. No questions asked:
 *  - Cloud has a library → use it, unless this device holds this account's own
 *    unsaved changes: then save them (merging if the cloud also changed).
 *  - Cloud is empty → a library made on this device without an account (or by
 *    this account) becomes the account's library; anything else is dropped.
 *  - A device copy from a different account is never shown or uploaded.
 * The server also keeps automatic snapshots of every library (005 SQL).
 * A failed read never counts as "empty": we just retry.
 */
async function reconcile() {
  const userId = currentUserId
  if (!userId) return
  clearTimeout(pushTimer)
  clearTimeout(pushRetry)
  useSync.setState({ syncReady: false, error: undefined })
  try {
    const remote = await fetchRemote(userId)
    if (currentUserId !== userId) return
    const local = snapshot()
    const localHasData = snapHasData(local)
    const remoteHasData = !!remote && snapHasData(remote.data)
    const meta = getMeta()
    const mine = localOwnerId() === userId
    const unsavedHere = mine && !!meta.dirty && localHasData

    const ready = () => useSync.setState({ syncReady: true, mayShowLocal: true, error: undefined })
    const saveLocal = async (data: Snap) => {
      applyingRemote = true
      try {
        hydrate(data)
      } finally {
        applyingRemote = false
      }
      setMeta({ localUpdatedAt: meta.localUpdatedAt, hasSynced: true, userId, dirty: true })
      ready()
      await pushNow()
    }

    if (remoteHasData && remote) {
      if (!unsavedHere) {
        applyRemote(remote, userId)
        ready()
        useSync.setState({ pendingWrite: false })
      } else if (remote.ms <= meta.localUpdatedAt) {
        await saveLocal(local) // cloud unchanged since this device last synced
      } else {
        await saveLocal(mergeLibraries(remote.data, local)) // both changed
      }
      return
    }

    // Cloud empty: adopt this device's library only if it's this account's
    // own or was made without any account. Otherwise start clean.
    const anonymous = !localOwnerId() && !hasTvTimeImportData(local)
    if (localHasData && (mine || anonymous)) {
      await saveLocal(local)
      return
    }
    applyRemote({ data: remote?.data ?? {}, ms: remote?.ms ?? Date.now() }, userId)
    ready()
    useSync.setState({ pendingWrite: false })
  } catch (e) {
    if (currentUserId !== userId) return
    // Offline / unreachable: this account's own device copy stays usable and
    // syncs later; anything else stays hidden until we can check.
    useSync.setState({ error: errorMessage(e), syncReady: false })
    clearTimeout(pushRetry)
    pushRetry = setTimeout(() => {
      if (currentUserId === userId && !useSync.getState().syncReady) void reconcile()
    }, 20000)
  }
}

// Comparing the whole library after every tap (a large JSON.stringify) made
// taps feel slow, so the check runs once changes settle — and right away when
// the app is hidden or closed, so an edit is always marked as unsynced.
let changeTimer: ReturnType<typeof setTimeout> | undefined
function checkForChanges() {
  clearTimeout(changeTimer)
  changeTimer = undefined
  if (!currentUserId || applyingRemote) return
  const st = useSync.getState()
  // Only this account's own (visible) library can be edited.
  if (!st.syncReady && !st.mayShowLocal) return
  const j = JSON.stringify(snapshot())
  if (j === lastJson) return
  lastJson = j
  const m = getMeta()
  if (!m.dirty || m.userId !== currentUserId) setMeta({ ...m, userId: currentUserId, dirty: true })
  if (!st.syncReady) return // offline: saved on this device, uploaded on reconnect
  clearTimeout(pushTimer)
  pushTimer = setTimeout(() => void pushNow(), 1500)
}

function subscribeChanges() {
  useLibrary.subscribe(() => {
    if (!currentUserId || applyingRemote) return
    if (!changeTimer) changeTimer = setTimeout(checkForChanges, 350)
  })
  const flushNow = () => changeTimer && checkForChanges()
  window.addEventListener('pagehide', flushNow)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushNow())
}

/** Call once on app start. Wires auth state → reconcile, and change → backup. */
export async function initSync() {
  if (!supabase || initialized) return
  initialized = true
  lastJson = JSON.stringify(snapshot())
  subscribeChanges()

  // Flush a failed write as soon as connectivity or focus returns.
  const flushPending = () => {
    if (!currentUserId) return
    const st = useSync.getState()
    if (!st.syncReady) void reconcile()
    else if (st.pendingWrite) void pushNow()
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
      // A library made here without an account belongs to whoever signs in.
      const anonymous = !ownerId && !hasTvTimeImportData(local)
      if (anonymous) {
        try { localStorage.setItem(LOCAL_OWNER_KEY, session.user.id) } catch { /* ignore */ }
      }
      const mayShowLocal = !snapHasData(local) || ownerId === userId || anonymous
      useSync.setState({
        status: 'signedIn', email: session.user.email, userId: session.user.id, syncReady: false,
        pendingWrite: false, mayShowLocal, error: undefined,
      })
      void claimPendingUsername(session.user.email)
      void reconcile()
    } else {
      useSync.setState({
        status: 'signedOut', email: undefined, userId: undefined, syncReady: false,
        pendingWrite: false,
        mayShowLocal: !localOwnerId() && !hasTvTimeImportData(snapshot()),
      })
    }
  }
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') useSync.setState({ recovering: true })
    acceptSession(session)
  })

  const { data, error } = await supabase.auth.getSession()
  if (error) useSync.setState({ error: error.message })
  else acceptSession(data.session)
}
