import { supabase } from './supabase'

// ---------------------------------------------------------------------------
// Social data layer (Supabase). Everything here is defensive: when Supabase is
// not configured (local-only build) or a call fails, helpers return null / []
// / false so the app's local-first experience is never blocked or broken.
// The private library blob (public.library) is untouched by any of this.
// ---------------------------------------------------------------------------

export interface SocialProfile {
  id: string
  username: string | null
  display_name: string | null
  avatar: string | null
  bio: string | null
  visibility: 'public' | 'private'
  follower_count: number
  following_count: number
}

export interface ProfileStats {
  episodes_watched: number
  shows_watched: number
  shows_finished: number
  movies_watched: number
  minutes_watched: number
  // Added by 004_social_profiles.sql (absent until it has run).
  shows_followed?: number
  movies_followed?: number
  tv_minutes?: number
  movie_minutes?: number
}

const BASE_STAT_COLS = 'episodes_watched,shows_watched,shows_finished,movies_watched,minutes_watched'
const FULL_STAT_COLS = BASE_STAT_COLS + ',shows_followed,movies_followed,tv_minutes,movie_minutes'

/** A title someone chose to show on their profile (favorites / public lists). */
export interface ShowcaseItem {
  id: string
  type: 'show' | 'movie'
  title: string
  poster?: string
  year?: number
}
export interface ShowcaseList {
  id: string
  name: string
  ranked?: boolean
  cover?: string
  items: ShowcaseItem[]
}
export interface Showcase {
  favorites: ShowcaseItem[]
  lists: ShowcaseList[]
}

export type FollowStatus = 'none' | 'pending' | 'accepted'

const PROFILE_COLS = 'id,username,display_name,avatar,bio,visibility,follower_count,following_count'

/** Sanitise a query fragment for a PostgREST or() filter (strip its delimiters). */
function clean(q: string): string {
  return q.trim().replace(/[,()*%]/g, ' ').replace(/\s+/g, ' ').trim()
}

export async function getMyProfile(): Promise<SocialProfile | null> {
  if (!supabase) return null
  try {
    const uid = await myId()
    if (!uid) return null
    const { data } = await supabase.from('profiles').select(PROFILE_COLS).eq('id', uid).maybeSingle()
    return (data as SocialProfile) ?? null
  } catch {
    return null
  }
}

/** Update the owner's public identity fields (never username — see claimUsername). */
export async function updateMyIdentity(patch: Partial<Pick<SocialProfile, 'display_name' | 'avatar' | 'bio' | 'visibility'>>): Promise<boolean> {
  if (!supabase) return false
  try {
    const uid = await myId()
    if (!uid) return false
    const { error } = await supabase.from('profiles').update(patch).eq('id', uid)
    return !error
  } catch {
    return false
  }
}

/** Claim/update the owner's unique username. Returns the claimed name, or an
 *  error code string ('username_taken' | 'invalid_username' | 'error'). */
export async function claimUsername(uname: string): Promise<{ ok: true; username: string } | { ok: false; code: string }> {
  if (!supabase) return { ok: false, code: 'disabled' }
  try {
    const { data, error } = await supabase.rpc('claim_username', { uname })
    if (error) {
      const code = /taken/.test(error.message) ? 'username_taken' : /invalid/.test(error.message) ? 'invalid_username' : 'error'
      return { ok: false, code }
    }
    return { ok: true, username: data as string }
  } catch {
    return { ok: false, code: 'error' }
  }
}

/** The signed-in user's id from the local session (no network round-trip). */
async function myId(): Promise<string | null> {
  if (!supabase) return null
  try {
    const { data } = await supabase.auth.getSession()
    return data.session?.user.id ?? null
  } catch {
    return null
  }
}

/** Is a PostgREST error just "this column/table doesn't exist yet" (SQL not run)? */
function isSchemaMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === 'PGRST204' || error.code === '42703' || error.code === 'PGRST205' || error.code === '42P01' || /column|schema cache|does not exist/i.test(error.message ?? '')
}

export async function pushMyStats(stats: ProfileStats): Promise<boolean> {
  if (!supabase) return false
  try {
    const uid = await myId()
    if (!uid) return false
    const row = { user_id: uid, ...stats, updated_at: new Date().toISOString() }
    let { error } = await supabase.from('profile_stats').upsert(row, { onConflict: 'user_id' })
    if (isSchemaMissing(error)) {
      // 004 not run yet: save the original columns only.
      const { episodes_watched, shows_watched, shows_finished, movies_watched, minutes_watched } = stats
      ;({ error } = await supabase
        .from('profile_stats')
        .upsert({ user_id: uid, episodes_watched, shows_watched, shows_finished, movies_watched, minutes_watched, updated_at: row.updated_at }, { onConflict: 'user_id' }))
    }
    return !error
  } catch {
    return false
  }
}

export async function pushMyShowcase(showcase: Showcase): Promise<boolean> {
  if (!supabase) return false
  try {
    const uid = await myId()
    if (!uid) return false
    const { error } = await supabase.from('profile_showcase').upsert({ user_id: uid, ...showcase }, { onConflict: 'user_id' })
    return !error
  } catch {
    return false
  }
}

/** Protected: null when the viewer may not see it (private, not following) or none saved. */
export async function getShowcase(id: string): Promise<Showcase | null> {
  if (!supabase) return null
  try {
    const { data } = await supabase.from('profile_showcase').select('favorites,lists').eq('user_id', id).maybeSingle()
    if (!data) return null
    return { favorites: (data.favorites as ShowcaseItem[]) ?? [], lists: (data.lists as ShowcaseList[]) ?? [] }
  } catch {
    return null
  }
}

export type LeaderMetric = 'minutes_watched' | 'movies_watched' | 'shows_watched' | 'episodes_watched'
export interface LeaderRow {
  profile: SocialProfile
  stats: ProfileStats
}

/**
 * Real leaderboard: profile_stats rows the viewer is allowed to see (public
 * accounts, accounts they follow, and themselves — enforced by RLS), ranked
 * server-side, joined to identities. Accounts without a username are skipped.
 * Returns null when the request failed (as opposed to "nobody yet").
 */
export async function getLeaderboard(metric: LeaderMetric, scope: 'everyone' | 'following'): Promise<LeaderRow[] | null> {
  if (!supabase) return null
  try {
    const uid = await myId()
    let ids: string[] | null = null
    if (scope === 'following') {
      if (!uid) return []
      const { data: edges, error } = await supabase.from('follows').select('following_id').eq('follower_id', uid).eq('status', 'accepted').limit(500)
      if (error) return null
      ids = [uid, ...((edges as { following_id: string }[]) ?? []).map((e) => e.following_id)]
    }
    const run = async (cols: string) => {
      let q = supabase!.from('profile_stats').select('user_id,' + cols).order(metric, { ascending: false }).limit(100)
      if (ids) q = q.in('user_id', ids)
      return q
    }
    let { data, error } = await run(FULL_STAT_COLS)
    if (isSchemaMissing(error)) ({ data, error } = await run(BASE_STAT_COLS))
    if (error) return null
    const stats = (data as unknown as (ProfileStats & { user_id: string })[]) ?? []
    if (stats.length === 0) return []
    const { data: profs, error: pErr } = await supabase.from('profiles').select(PROFILE_COLS).in('id', stats.map((r) => r.user_id))
    if (pErr) return null
    const byId = new Map(((profs as SocialProfile[]) ?? []).map((p) => [p.id, p]))
    const rows: LeaderRow[] = []
    for (const st of stats) {
      const profile = byId.get(st.user_id)
      if (profile?.username) rows.push({ profile, stats: st })
    }
    return rows
  } catch {
    return null
  }
}

export async function searchProfiles(query: string): Promise<SocialProfile[]> {
  if (!supabase) return []
  const q = clean(query)
  if (!q) return []
  try {
    const { data } = await supabase
      .from('profiles')
      .select(PROFILE_COLS)
      .not('username', 'is', null)
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .limit(20)
    return (data as SocialProfile[]) ?? []
  } catch {
    return []
  }
}

export async function getProfileByUsername(username: string): Promise<SocialProfile | null> {
  if (!supabase) return null
  try {
    const { data } = await supabase.from('profiles').select(PROFILE_COLS).ilike('username', username).maybeSingle()
    return (data as SocialProfile) ?? null
  } catch {
    return null
  }
}

export async function getProfileById(id: string): Promise<SocialProfile | null> {
  if (!supabase) return null
  try {
    const { data } = await supabase.from('profiles').select(PROFILE_COLS).eq('id', id).maybeSingle()
    return (data as SocialProfile) ?? null
  } catch {
    return null
  }
}

/** Protected: returns null when the viewer isn't allowed to see the stats. */
export async function getProfileStats(id: string): Promise<ProfileStats | null> {
  if (!supabase) return null
  try {
    const run = (cols: string) => supabase!.from('profile_stats').select(cols).eq('user_id', id).maybeSingle()
    let { data, error } = await run(FULL_STAT_COLS)
    if (isSchemaMissing(error)) ({ data, error } = await run(BASE_STAT_COLS))
    return (data as unknown as ProfileStats) ?? null
  } catch {
    return null
  }
}

/** The viewer's relationship to a target: are we following (and is it accepted)? */
export async function getRelationship(targetId: string): Promise<{ outgoing: FollowStatus; followsMe: boolean }> {
  if (!supabase) return { outgoing: 'none', followsMe: false }
  try {
    const uid = await myId()
    if (!uid) return { outgoing: 'none', followsMe: false }
    const { data } = await supabase
      .from('follows')
      .select('follower_id,following_id,status')
      .or(`and(follower_id.eq.${uid},following_id.eq.${targetId}),and(follower_id.eq.${targetId},following_id.eq.${uid})`)
    const rows = (data as { follower_id: string; following_id: string; status: FollowStatus }[]) ?? []
    const out = rows.find((r) => r.follower_id === uid && r.following_id === targetId)
    const inc = rows.find((r) => r.follower_id === targetId && r.following_id === uid)
    return { outgoing: out ? out.status : 'none', followsMe: !!inc && inc.status === 'accepted' }
  } catch {
    return { outgoing: 'none', followsMe: false }
  }
}

export async function followUser(targetId: string): Promise<boolean> {
  if (!supabase) return false
  try {
    const uid = await myId()
    if (!uid || uid === targetId) return false
    // Status is set server-side by trigger (accepted if public, else pending).
    const { error } = await supabase.from('follows').insert({ follower_id: uid, following_id: targetId })
    return !error
  } catch {
    return false
  }
}

export async function unfollowUser(targetId: string): Promise<boolean> {
  if (!supabase) return false
  try {
    const uid = await myId()
    if (!uid) return false
    const { error } = await supabase.from('follows').delete().eq('follower_id', uid).eq('following_id', targetId)
    return !error
  } catch {
    return false
  }
}

/** Target accepts a pending follow request from `followerId`. */
export async function acceptFollower(followerId: string): Promise<boolean> {
  if (!supabase) return false
  try {
    const uid = await myId()
    if (!uid) return false
    const { error } = await supabase.from('follows').update({ status: 'accepted' }).eq('follower_id', followerId).eq('following_id', uid)
    return !error
  } catch {
    return false
  }
}

export async function removeFollower(followerId: string): Promise<boolean> {
  if (!supabase) return false
  try {
    const uid = await myId()
    if (!uid) return false
    const { error } = await supabase.from('follows').delete().eq('follower_id', followerId).eq('following_id', uid)
    return !error
  } catch {
    return false
  }
}

type FollowDir = 'followers' | 'following'

/** List a user's followers or the accounts they follow (accepted only), joined
 *  to profile identity. Two-step (follows → profiles) since the FK is to auth. */
export async function listFollowConnections(id: string, dir: FollowDir): Promise<SocialProfile[]> {
  if (!supabase) return []
  try {
    const sel = dir === 'followers' ? 'follower_id' : 'following_id'
    const match = dir === 'followers' ? 'following_id' : 'follower_id'
    const { data: edges } = await supabase.from('follows').select(sel).eq(match, id).eq('status', 'accepted').limit(200)
    const ids = ((edges as Record<string, string>[]) ?? []).map((e) => e[sel]).filter(Boolean)
    if (ids.length === 0) return []
    const { data } = await supabase.from('profiles').select(PROFILE_COLS).in('id', ids)
    return (data as SocialProfile[]) ?? []
  } catch {
    return []
  }
}

/** Pending follow requests awaiting the current user's approval. */
export async function listPendingRequests(): Promise<SocialProfile[]> {
  if (!supabase) return []
  try {
    const uid = await myId()
    if (!uid) return []
    const { data: edges } = await supabase.from('follows').select('follower_id').eq('following_id', uid).eq('status', 'pending').limit(200)
    const ids = ((edges as { follower_id: string }[]) ?? []).map((e) => e.follower_id)
    if (ids.length === 0) return []
    const { data } = await supabase.from('profiles').select(PROFILE_COLS).in('id', ids)
    return (data as SocialProfile[]) ?? []
  } catch {
    return []
  }
}
