import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { HeartIcon, DotsIcon, EyeOffIcon } from '../components/Icons'
import { UserAvatar, nameOf } from './social'
import { ComposerBar } from './ComposerBar'
import { RowsSkeleton } from './Skeletons'
import { useSync } from '../logic/sync'
import { useToast } from '../store/useToast'
import { dropCache, useCached, writeCache } from '../utils/cache'
import {
  countTitleComments,
  deleteTitleComment,
  listReplies,
  listTitleComments,
  postTitleComment,
  setCommentLike,
  type CommentSort,
  type TitleComment,
} from '../data/comments'

function ago(iso: string): string {
  const s = Math.floor((Date.now() - Date.parse(iso)) / 1000)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: Date.parse(iso) < Date.now() - 300 * 86400e3 ? 'numeric' : undefined })
}

/** "Comments · 12" for tab labels (cached, refreshed quietly). */
export function useCommentCount(target: string): number | undefined {
  const signedIn = useSync((s) => s.status === 'signedIn')
  const q = useCached<number>(signedIn ? `tcn:${target}` : null, async () => (await countTitleComments(target)) ?? undefined)
  return q.data
}
export const commentsLabel = (n?: number) => (n ? `Comments · ${n > 999 ? `${(n / 1000).toFixed(1)}k` : n}` : 'Comments')

type Data = { items: TitleComment[]; more: boolean } | { error: 'not_set_up' | 'error' }

/**
 * Comments for a show, movie, season or episode: top/newest, likes, one level
 * of replies, spoilers blurred until tapped, composer docked at the bottom.
 */
export function TitleComments({ target, what }: { target: string; what: string }) {
  const nav = useNavigate()
  const toast = useToast((s) => s.show)
  const me = useSync((s) => s.userId)
  const signedIn = useSync((s) => s.status === 'signedIn')
  const [sort, setSort] = useState<CommentSort>('top')
  const key = signedIn ? `tc:${target}:${sort}` : null
  const q = useCached<Data>(key, async () => {
    const r = await listTitleComments(target, sort)
    return r.ok ? { items: r.items, more: r.more } : r.code === 'not_set_up' ? { error: 'not_set_up' } : undefined
  })
  const [draft, setDraft] = useState('')
  const [spoiler, setSpoiler] = useState(false)
  const [replyTo, setReplyTo] = useState<TitleComment | null>(null)
  const [sending, setSending] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [menu, setMenu] = useState<TitleComment | null>(null)
  const [replies, setReplies] = useState<Record<string, TitleComment[] | 'loading'>>({})
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const data = q.data && 'items' in q.data ? q.data : undefined
  const items = data?.items

  const patch = (id: string, fn: (c: TitleComment) => TitleComment) => {
    q.mutate((cur) => (cur && 'items' in cur ? { ...cur, items: cur.items.map((c) => (c.id === id ? fn(c) : c)) } : cur!))
    setReplies((r) => {
      const out: typeof r = {}
      for (const [k, v] of Object.entries(r)) out[k] = v === 'loading' ? v : v.map((c) => (c.id === id ? fn(c) : c))
      return out
    })
  }

  const like = async (c: TitleComment) => {
    const on = !c.liked
    patch(c.id, (x) => ({ ...x, liked: on, like_count: Math.max(0, x.like_count + (on ? 1 : -1)) }))
    if (!(await setCommentLike(c.id, on))) {
      patch(c.id, (x) => ({ ...x, liked: !on, like_count: Math.max(0, x.like_count + (on ? -1 : 1)) }))
      toast('Couldn’t update — check your connection')
    }
  }

  const openReplies = async (c: TitleComment) => {
    if (replies[c.id] && replies[c.id] !== 'loading') return setReplies((r) => ({ ...Object.fromEntries(Object.entries(r).filter(([k]) => k !== c.id)) }))
    setReplies((r) => ({ ...r, [c.id]: 'loading' }))
    const list = await listReplies(c.id)
    setReplies((r) => ({ ...r, [c.id]: list }))
  }

  const send = async () => {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    const parent = replyTo
    const r = await postTitleComment(target, body, spoiler, parent?.id)
    setSending(false)
    if (!r.ok) return toast(r.code === 'slow_down' ? 'You’re commenting fast — try again in a few minutes' : 'Couldn’t post — check your connection')
    setDraft('')
    setSpoiler(false)
    setReplyTo(null)
    if (parent) {
      const rootId = parent.parent_id ?? parent.id
      patch(rootId, (x) => ({ ...x, reply_count: x.reply_count + 1 }))
      setReplies((rs) => ({ ...rs, [rootId]: [...(Array.isArray(rs[rootId]) ? (rs[rootId] as TitleComment[]) : []), r.comment] }))
    } else {
      q.mutate((cur) => (cur && 'items' in cur ? { ...cur, items: [r.comment, ...cur.items] } : { items: [r.comment], more: false }))
      // Keep the other sort's cached copy honest too.
      dropCache(`tc:${target}:${sort === 'top' ? 'new' : 'top'}`)
    }
    void countTitleComments(target).then((n) => n != null && writeCache(`tcn:${target}`, n))
  }

  const remove = async (c: TitleComment) => {
    setMenu(null)
    if (!(await deleteTitleComment(c.id))) return toast('Couldn’t delete right now')
    if (c.reply_count > 0) patch(c.id, (x) => ({ ...x, deleted: true, body: '' }))
    else {
      q.mutate((cur) => (cur && 'items' in cur ? { ...cur, items: cur.items.filter((x) => x.id !== c.id) } : cur!))
      setReplies((rs) => {
        const out: typeof rs = {}
        for (const [k, v] of Object.entries(rs)) out[k] = v === 'loading' ? v : v.filter((x) => x.id !== c.id)
        return out
      })
      if (c.parent_id) patch(c.parent_id, (x) => ({ ...x, reply_count: Math.max(0, x.reply_count - 1) }))
    }
    toast('Comment deleted')
  }

  const more = async () => {
    if (!data || loadingMore) return
    setLoadingMore(true)
    const r = await listTitleComments(target, sort, data.items.length)
    setLoadingMore(false)
    if (r.ok) q.mutate((cur) => (cur && 'items' in cur ? { items: [...cur.items, ...r.items.filter((x) => !cur.items.some((y) => y.id === x.id))], more: r.more } : cur!))
  }

  const startReply = (c: TitleComment) => {
    setReplyTo(c)
    setTimeout(() => inputRef.current?.focus(), 30)
  }

  useEffect(() => {
    setReplies({})
  }, [sort])
  // Pick up new comments when coming back to the app.
  useEffect(() => {
    const onVis = () => document.visibilityState === 'visible' && void q.reload()
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [q.reload]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!signedIn)
    return (
      <div className="empty compact">
        <div className="empty-title">Join the conversation</div>
        <div className="empty-sub">Sign in to read and write comments about {what}.</div>
      </div>
    )

  const item = (c: TitleComment, reply = false) => (
    <div key={c.id} className={`tc ${reply ? 'reply' : ''}`}>
      <button className="tc-avatar" onClick={() => c.author && nav(c.author_id === me ? '/profile' : `/u/${c.author_id}`)} aria-label="Profile">
        {c.author && !c.deleted ? <UserAvatar profile={c.author} size={reply ? 28 : 36} /> : <span className="user-avatar" style={{ width: reply ? 28 : 36, height: reply ? 28 : 36 }} />}
      </button>
      <div className="tc-main">
        <div className="tc-head">
          <span className="tc-name">{c.deleted ? 'Deleted' : c.author ? nameOf(c.author) : 'Member'}</span>
          {c.author?.username && !c.deleted && <span className="tc-handle">@{c.author.username}</span>}
          <span className="tc-time">· {ago(c.created_at)}</span>
          {c.author_id === me && !c.deleted && (
            <button className="tc-more" onClick={() => setMenu(c)} aria-label="Comment options">
              <DotsIcon size={16} />
            </button>
          )}
        </div>
        {c.deleted ? <div className="tc-body deleted">This comment was deleted.</div> : <Body c={c} mine={c.author_id === me} />}
        {!c.deleted && (
          <div className="tc-actions">
            <button className={`tc-like ${c.liked ? 'on' : ''}`} onClick={() => void like(c)} aria-pressed={!!c.liked} aria-label={c.liked ? 'Unlike' : 'Like'}>
              <HeartIcon size={15} fill={c.liked ? 'currentColor' : 'none'} />
              {c.like_count > 0 && <span>{c.like_count}</span>}
            </button>
            <button className="tc-reply" onClick={() => startReply(c)}>
              Reply
            </button>
          </div>
        )}
        {!reply && c.reply_count > 0 && (
          <button className="tc-replies-toggle" onClick={() => void openReplies(c)}>
            <span className="tc-line" />
            {replies[c.id] && replies[c.id] !== 'loading' ? 'Hide replies' : `View ${c.reply_count} repl${c.reply_count === 1 ? 'y' : 'ies'}`}
          </button>
        )}
        {!reply && replies[c.id] === 'loading' && <RowsSkeleton n={1} h={40} gap={4} />}
        {!reply && Array.isArray(replies[c.id]) && <div className="tc-thread">{(replies[c.id] as TitleComment[]).map((r) => item(r, true))}</div>}
      </div>
    </div>
  )

  return (
    <div className="page-pad tc-wrap has-composer">
      <div className="tc-sort" role="radiogroup" aria-label="Sort comments">
        {(['top', 'new'] as const).map((s) => (
          <button key={s} role="radio" aria-checked={sort === s} className={`tc-sort-opt ${sort === s ? 'on' : ''}`} onClick={() => setSort(s)}>
            {s === 'top' ? 'Top' : 'Newest'}
          </button>
        ))}
      </div>
      {q.data && 'error' in q.data ? (
        <div className="empty compact">
          <div className="empty-sub">Comments need the latest database update (009_titles_lists_comments.sql).</div>
        </div>
      ) : items === undefined ? (
        q.failed ? (
          <div className="empty compact">
            <div className="empty-sub">Couldn’t load comments.</div>
            <button className="auth-link" onClick={() => void q.reload()}>
              Try again
            </button>
          </div>
        ) : (
          <CommentSkeletons />
        )
      ) : items.length === 0 ? (
        <div className="empty compact">
          <div className="empty-title">No comments yet</div>
          <div className="empty-sub">Start the conversation about {what}.</div>
        </div>
      ) : (
        <>
          {items.map((c) => item(c))}
          {data?.more && (
            <button className="auth-link" style={{ width: '100%', padding: 14 }} onClick={() => void more()} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'More comments'}
            </button>
          )}
        </>
      )}

      {!(q.data && 'error' in q.data) && (
        <ComposerBar
          value={draft}
          onChange={setDraft}
          onSend={() => void send()}
          busy={sending}
          maxLength={2000}
          inputRef={inputRef}
          placeholder={replyTo ? 'Write a reply…' : `Comment on ${what}…`}
          above={
            replyTo ? (
              <>
                <span>
                  Replying to <b>{replyTo.author ? nameOf(replyTo.author) : 'Member'}</b>
                </span>
                <button type="button" className="auth-link" onClick={() => setReplyTo(null)}>
                  Cancel
                </button>
              </>
            ) : undefined
          }
          leading={
            <button
              type="button"
              className={`spoiler-toggle ${spoiler ? 'on' : ''}`}
              aria-pressed={spoiler}
              aria-label={spoiler ? 'Marked as spoiler' : 'Mark as spoiler'}
              title="Spoiler"
              onClick={() => setSpoiler((v) => !v)}
            >
              <EyeOffIcon size={18} />
            </button>
          }
        />
      )}

      {menu &&
        createPortal(
          <div className="sheet-backdrop" onClick={() => setMenu(null)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-handle" />
              <button className="sheet-row danger" onClick={() => void remove(menu)}>
                <span>Delete comment</span>
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

function Body({ c, mine }: { c: TitleComment; mine: boolean }) {
  const [shown, setShown] = useState(mine)
  if (c.spoiler && !shown)
    return (
      <button className="tc-body spoiler" onClick={() => setShown(true)} aria-label="Spoiler — tap to reveal">
        <span className="tc-spoiler-text" aria-hidden="true">
          {c.body}
        </span>
        <span className="tc-spoiler-label">
          <EyeOffIcon size={14} /> Spoiler · tap to reveal
        </span>
      </button>
    )
  return (
    <div className="tc-body">
      {c.spoiler && <span className="tc-spoiler-chip">Spoiler</span>}
      {c.body}
    </div>
  )
}

function CommentSkeletons() {
  return (
    <div aria-busy="true">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="tc">
          <span className="skeleton" style={{ width: 36, height: 36, borderRadius: '50%', flex: '0 0 auto' }} />
          <div className="tc-main">
            <span className="skeleton" style={{ display: 'block', width: 140, height: 12 }} />
            <span className="skeleton" style={{ display: 'block', height: 12, marginTop: 8 }} />
            <span className="skeleton" style={{ display: 'block', width: '60%', height: 12, marginTop: 6 }} />
          </div>
        </div>
      ))}
    </div>
  )
}
