import { supabase } from './supabase'
import { profilesByIds } from './communities'
import type { SocialProfile } from './social'

// Comments on shows, movies, seasons and episodes (009). Never throws.

export interface TitleComment {
  id: string
  target: string
  author_id: string
  parent_id: string | null
  body: string
  spoiler: boolean
  deleted: boolean
  like_count: number
  reply_count: number
  created_at: string
  author?: SocialProfile
  liked?: boolean
}

const COLS = 'id,target,author_id,parent_id,body,spoiler,deleted,like_count,reply_count,created_at'
export type CommentSort = 'top' | 'new'

async function myId(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

async function decorate(rows: TitleComment[]): Promise<TitleComment[]> {
  if (!supabase || rows.length === 0) return rows
  const uid = await myId()
  const [profs, { data: likes }] = await Promise.all([
    profilesByIds(rows.map((r) => r.author_id)),
    uid ? supabase.from('title_comment_likes').select('comment_id').eq('user_id', uid).in('comment_id', rows.map((r) => r.id)) : Promise.resolve({ data: [] }),
  ])
  const mine = new Set(((likes as { comment_id: string }[]) ?? []).map((l) => l.comment_id))
  return rows.map((r) => ({ ...r, author: profs.get(r.author_id), liked: mine.has(r.id) }))
}

export type CommentsResult = { ok: true; items: TitleComment[]; more: boolean } | { ok: false; code: 'not_set_up' | 'error' }

const PAGE = 30

/** Top-level comments for a title. */
export async function listTitleComments(target: string, sort: CommentSort, offset = 0): Promise<CommentsResult> {
  if (!supabase) return { ok: false, code: 'error' }
  let q = supabase.from('title_comments').select(COLS).eq('target', target).is('parent_id', null)
  q = sort === 'top' ? q.order('like_count', { ascending: false }).order('created_at', { ascending: false }) : q.order('created_at', { ascending: false })
  const { data, error } = await q.range(offset, offset + PAGE - 1)
  if (error) return { ok: false, code: /does not exist|schema cache|PGRST20|42P01/.test(error.message + (error.code ?? '')) ? 'not_set_up' : 'error' }
  const rows = (data as TitleComment[]) ?? []
  return { ok: true, items: await decorate(rows), more: rows.length === PAGE }
}

export async function countTitleComments(target: string): Promise<number | null> {
  if (!supabase) return null
  const { count, error } = await supabase.from('title_comments').select('id', { count: 'exact', head: true }).eq('target', target).eq('deleted', false)
  return error ? null : count ?? 0
}

export async function listReplies(parentId: string): Promise<TitleComment[]> {
  if (!supabase) return []
  const { data } = await supabase.from('title_comments').select(COLS).eq('parent_id', parentId).order('created_at').limit(200)
  return decorate((data as TitleComment[]) ?? [])
}

export async function postTitleComment(target: string, body: string, spoiler: boolean, parentId?: string): Promise<{ ok: true; comment: TitleComment } | { ok: false; code: string }> {
  if (!supabase) return { ok: false, code: 'error' }
  const { data, error } = await supabase
    .from('title_comments')
    .insert({ target, body, spoiler, parent_id: parentId ?? null })
    .select(COLS)
    .single()
  if (error) return { ok: false, code: /slow_down/.test(error.message) ? 'slow_down' : 'error' }
  const [c] = await decorate([data as TitleComment])
  return { ok: true, comment: c }
}

export async function setCommentLike(id: string, like: boolean): Promise<boolean> {
  if (!supabase) return false
  if (like) {
    const { error } = await supabase.from('title_comment_likes').insert({ comment_id: id })
    return !error || error.code === '23505'
  }
  const uid = await myId()
  if (!uid) return false
  const { error } = await supabase.from('title_comment_likes').delete().eq('comment_id', id).eq('user_id', uid)
  return !error
}

export async function deleteTitleComment(id: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.rpc('delete_title_comment', { p_id: id })
  return !error
}
