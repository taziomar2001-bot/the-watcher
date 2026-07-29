import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getShow } from '../data/catalog'
import { useLibrary } from '../store/useLibrary'

export interface UpEp {
  season: number
  number: number
  title: string
  airDate: string
}
export interface ShowEps {
  title: string
  poster?: string
  eps: UpEp[]
}

interface UpcomingState {
  byShow: Record<string, ShowEps> // per-show future episodes (the release index)
  fetchedAt: Record<string, number>
  builtAt: number
  building: boolean
  progress: { done: number; total: number }
  _apply: (patch: Partial<UpcomingState>) => void
  _patchShow: (id: string, data: ShowEps, ts: number) => void
}

// Persisted release index — cache-first, incremental.
export const useUpcoming = create<UpcomingState>()(
  persist(
    (set) => ({
      byShow: {},
      fetchedAt: {},
      builtAt: 0,
      building: false,
      progress: { done: 0, total: 0 },
      _apply: (patch) => set(patch),
      _patchShow: (id, data, ts) =>
        set((s) => ({ byShow: { ...s.byShow, [id]: data }, fetchedAt: { ...s.fetchedAt, [id]: ts } })),
    }),
    { name: 'tw-upcoming-v3', partialize: (s) => ({ byShow: s.byShow, fetchedAt: s.fetchedAt, builtAt: s.builtAt }) as UpcomingState },
  ),
)

const SHOW_TTL = 24 * 60 * 60 * 1000 // refetch a show's schedule at most daily
const isReleased = (airDate?: string) => !airDate || new Date(airDate + 'T00:00:00') <= new Date()
const isEnded = (status?: string) => /ended|canceled|cancelled/i.test(status || '')

async function pool<T>(items: T[], limit: number, worker: (t: T) => Promise<void>) {
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) await worker(items[i++])
    }),
  )
}

let inFlight: Promise<void> | null = null

/**
 * Incremental build: prune shows no longer followed/stopped, then fetch only the
 * shows that are new or stale (>24h). Unchanged shows are never refetched, so
 * repeat opens are effectively free.
 */
async function sync(force: boolean, onlyId?: string): Promise<void> {
  const lib = useLibrary.getState()
  const store = useUpcoming.getState()
  const wantedIds = Object.keys(lib.watchlistShows).filter((id) => !lib.stoppedShows[id])
  const wanted = new Set(wantedIds)

  // Prune shows that are no longer followed or are now stopped.
  const byShow = { ...store.byShow }
  const fetchedAt = { ...store.fetchedAt }
  let pruned = false
  for (const id of Object.keys(byShow)) {
    if (!wanted.has(id)) {
      delete byShow[id]
      delete fetchedAt[id]
      pruned = true
    }
  }
  if (pruned) store._apply({ byShow, fetchedAt })

  const now = Date.now()
  const toFetch = (onlyId ? [onlyId] : wantedIds).filter(
    (id) => force || !fetchedAt[id] || now - fetchedAt[id] > SHOW_TTL,
  )
  if (!toFetch.length) {
    store._apply({ builtAt: now })
    return
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayIso = today.toISOString().slice(0, 10)

  useUpcoming.getState()._apply({ building: true, progress: { done: 0, total: toFetch.length } })
  let done = 0
  await pool(toFetch, 8, async (id) => {
    const s = await getShow(id)
    if (s) {
      const all = s.seasons.flatMap((se) => se.episodes)
      const eps = all
        .filter((e) => e.airDate && e.airDate >= todayIso)
        .map((e) => ({ season: e.season, number: e.number, title: e.title, airDate: e.airDate as string }))
      // Reuse the same normalized data to enrich the show's classification fields.
      useLibrary.getState().patchLibraryShow(id, {
        totalEpisodes: s.totalEpisodes || all.length,
        releasedEpisodes: all.filter((e) => isReleased(e.airDate)).length,
        ended: isEnded(s.status),
      })
      useUpcoming.getState()._patchShow(id, { title: s.title, poster: s.poster, eps }, Date.now())
    } else {
      useUpcoming.getState()._patchShow(id, { title: '', poster: undefined, eps: [] }, Date.now())
    }
    done++
    if (done % 6 === 0) useUpcoming.getState()._apply({ progress: { done, total: toFetch.length } })
  })
  useUpcoming.getState()._apply({ builtAt: Date.now(), building: false, progress: { done, total: toFetch.length } })
}

/** Cache-first entry point. Renders instantly from the index; refreshes in background. */
export function ensureUpcoming(force = false): void {
  if (inFlight) return
  inFlight = sync(force).finally(() => (inFlight = null))
}

/** Fetch a single show's schedule (call after following a new show). */
export function refreshUpcomingShow(id: string): void {
  sync(true, id)
}
