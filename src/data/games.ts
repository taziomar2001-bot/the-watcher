import type { Game } from '../types'
import { GAMES_MOCK, GAMES_MOCK_BY_ID } from './mockGames'
import type { Section } from './books'

// ---------------------------------------------------------------------------
// Video games — IGDB, through the `igdb` Supabase Edge Function (the Twitch
// secret IGDB needs must stay on a server). Turned on with VITE_IGDB=on once
// the function is deployed; until then a small sample catalogue is used in
// local/demo mode and the Games category stays hidden in the live app.
// ---------------------------------------------------------------------------

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const FLAG = (import.meta.env.VITE_IGDB as string | undefined)?.trim()
/** VITE_IGDB=on → the project's own function; or a full URL to another proxy. */
const ENDPOINT = FLAG && /^https?:\/\//.test(FLAG) ? FLAG : FLAG && SUPA_URL ? `${SUPA_URL.replace(/\/$/, '')}/functions/v1/igdb` : undefined
export const USE_IGDB = Boolean(ENDPOINT)

const MIN = 60_000
const memo = new Map<string, { at: number; p: Promise<unknown> }>()
function cached<T>(key: string, ttl: number, run: () => Promise<T>): Promise<T> {
  const hit = memo.get(key)
  if (hit && Date.now() - hit.at < ttl) return hit.p as Promise<T>
  const p = run().catch((e) => {
    memo.delete(key)
    throw e
  })
  memo.set(key, { at: Date.now(), p })
  return p
}

async function call<T>(params: Record<string, string | number | undefined>): Promise<T> {
  const u = new URL(ENDPOINT!)
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') u.searchParams.set(k, String(v))
  const headers: Record<string, string> = {}
  if (SUPA_KEY && ENDPOINT!.startsWith(SUPA_URL ?? '\u0000')) {
    headers.apikey = SUPA_KEY
    // Legacy anon keys are JWTs; new publishable keys aren't and go in apikey only.
    if (SUPA_KEY.split('.').length === 3) headers.Authorization = `Bearer ${SUPA_KEY}`
  }
  const r = await fetch(u.toString(), { headers })
  if (!r.ok) throw new Error(`games ${r.status}`)
  return r.json() as Promise<T>
}

export interface GameGenre {
  id: number
  name: string
  /** IGDB genres merged under one friendly name (RTS + TBS → Strategy). */
  ids?: number[]
}

export async function searchGames(query: string): Promise<Game[]> {
  const q = query.trim()
  if (!q) return []
  if (!USE_IGDB) {
    const t = q.toLowerCase()
    return GAMES_MOCK.filter((g) => g.title.toLowerCase().includes(t) || g.developer?.toLowerCase().includes(t))
  }
  return cached('gs:' + q.toLowerCase(), 10 * MIN, () => call<Game[]>({ op: 'search', q }))
}

export async function getGame(id: string): Promise<Game | undefined> {
  if (!USE_IGDB) return GAMES_MOCK_BY_ID[id]
  return cached('g:' + id, 60 * MIN, async () => (await call<Game | null>({ op: 'game', id })) ?? undefined)
}

/** Fresh summaries (release dates move!) for many games at once. */
export async function gamesByIds(ids: string[]): Promise<Game[]> {
  if (!ids.length) return []
  if (!USE_IGDB) return ids.map((id) => GAMES_MOCK_BY_ID[id]).filter(Boolean)
  const out: Game[] = []
  for (let i = 0; i < ids.length; i += 100) out.push(...(await call<Game[]>({ op: 'ids', ids: ids.slice(i, i + 100).join(',') })))
  return out
}

export function gameGenres(): Promise<GameGenre[]> {
  if (!USE_IGDB) {
    const names = [...new Set(GAMES_MOCK.flatMap((g) => g.genres))].sort()
    return Promise.resolve(names.map((name, i) => ({ id: i + 1, name })))
  }
  return cached('genres', 12 * 60 * MIN, () => call<GameGenre[]>({ op: 'genres' }))
}

export function discoverGames(): Promise<Section<Game>[]> {
  return cached('discoverGames', 30 * MIN, async () => {
    if (USE_IGDB) return call<Section<Game>[]>({ op: 'discover' })
    const now = new Date().toISOString().slice(0, 10)
    const out = GAMES_MOCK.filter((g) => !g.releaseDate || g.releaseDate <= now)
    const soon = GAMES_MOCK.filter((g) => g.releaseDate && g.releaseDate > now)
    const rated = [...out].sort((a, b) => (b.communityRating ?? 0) - (a.communityRating ?? 0))
    return [
      { key: 'trending', title: 'Trending', items: rated },
      { key: 'new', title: 'New Releases', items: [...out].sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '')) },
      { key: 'soon', title: 'Coming Soon', items: soon },
      { key: 'top', title: 'All-time Greats', items: rated.slice(0, 8) },
    ]
  })
}

/** A page of games for "Pick for me" / "Watch together". Length = hours to beat (main story). */
export async function discoverGamePage(
  page: number,
  genre?: GameGenre,
  len?: { min?: number; max?: number },
): Promise<{ items: Game[]; totalPages: number }> {
  if (!USE_IGDB) {
    const h = (g: Game) => g.timeToBeat?.normally
    const pool = GAMES_MOCK.filter((g) => !genre || g.genres.includes(genre.name)).filter(
      (g) => !len || (h(g) != null && (len.min == null || h(g)! >= len.min) && (len.max == null || h(g)! <= len.max)),
    )
    const per = 20
    return { items: pool.slice((page - 1) * per, page * per), totalPages: Math.max(1, Math.ceil(pool.length / per)) }
  }
  // Both phones in Watch together only know the genre's name/first id: look
  // up the merged ids so they build the very same deck.
  let ids = genre?.ids
  if (genre && !ids) ids = (await gameGenres().catch(() => [] as GameGenre[])).find((g) => g.name === genre.name)?.ids ?? [genre.id]
  return cached(`gp:${ids?.join('.') ?? ''}:${len?.min ?? 0}-${len?.max ?? 0}:${page}`, 30 * MIN, () =>
    call<{ items: Game[]; totalPages: number }>({ op: 'page', genre: ids?.join(','), min: len?.min, max: len?.max, page }),
  )
}
