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

// Claim a username stored at signup, once a session exists (covers the
// email-confirmation flow where there's no session until first sign-in).
async function claimPendingUsername() {
  let uname: string | null = null
  try {
    uname = localStorage.getItem(PENDING_USERNAME_KEY)
  } catch {
    /* ignore */
  }
  if (!uname) return
  const r = await claimUsername(uname)
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
/** Does a snapshot actually contain a library (vs. an empty/virgin account)? */
function snapHasData(d: Snap): boolean {
  const n = (v: unknown) => (v && typeof v === 'object' ? Object.keys(v as object).length : 0)
  return n(d.watchlistShows) + n(d.watchedEpisodes) + n(d.libraryShows) + n(d.watchlistMovies) + n(d.watchedMovies) > 0
}
function isLocalEmpty(): boolean {
  return !snapHasData(snapshot())
}

interface Meta {
  localUpdatedAt: number
  hasSynced?: boolean
}
const META_KEY = 'tw-sync-meta'
function getMeta(): Meta {
  try {
    const p = JSON.parse(localStorage.getItem(META_KEY) || '{}') as Partial<Meta>
    return { localUpdatedAt: p.localUpdatedAt ?? 0, hasSynced: p.hasSynced }
  } catch {
    return { localUpdatedAt: 0 }
  }
}
function setMeta(m: Meta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m))
  } catch {
    /* ignore */
  }
}

type Status = 'disabled' | 'signedOut' | 'signedIn' | 'busy'

interface SyncState {
  status: Status
  email?: string
  lastSyncedAt?: number
  remoteNewer?: boolean
  pendingWrite?: boolean
  error?: string
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, opts?: SignUpOpts) => Promise<void>
  signOut: () => Promise<void>
  backupNow: () => Promise<void>
  restoreNow: () => Promise<void>
  deleteCloudData: () => Promise<void>
}

let currentUserId: string | null = null
let applyingRemote = false
let lastJson = ''
let pushTimer: ReturnType<typeof setTimeout> | undefined

export const useSync = create<SyncState>((set) => ({
  status: SUPABASE_ENABLED ? 'signedOut' : 'disabled',

  signIn: async (email, password) => {
    if (!supabase) return
    set({ status: 'busy', error: undefined })
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return set({ status: 'signedOut', error: error.message })
    // onAuthStateChange fires and drives reconcile.
  },

  signUp: async (email, password, opts) => {
    if (!supabase) return
    set({ status: 'busy', error: undefined })
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
        localStorage.setItem(PENDING_USERNAME_KEY, opts.username)
      } catch {
        /* ignore */
      }
    }
    const { data } = await supabase.auth.getSession()
    if (data.session) {
      await claimPendingUsername()
    } else {
      set({ status: 'signedOut', error: 'Check your email to confirm your account, then sign in.' })
    }
  },

  signOut: async () => {
    if (!supabase) return
    set({ status: 'busy' })
    // Flush the latest data to the cloud before wiping local, so nothing is lost.
    // Only clear local if the data is safely in the cloud (just-pushed or already
    // synced); otherwise keep it on this device and still sign out.
    let safe = false
    try {
      safe = (await pushNow()) || !!getMeta().hasSynced
    } catch {
      safe = !!getMeta().hasSynced
    }
    await supabase.auth.signOut()
    currentUserId = null
    if (safe) {
      // Reset to a clean, signed-out device: the next person (or a new account)
      // starts virgin and lands on the sign-in screen.
      try {
        localStorage.removeItem('the-watcher-library-v1')
        localStorage.removeItem('tw-sync-meta')
        localStorage.removeItem('tw-onboarded')
        localStorage.removeItem('tw-pending-username')
      } catch {
        /* ignore */
      }
      location.reload()
      return
    }
    useToast.getState().show("Signed out — couldn't reach the cloud, so your data is kept on this device.", { duration: 5000 })
    set({ status: 'signedOut', email: undefined, lastSyncedAt: undefined, remoteNewer: false })
  },

  // Permanently deletes this account's cloud library row, then signs out. (The
  // auth user itself can only be removed by an admin, so we clear the data we
  // control and are honest about it in the UI.)
  deleteCloudData: async () => {
    if (!supabase || !currentUserId) return
    set({ status: 'busy' })
    await supabase.from(LIBRARY_TABLE).delete().eq('user_id', currentUserId)
    await supabase.auth.signOut()
    currentUserId = null
    set({ status: 'signedOut', email: undefined, lastSyncedAt: undefined, remoteNewer: false })
  },

  backupNow: async () => {
    set({ status: 'busy' })
    await pushNow()
    set({ status: 'signedIn', remoteNewer: false })
  },

  restoreNow: async () => {
    set({ status: 'busy' })
    await download()
    set({ status: 'signedIn', remoteNewer: false })
  },
}))

let pushRetry: ReturnType<typeof setTimeout> | undefined

/**
 * Persist the whole library to the user's cloud row. The server owns the
 * updated_at timestamp (read back after write) so last-write-wins never depends
 * on client clock skew. On failure the local copy is kept, the error is surfaced,
 * and the write is retried — a failed write is never treated as a success.
 */
async function pushNow(): Promise<boolean> {
  if (!supabase || !currentUserId) return false
  const now = Date.now()
  const data = snapshot()
  lastJson = JSON.stringify(data)
  const { error } = await supabase
    .from(LIBRARY_TABLE)
    .upsert({ user_id: currentUserId, data, updated_at: new Date(now).toISOString() }, { onConflict: 'user_id' })
  if (error) {
    useSync.setState({ error: error.message, pendingWrite: true })
    useToast.getState().show("Couldn't back up to the cloud — will retry", { duration: 4000 })
    clearTimeout(pushRetry)
    pushRetry = setTimeout(() => void pushNow(), 15000)
    return false
  }
  const meta = getMeta()
  meta.localUpdatedAt = now
  meta.hasSynced = true
  setMeta(meta)
  useSync.setState({ lastSyncedAt: now, error: undefined, pendingWrite: false })
  return true
}

async function fetchRemote(): Promise<{ data: Snap; ms: number } | null> {
  if (!supabase || !currentUserId) return null
  const { data, error } = await supabase
    .from(LIBRARY_TABLE)
    .select('data, updated_at')
    .eq('user_id', currentUserId)
    .maybeSingle()
  if (error || !data) return null
  return { data: (data.data ?? {}) as Snap, ms: Date.parse(data.updated_at) }
}

async function download() {
  const remote = await fetchRemote()
  if (!remote) return
  applyingRemote = true
  hydrate(remote.data)
  lastJson = JSON.stringify(snapshot())
  setMeta({ localUpdatedAt: remote.ms, hasSynced: true })
  applyingRemote = false
  useSync.setState({ lastSyncedAt: remote.ms })
}

// Decide direction after auth, account-isolation-safe:
//   local empty + account has data   → download the account's library
//   local has data + account empty   → upload (claim) local into this account
//   both empty                       → virgin: hard-reset to empty, mark synced
//   both have data                   → conflict → let the user choose
// Combined with sign-out clearing local, this guarantees a signed-in account
// only ever shows its OWN data, and a brand-new account starts empty.
async function reconcile() {
  const remote = await fetchRemote()
  const remoteHasData = !!remote && snapHasData(remote.data)
  const localHasData = !isLocalEmpty()

  if (!localHasData && remoteHasData) {
    await download()
    return
  }
  if (localHasData && !remoteHasData) {
    await pushNow()
    return
  }
  if (!localHasData && !remoteHasData) {
    // Virgin account (or empty cloud): make local a clean, synced empty state.
    hydrate(remote ? remote.data : {})
    lastJson = JSON.stringify(snapshot())
    setMeta({ localUpdatedAt: remote ? remote.ms : Date.now(), hasSynced: true })
    return
  }
  // Both have data — don't silently clobber; ask the user which to keep.
  const meta = getMeta()
  if (!remote) return
  if (!meta.hasSynced || remote.ms > meta.localUpdatedAt) {
    useSync.setState({ remoteNewer: true })
  } else {
    await pushNow()
  }
}

function subscribeChanges() {
  useLibrary.subscribe(() => {
    if (!currentUserId || applyingRemote) return
    const j = JSON.stringify(snapshot())
    if (j === lastJson) return
    lastJson = j
    clearTimeout(pushTimer)
    pushTimer = setTimeout(() => void pushNow(), 1500)
  })
}

/** Call once on app start. Wires auth state → reconcile, and change → backup. */
export async function initSync() {
  if (!supabase) return
  lastJson = JSON.stringify(snapshot())
  subscribeChanges()

  // Flush a failed write as soon as connectivity or focus returns.
  const flushPending = () => {
    if (currentUserId && useSync.getState().pendingWrite) void pushNow()
  }
  window.addEventListener('online', flushPending)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') flushPending()
  })

  supabase.auth.onAuthStateChange((_event, session) => {
    currentUserId = session?.user?.id ?? null
    if (session) {
      useSync.setState({ status: 'signedIn', email: session.user.email ?? undefined })
      void claimPendingUsername()
      void reconcile()
    } else {
      useSync.setState({ status: 'signedOut', email: undefined })
    }
  })

  const { data } = await supabase.auth.getSession()
  if (data.session) {
    currentUserId = data.session.user.id
    useSync.setState({ status: 'signedIn', email: data.session.user.email ?? undefined })
    void reconcile()
  }
}
