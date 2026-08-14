import { create } from 'zustand'
import { supabase, SUPABASE_ENABLED, LIBRARY_TABLE } from '../data/supabase'
import { useLibrary } from '../store/useLibrary'

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

function snapshot(): Snap {
  const s = useLibrary.getState() as unknown as Record<string, unknown>
  const o: Snap = {}
  for (const k of SYNC_KEYS) o[k] = s[k]
  return o
}
function hydrate(data: Snap) {
  useLibrary.setState(data as never)
}
function isLocalEmpty(): boolean {
  const s = useLibrary.getState()
  return (
    Object.keys(s.watchlistShows).length === 0 &&
    Object.keys(s.watchedEpisodes).length === 0 &&
    Object.keys(s.libraryShows).length === 0 &&
    Object.keys(s.watchlistMovies).length === 0
  )
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
  error?: string
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
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

  signUp: async (email, password) => {
    if (!supabase) return
    set({ status: 'busy', error: undefined })
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) return set({ status: 'signedOut', error: error.message })
    // If email confirmation is off, a session is returned and onAuthStateChange fires.
    const { data } = await supabase.auth.getSession()
    if (!data.session) set({ status: 'signedOut', error: 'Check your email to confirm your account, then sign in.' })
  },

  signOut: async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    currentUserId = null
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

async function pushNow() {
  if (!supabase || !currentUserId) return
  const now = Date.now()
  const meta = getMeta()
  meta.localUpdatedAt = now
  meta.hasSynced = true
  setMeta(meta)
  const data = snapshot()
  lastJson = JSON.stringify(data)
  const { error } = await supabase
    .from(LIBRARY_TABLE)
    .upsert({ user_id: currentUserId, data, updated_at: new Date(now).toISOString() }, { onConflict: 'user_id' })
  if (error) useSync.setState({ error: error.message })
  else useSync.setState({ lastSyncedAt: now, error: undefined })
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

// Decide direction after auth: fresh device restores, otherwise last-write-wins.
async function reconcile() {
  const remote = await fetchRemote()
  const meta = getMeta()
  if (!remote) {
    await pushNow() // first backup for this account
    return
  }
  if (!meta.hasSynced || isLocalEmpty()) {
    await download() // first time on this device → restore everything
    return
  }
  if (remote.ms > meta.localUpdatedAt) {
    // Cloud is ahead but this device has local data — let the user choose.
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

  supabase.auth.onAuthStateChange((_event, session) => {
    currentUserId = session?.user?.id ?? null
    if (session) {
      useSync.setState({ status: 'signedIn', email: session.user.email ?? undefined })
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
