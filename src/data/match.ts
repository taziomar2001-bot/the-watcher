import { supabase } from './supabase'

// Watch together (008_watch_together.sql). Never throws; returns null/[] on failure.

export interface MatchSession {
  id: string
  code: string
  host_id: string
  guest_id: string | null
  kind: 'movie' | 'show'
  genre_id: number | null
  genre_name: string | null
  seed: number
  status: 'waiting' | 'active' | 'closed'
  expires_at: string
  // 009 filters (absent before it runs)
  source?: 'anything' | 'watchlist' | 'not_started'
  min_len?: number | null
  max_len?: number | null
  deck?: DeckItem[] | null
}

/** A title the host chose to share for a "from my watchlist" session. */
export interface DeckItem {
  id: string
  title: string
  poster?: string
  year?: number
}

export interface Swipe {
  session_id: string
  user_id: string
  item_id: string
  liked: boolean
  title: string | null
  poster: string | null
}

const BASE_COLS = 'id,code,host_id,guest_id,kind,genre_id,genre_name,seed,status,expires_at'
const V2_COLS = BASE_COLS + ',source,min_len,max_len,deck'
let v2 = true
/** Select sessions, falling back to the 008 columns until 009 has run. */
async function selectSessions<T>(run: (cols: string) => PromiseLike<{ data: T | null; error: { message?: string } | null }>) {
  if (v2) {
    const r = await run(V2_COLS)
    if (!r.error || !/source|min_len|max_len|deck|column/.test(r.error.message ?? '')) return r
    v2 = false
  }
  return run(BASE_COLS)
}

export function errorCode(message?: string): string {
  const m = message ?? ''
  for (const c of ['code_not_found', 'session_full', 'too_many_sessions']) if (m.includes(c)) return c
  if (/does not exist|schema cache|PGRST20/.test(m)) return 'not_set_up'
  return 'error'
}

export async function createSession(
  kind: 'movie' | 'show',
  genre?: { id: number; name: string },
  extra?: { min?: number; max?: number; source?: 'anything' | 'watchlist' | 'not_started'; deck?: DeckItem[] },
): Promise<{ ok: true; id: string; code: string } | { ok: false; code: string }> {
  if (!supabase) return { ok: false, code: 'disabled' }
  const needsV2 = !!(extra?.min || extra?.max || (extra?.source && extra.source !== 'anything'))
  const { data, error } = needsV2
    ? await supabase.rpc('create_match_session_v2', {
        p_kind: kind,
        p_genre_id: genre?.id ?? null,
        p_genre_name: genre?.name ?? null,
        p_min_len: extra?.min ?? null,
        p_max_len: extra?.max ?? null,
        p_source: extra?.source ?? 'anything',
        p_deck: extra?.deck ?? null,
      })
    : await supabase.rpc('create_match_session', { p_kind: kind, p_genre_id: genre?.id ?? null, p_genre_name: genre?.name ?? null })
  if (error) return { ok: false, code: errorCode(error.message) }
  const row = (Array.isArray(data) ? data[0] : data) as { id: string; code: string }
  return { ok: true, id: row.id, code: row.code }
}

export async function joinSession(code: string): Promise<{ ok: true; id: string } | { ok: false; code: string }> {
  if (!supabase) return { ok: false, code: 'disabled' }
  const { data, error } = await supabase.rpc('join_match_session', { p_code: code })
  if (error) return { ok: false, code: errorCode(error.message) }
  return { ok: true, id: data as string }
}

export async function getSession(id: string): Promise<MatchSession | null> {
  if (!supabase) return null
  const { data } = await selectSessions<MatchSession>((cols) => supabase!.from('match_sessions').select(cols).eq('id', id).maybeSingle() as never)
  return (data as MatchSession) ?? null
}

/** Your most recent unexpired session, to resume after leaving the screen. */
export async function latestOpenSession(): Promise<MatchSession | null> {
  if (!supabase) return null
  const { data } = await selectSessions<MatchSession[]>(
    (cols) =>
      supabase!
        .from('match_sessions')
        .select(cols)
        .neq('status', 'closed')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1) as never,
  )
  return ((data as MatchSession[]) ?? [])[0] ?? null
}

export async function endSession(id: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('match_sessions').update({ status: 'closed' }).eq('id', id)
  return !error
}

export async function listSwipes(id: string): Promise<Swipe[]> {
  if (!supabase) return []
  const { data } = await supabase.from('match_swipes').select('session_id,user_id,item_id,liked,title,poster').eq('session_id', id).limit(2000)
  return (data as Swipe[]) ?? []
}

export async function swipe(s: Omit<Swipe, 'user_id'>, userId: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('match_swipes').upsert({ ...s, user_id: userId }, { onConflict: 'session_id,user_id,item_id', ignoreDuplicates: true })
  return !error
}

/** Live session + swipe changes (realtime), with a polling safety net. */
export function watchSession(id: string, onChange: () => void): () => void {
  const poll = setInterval(onChange, 4000)
  if (!supabase) return () => clearInterval(poll)
  const ch = supabase
    .channel(`match-${id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'match_swipes', filter: `session_id=eq.${id}` }, onChange)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'match_sessions', filter: `id=eq.${id}` }, onChange)
    .subscribe()
  return () => {
    clearInterval(poll)
    void supabase!.removeChannel(ch)
  }
}

/** Small deterministic RNG so both phones build the exact same deck. */
export function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
