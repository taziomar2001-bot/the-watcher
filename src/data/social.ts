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
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth.user?.id
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
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth.user?.id
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

export async function pushMyStats(stats: ProfileStats): Promise<boolean> {
  if (!supabase) return false
  try {
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth.user?.id
    if (!uid) return false
    const { error } = await supabase.from('profile_stats').upsert({ user_id: uid, ...stats, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    return !error
  } catch {
    return false
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
    const { data } = await supabase
      .from('profile_stats')
      .select('episodes_watched,shows_watched,shows_finished,movies_watched,minutes_watched')
      .eq('user_id', id)
      .maybeSingle()
    return (data as ProfileStats) ?? null
  } catch {
    return null
  }
}

/** The viewer's relationship to a target: are we following (and is it accepted)? */
export async function getRelationship(targetId: string): Promise<{ outgoing: FollowStatus; followsMe: boolean }> {
  if (!supabase) return { outgoing: 'none', followsMe: false }
  try {
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth.user?.id
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
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth.user?.id
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
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth.user?.id
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
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth.user?.id
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
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth.user?.id
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
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth.user?.id
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
