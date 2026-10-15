import { supabase } from './supabase'
import type { SocialProfile } from './social'

// ---------------------------------------------------------------------------
// Communities (Supabase, 006_communities.sql). Permissions are enforced by the
// database (RLS + RPCs); these helpers just call it and never throw.
// ---------------------------------------------------------------------------

export type CommunityRole = 'owner' | 'admin' | 'member'
export type MemberStatus = 'active' | 'pending' | 'banned'

export interface Community {
  id: string
  name: string
  description: string
  visibility: 'public' | 'private'
  topic_type: 'show' | 'movie' | null
  topic_id: string | null
  topic_title: string | null
  topic_poster: string | null
  member_count: number
  created_at: string
  avatar?: string | null
  banner_thumb?: string | null
  banner?: string | null
}

export interface Membership {
  role: CommunityRole
  status: MemberStatus
}

export interface Member extends Membership {
  user_id: string
  joined_at: string
  profile?: SocialProfile
}

export interface Post {
  id: string
  community_id: string
  author_id: string
  body: string
  pinned: boolean
  created_at: string
  author?: SocialProfile
  reactions: Record<string, number>
  mine: string[]
  commentCount: number
}

export interface Comment {
  id: string
  post_id: string
  author_id: string
  body: string
  created_at: string
  author?: SocialProfile
}

export interface Message {
  id: number
  community_id: string
  author_id: string
  body: string
  created_at: string
}

export const REACTIONS = ['👍', '❤️', '😂', '😮', '🔥'] as const

const BASE_COLS = 'id,name,description,visibility,topic_type,topic_id,topic_title,topic_poster,member_count,created_at'
// Pictures come from 007_community_images.sql; until it runs, queries fall back.
const C_COLS = BASE_COLS + ',avatar,banner_thumb'
let imagesAvailable = true

async function selectCommunities<T>(run: (cols: string) => PromiseLike<{ data: T | null; error: { code?: string; message?: string } | null }>, extra = '') {
  if (imagesAvailable) {
    const r = await run(C_COLS + extra)
    if (!r.error || !/avatar|banner/.test(r.error.message ?? '')) return r
    imagesAvailable = false
  }
  return run(BASE_COLS)
}
const P_COLS = 'id,username,display_name,avatar,bio,visibility,follower_count,following_count'

type Result<T> = { ok: true; value: T } | { ok: false; code: string }

async function myId(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

function codeOf(error: { message?: string; code?: string } | null): string {
  const m = error?.message ?? ''
  for (const c of ['not_allowed', 'banned', 'owner_cannot_leave', 'too_many_communities', 'not_found', 'not_a_member', 'not_on_yourself'])
    if (m.includes(c)) return c
  if (error?.code === '42P01' || error?.code === 'PGRST205' || error?.code === 'PGRST202' || /does not exist|schema cache/i.test(m)) return 'not_set_up'
  return 'error'
}

export async function profilesByIds(ids: string[]): Promise<Map<string, SocialProfile>> {
  const out = new Map<string, SocialProfile>()
  const uniq = [...new Set(ids)].filter(Boolean)
  if (!supabase || uniq.length === 0) return out
  const { data } = await supabase.from('profiles').select(P_COLS).in('id', uniq)
  for (const p of (data as SocialProfile[]) ?? []) out.set(p.id, p)
  return out
}

// ---------------------------------------------------------------- browse

/** Communities I belong to (active) or asked to join (pending), with my role. */
export async function myCommunities(): Promise<Result<(Community & Membership)[]>> {
  if (!supabase) return { ok: false, code: 'disabled' }
  const uid = await myId()
  if (!uid) return { ok: true, value: [] }
  const { data: mem, error } = await supabase.from('community_members').select('community_id,role,status').eq('user_id', uid).neq('status', 'banned')
  if (error) return { ok: false, code: codeOf(error) }
  const rows = (mem as { community_id: string; role: CommunityRole; status: MemberStatus }[]) ?? []
  if (rows.length === 0) return { ok: true, value: [] }
  const { data: cs, error: e2 } = await selectCommunities<Community[]>((cols) => supabase!.from('communities').select(cols).in('id', rows.map((r) => r.community_id)) as never)
  if (e2) return { ok: false, code: codeOf(e2) }
  const byId = new Map(rows.map((r) => [r.community_id, r]))
  const value = ((cs as Community[]) ?? [])
    .map((c) => ({ ...c, role: byId.get(c.id)!.role, status: byId.get(c.id)!.status }))
    .sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'active' ? -1 : 1))
  return { ok: true, value }
}

/** Search / browse all communities (biggest first). Optional title filter. */
export async function findCommunities(q: string, topic?: { type: string; id: string }): Promise<Result<Community[]>> {
  if (!supabase) return { ok: false, code: 'disabled' }
  const term = q.trim().replace(/[,()*%]/g, ' ').trim()
  const { data, error } = await selectCommunities<Community[]>((cols) => {
    let query = supabase!.from('communities').select(cols).order('member_count', { ascending: false }).limit(40)
    if (term) query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%,topic_title.ilike.%${term}%`)
    if (topic) query = query.eq('topic_type', topic.type).eq('topic_id', topic.id)
    return query as never
  })
  if (error) return { ok: false, code: codeOf(error) }
  return { ok: true, value: (data as Community[]) ?? [] }
}

export async function getCommunity(id: string): Promise<Result<{ community: Community; me: Membership | null }>> {
  if (!supabase) return { ok: false, code: 'disabled' }
  const { data, error } = await selectCommunities<Community>((cols) => supabase!.from('communities').select(cols).eq('id', id).maybeSingle() as never, ',banner')
  if (error) return { ok: false, code: codeOf(error) }
  if (!data) return { ok: false, code: 'not_found' }
  const uid = await myId()
  let me: Membership | null = null
  if (uid) {
    const { data: m } = await supabase.from('community_members').select('role,status').eq('community_id', id).eq('user_id', uid).maybeSingle()
    me = (m as Membership) ?? null
  }
  return { ok: true, value: { community: data as Community, me } }
}

// ---------------------------------------------------------------- membership

export async function createCommunity(input: {
  name: string
  description: string
  visibility: 'public' | 'private'
  topic?: { type: 'show' | 'movie'; id: string; title: string; poster?: string }
}): Promise<Result<string>> {
  if (!supabase) return { ok: false, code: 'disabled' }
  const { data, error } = await supabase.rpc('create_community', {
    p_name: input.name,
    p_description: input.description,
    p_visibility: input.visibility,
    p_topic_type: input.topic?.type ?? null,
    p_topic_id: input.topic?.id ?? null,
    p_topic_title: input.topic?.title ?? null,
    p_topic_poster: input.topic?.poster ?? null,
  })
  if (error) return { ok: false, code: codeOf(error) }
  return { ok: true, value: data as string }
}

export async function joinCommunity(id: string): Promise<Result<MemberStatus>> {
  if (!supabase) return { ok: false, code: 'disabled' }
  const { data, error } = await supabase.rpc('join_community', { cid: id })
  if (error) return { ok: false, code: codeOf(error) }
  return { ok: true, value: data as MemberStatus }
}

export async function leaveCommunity(id: string): Promise<Result<null>> {
  if (!supabase) return { ok: false, code: 'disabled' }
  const { error } = await supabase.rpc('leave_community', { cid: id })
  return error ? { ok: false, code: codeOf(error) } : { ok: true, value: null }
}

export type ModAction = 'approve' | 'decline' | 'remove' | 'ban' | 'unban' | 'make_admin' | 'make_member' | 'transfer_owner'
export async function moderateMember(id: string, userId: string, action: ModAction): Promise<Result<null>> {
  if (!supabase) return { ok: false, code: 'disabled' }
  const { error } = await supabase.rpc('moderate_member', { cid: id, target: userId, action })
  return error ? { ok: false, code: codeOf(error) } : { ok: true, value: null }
}

export async function updateCommunity(
  id: string,
  patch: Partial<Pick<Community, 'name' | 'description' | 'visibility' | 'avatar' | 'banner' | 'banner_thumb'>>,
): Promise<Result<null>> {
  if (!supabase) return { ok: false, code: 'disabled' }
  const { error } = await supabase.from('communities').update(patch).eq('id', id)
  return error ? { ok: false, code: codeOf(error) } : { ok: true, value: null }
}

export async function deleteCommunity(id: string): Promise<Result<null>> {
  if (!supabase) return { ok: false, code: 'disabled' }
  const { error } = await supabase.rpc('delete_community', { cid: id })
  return error ? { ok: false, code: codeOf(error) } : { ok: true, value: null }
}

/** Active members (+ pending and banned when the viewer moderates — RLS decides). */
export async function listMembers(id: string): Promise<Member[]> {
  if (!supabase) return []
  const { data } = await supabase.from('community_members').select('user_id,role,status,joined_at').eq('community_id', id).limit(500)
  const rows = (data as Member[]) ?? []
  const profs = await profilesByIds(rows.map((r) => r.user_id))
  const rank = { owner: 0, admin: 1, member: 2 }
  return rows
    .map((r) => ({ ...r, profile: profs.get(r.user_id) }))
    .sort((a, b) => rank[a.role] - rank[b.role] || (a.profile?.username ?? '').localeCompare(b.profile?.username ?? ''))
}

// ---------------------------------------------------------------- announcements

export async function listPosts(id: string): Promise<Post[]> {
  if (!supabase) return []
  const uid = await myId()
  const { data } = await supabase
    .from('community_posts')
    .select('id,community_id,author_id,body,pinned,created_at')
    .eq('community_id', id)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50)
  const posts = (data as Omit<Post, 'reactions' | 'mine' | 'commentCount'>[]) ?? []
  if (posts.length === 0) return []
  const ids = posts.map((p) => p.id)
  const [{ data: reacts }, { data: comments }, profs] = await Promise.all([
    supabase.from('community_reactions').select('post_id,user_id,emoji').in('post_id', ids),
    supabase.from('community_comments').select('post_id').in('post_id', ids),
    profilesByIds(posts.map((p) => p.author_id)),
  ])
  return posts.map((p) => {
    const rs = ((reacts as { post_id: string; user_id: string; emoji: string }[]) ?? []).filter((r) => r.post_id === p.id)
    const reactions: Record<string, number> = {}
    for (const r of rs) reactions[r.emoji] = (reactions[r.emoji] ?? 0) + 1
    return {
      ...p,
      author: profs.get(p.author_id),
      reactions,
      mine: rs.filter((r) => r.user_id === uid).map((r) => r.emoji),
      commentCount: ((comments as { post_id: string }[]) ?? []).filter((c) => c.post_id === p.id).length,
    }
  })
}

export async function createPost(id: string, body: string): Promise<boolean> {
  if (!supabase) return false
  const uid = await myId()
  if (!uid) return false
  const { error } = await supabase.from('community_posts').insert({ community_id: id, author_id: uid, body })
  return !error
}

export async function setPinned(postId: string, pinned: boolean): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('community_posts').update({ pinned }).eq('id', postId)
  return !error
}

export async function deletePost(postId: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('community_posts').delete().eq('id', postId)
  return !error
}

export async function toggleReaction(post: Post, emoji: string): Promise<boolean> {
  if (!supabase) return false
  const uid = await myId()
  if (!uid) return false
  const { error } = post.mine.includes(emoji)
    ? await supabase.from('community_reactions').delete().eq('post_id', post.id).eq('user_id', uid).eq('emoji', emoji)
    : await supabase.from('community_reactions').insert({ post_id: post.id, community_id: post.community_id, user_id: uid, emoji })
  return !error
}

export async function listComments(postId: string): Promise<Comment[]> {
  if (!supabase) return []
  const { data } = await supabase.from('community_comments').select('id,post_id,author_id,body,created_at').eq('post_id', postId).order('created_at').limit(200)
  const rows = (data as Comment[]) ?? []
  const profs = await profilesByIds(rows.map((r) => r.author_id))
  return rows.map((r) => ({ ...r, author: profs.get(r.author_id) }))
}

export async function addComment(post: Post, body: string): Promise<boolean> {
  if (!supabase) return false
  const uid = await myId()
  if (!uid) return false
  const { error } = await supabase.from('community_comments').insert({ post_id: post.id, community_id: post.community_id, author_id: uid, body })
  return !error
}

export async function deleteComment(commentId: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('community_comments').delete().eq('id', commentId)
  return !error
}

// ---------------------------------------------------------------- chat

export async function listMessages(id: string, beforeId?: number): Promise<Message[]> {
  if (!supabase) return []
  let q = supabase.from('community_messages').select('id,community_id,author_id,body,created_at').eq('community_id', id).order('id', { ascending: false }).limit(50)
  if (beforeId) q = q.lt('id', beforeId)
  const { data } = await q
  return ((data as Message[]) ?? []).reverse()
}

export async function sendMessage(id: string, body: string): Promise<Message | null> {
  if (!supabase) return null
  const uid = await myId()
  if (!uid) return null
  const { data, error } = await supabase
    .from('community_messages')
    .insert({ community_id: id, author_id: uid, body })
    .select('id,community_id,author_id,body,created_at')
    .single()
  return error ? null : (data as Message)
}

export async function deleteMessage(messageId: number): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('community_messages').delete().eq('id', messageId)
  return !error
}

/** Live chat: new and deleted messages for one community. Returns an unsubscribe. */
export function subscribeMessages(id: string, onInsert: (m: Message) => void, onDelete: (messageId: number) => void): () => void {
  if (!supabase) return () => {}
  const channel = supabase
    .channel(`community-chat-${id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_messages', filter: `community_id=eq.${id}` }, (payload) =>
      onInsert(payload.new as Message),
    )
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'community_messages' }, (payload) => {
      const old = payload.old as { id?: number }
      if (old?.id) onDelete(old.id)
    })
    .subscribe()
  return () => {
    void supabase!.removeChannel(channel)
  }
}

// ---------------------------------------------------------------- titles (009)

export interface CommunityTitle {
  community_id: string
  ref: string // "show:ID" | "movie:ID"
  title: string
  poster: string | null
  year: number | null
  position?: number | null
}
export type TitleOrder = 'added' | 'custom'

/** The titles a community is about. Falls back to its single topic before 009 runs. */
export async function communityTitles(c: Community): Promise<CommunityTitle[]> {
  const legacy: CommunityTitle[] =
    c.topic_type && c.topic_id ? [{ community_id: c.id, ref: `${c.topic_type}:${c.topic_id}`, title: c.topic_title ?? '', poster: c.topic_poster, year: null }] : []
  if (!supabase) return legacy
  let r = await supabase.from('community_titles').select('community_id,ref,title,poster,year,position').eq('community_id', c.id).order('added_at').limit(50)
  if (r.error) r = (await supabase.from('community_titles').select('community_id,ref,title,poster,year').eq('community_id', c.id).order('added_at').limit(50)) as typeof r
  if (r.error) return legacy
  const rows = (r.data as CommunityTitle[]) ?? []
  // 010: a custom order chosen by the owners/admins.
  const { data: o } = await supabase.from('communities').select('title_order').eq('id', c.id).maybeSingle()
  if ((o as { title_order?: TitleOrder } | null)?.title_order === 'custom')
    rows.sort((a, b) => (a.position ?? 1e9) - (b.position ?? 1e9))
  return rows
}

export async function communityTitleOrder(id: string): Promise<TitleOrder> {
  if (!supabase) return 'added'
  const { data, error } = await supabase.from('communities').select('title_order').eq('id', id).maybeSingle()
  return error ? 'added' : ((data as { title_order?: TitleOrder } | null)?.title_order ?? 'added')
}

export async function setTitleOrder(id: string, mode: TitleOrder, refs?: string[]): Promise<Result<null>> {
  if (!supabase) return { ok: false, code: 'disabled' }
  const { error } = await supabase.rpc('set_community_title_order', { cid: id, p_mode: mode, p_refs: refs ?? null })
  return error ? { ok: false, code: codeOf(error) } : { ok: true, value: null }
}

/** Owners/admins: link more titles. Titles can't be removed. */
export async function addCommunityTitles(id: string, items: { ref: string; title: string; poster?: string; year?: number }[]): Promise<Result<number>> {
  if (!supabase) return { ok: false, code: 'disabled' }
  if (items.length === 0) return { ok: true, value: 0 }
  const { data, error } = await supabase.rpc('add_community_titles', { cid: id, p_items: items })
  return error ? { ok: false, code: codeOf(error) } : { ok: true, value: (data as number) ?? 0 }
}

/** Communities about a title (any of their linked titles). */
export async function communitiesForTitle(ref: string): Promise<Result<Community[]>> {
  if (!supabase) return { ok: false, code: 'disabled' }
  const { data, error } = await supabase.from('community_titles').select('community_id').eq('ref', ref).limit(100)
  if (error) {
    const [type, id] = ref.split(':')
    return findCommunities('', { type, id })
  }
  const ids = ((data as { community_id: string }[]) ?? []).map((r) => r.community_id)
  if (ids.length === 0) return { ok: true, value: [] }
  const { data: cs, error: e2 } = await selectCommunities<Community[]>((cols) => supabase!.from('communities').select(cols).in('id', ids).order('member_count', { ascending: false }) as never)
  if (e2) return { ok: false, code: codeOf(e2) }
  return { ok: true, value: (cs as Community[]) ?? [] }
}

// ---------------------------------------------------------------- lists (009)

/** One item of a list snapshot: ref, title, show name, poster, year. */
export interface SnapItem {
  r: string
  t: string
  s?: string
  p?: string
  y?: number
}

export interface CommunityList {
  community_id: string
  owner_id: string
  list_id: string
  official: boolean
  name: string
  kind: 'mixed' | 'shows' | 'seasons' | 'episodes' | 'movies'
  ranked: boolean
  cover: string | null
  items: SnapItem[]
  updated_at: string
  owner?: SocialProfile
}

export async function communityLists(id: string): Promise<CommunityList[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('community_lists')
    .select('community_id,owner_id,list_id,official,name,kind,ranked,cover,items,updated_at')
    .eq('community_id', id)
    .order('official', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(200)
  if (error) return null
  const rows = (data as CommunityList[]) ?? []
  const profs = await profilesByIds(rows.map((r) => r.owner_id))
  return rows.map((r) => ({ ...r, owner: profs.get(r.owner_id) }))
}

export async function getCommunityList(id: string, owner: string, listId: string): Promise<CommunityList | null> {
  if (!supabase) return null
  const { data } = await supabase
    .from('community_lists')
    .select('community_id,owner_id,list_id,official,name,kind,ranked,cover,items,updated_at')
    .eq('community_id', id)
    .eq('owner_id', owner)
    .eq('list_id', listId)
    .maybeSingle()
  if (!data) return null
  const profs = await profilesByIds([owner])
  return { ...(data as CommunityList), owner: profs.get(owner) }
}

export async function linkList(
  id: string,
  list: { id: string; name: string; kind: string; ranked: boolean; cover?: string; items: SnapItem[] },
): Promise<Result<boolean>> {
  if (!supabase) return { ok: false, code: 'disabled' }
  const { data, error } = await supabase.rpc('link_community_list', {
    cid: id,
    p_list_id: list.id,
    p_name: list.name,
    p_kind: list.kind,
    p_ranked: list.ranked,
    p_cover: list.cover ?? null,
    p_items: list.items.slice(0, 500),
  })
  if (error) return { ok: false, code: /too_many_lists/.test(error.message) ? 'too_many_lists' : codeOf(error) }
  return { ok: true, value: !!data }
}

export async function unlinkList(id: string, listId: string, owner?: string): Promise<Result<null>> {
  if (!supabase) return { ok: false, code: 'disabled' }
  const { error } = await supabase.rpc('unlink_community_list', { cid: id, p_list_id: listId, p_owner: owner ?? null })
  return error ? { ok: false, code: codeOf(error) } : { ok: true, value: null }
}
