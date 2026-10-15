import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft, DotsIcon, PeopleIcon, PlusIcon } from '../components/Icons'
import { SmartImage } from '../components/ui'
import { CommunityAvatar, communityHue } from './CommunitiesScreen'
import { CommunityLists } from './CommunityListsTab'
import { TitlePicker } from '../ui/TitlePicker'
import { useCached } from '../utils/cache'
import { ComposerBar } from '../ui/ComposerBar'
import { SendIcon } from '../ui/SendIcon'
import { fileToImage } from '../utils/image'
import { Segmented } from '../ui/primitives'
import { UserAvatar, nameOf } from '../ui/social'
import { useSync } from '../logic/sync'
import { useToast } from '../store/useToast'
import type { SocialProfile } from '../data/social'
import { RowsSkeleton } from '../ui/Skeletons'
import {
  REACTIONS,
  addCommunityTitles,
  communityTitles,
  type CommunityTitle,
  addComment,
  createPost,
  deleteComment,
  deleteCommunity,
  deleteMessage,
  deletePost,
  getCommunity,
  joinCommunity,
  leaveCommunity,
  listComments,
  listMembers,
  listMessages,
  listPosts,
  moderateMember,
  profilesByIds,
  sendMessage,
  setPinned,
  subscribeMessages,
  toggleReaction,
  updateCommunity,
  type Comment,
  type Community,
  type Member,
  type Membership,
  type Message,
  type ModAction,
  type Post,
} from '../data/communities'

type Tab = 'news' | 'chat' | 'lists'
const tabMem: Record<string, Tab> = {}

function ago(iso: string): string {
  const s = Math.floor((Date.now() - Date.parse(iso)) / 1000)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const MOD_ERRORS: Record<string, string> = {
  not_allowed: 'You don’t have permission to do that',
  owner_cannot_leave: 'Hand over ownership or delete the community first',
  banned: 'You can’t join this community',
}

type CData = { community: Community; me: Membership | null } | { missing: true }

/** Shown instantly from the last copy, refreshed in the background. */
function useCommunity(id: string, signedIn: boolean) {
  const uid = useSync((s) => s.userId)
  const q = useCached<CData>(signedIn ? `c:${uid}:${id}` : null, async () => {
    const r = await getCommunity(id)
    if (r.ok) return r.value
    return r.code === 'not_found' ? { missing: true } : undefined
  })
  const value = q.data && 'community' in q.data ? q.data : q.data ? null : q.failed ? null : undefined
  return { data: value, reload: q.reload, failed: q.failed }
}

export function CommunityScreen({ view }: { view?: 'members' }) {
  const nav = useNavigate()
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const toast = useToast((s) => s.show)
  const signedIn = useSync((s) => s.status === 'signedIn')
  const { data, reload: load, failed } = useCommunity(id, signedIn)
  const [tab, setTabState] = useState<Tab>((params.get('tab') as Tab) || tabMem[id] || 'news')
  const setTab = (t: Tab) => ((tabMem[id] = t), setTabState(t))
  const [menu, setMenu] = useState(false)
  const [editing, setEditing] = useState(false)
  const [addingTitles, setAddingTitles] = useState(false)
  const [confirm, setConfirm] = useState<null | 'leave' | 'delete'>(null)
  const [busy, setBusy] = useState(false)
  const titlesQ = useCached<CommunityTitle[]>(data ? `ct:${id}` : null, async () => (data ? communityTitles(data.community) : undefined))
  const titles = titlesQ.data ?? []

  if (!signedIn)
    return (
      <Shell title="Community">
        <div className="empty">
          <div className="empty-title">Sign in to see communities</div>
        </div>
      </Shell>
    )
  if (data === undefined)
    return (
      <Shell title="">
        <CommunitySkeleton />
      </Shell>
    )
  if (data === null)
    return (
      <Shell title="Community">
        <div className="empty">
          <div className="empty-title">{failed ? 'Couldn’t load this community' : 'Community not found'}</div>
          <div className="empty-sub">{failed ? 'Check your connection and try again.' : 'It may have been deleted.'}</div>
          {failed && (
            <button className="sync-btn primary pressable" style={{ marginTop: 14 }} onClick={() => void load()}>
              Try again
            </button>
          )}
        </div>
      </Shell>
    )

  const { community: c, me } = data
  const active = me?.status === 'active'
  const isMod = active && (me!.role === 'owner' || me!.role === 'admin')
  const isOwner = active && me!.role === 'owner'
  const canRead = c.visibility === 'public' || active

  if (view === 'members')
    return (
      <Shell title="Members" sub={c.name}>
        {canRead ? <Members c={c} me={me} onChanged={load} /> : <div className="private-card"><div className="private-card-title">Members are visible to members</div></div>}
      </Shell>
    )

  const join = async () => {
    setBusy(true)
    const r = await joinCommunity(c.id)
    setBusy(false)
    if (!r.ok) return toast(MOD_ERRORS[r.code] ?? 'Couldn’t join right now')
    toast(r.value === 'pending' ? 'Request sent' : `Welcome to ${c.name}`)
    void load()
  }
  const leave = async () => {
    setConfirm(null)
    const r = await leaveCommunity(c.id)
    if (!r.ok) return toast(MOD_ERRORS[r.code] ?? 'Couldn’t leave right now')
    toast(me?.status === 'pending' ? 'Request cancelled' : `You left ${c.name}`)
    void load()
  }
  const remove = async () => {
    setConfirm(null)
    const r = await deleteCommunity(c.id)
    if (!r.ok) return toast(MOD_ERRORS[r.code] ?? 'Couldn’t delete right now')
    toast('Community deleted')
    nav('/communities', { replace: true })
  }

  return (
    <Shell
      title={c.name}
      right={
        <span className="header-icons">
          {canRead && (
            <button className="icon-round members-btn pressable" onClick={() => nav(`/c/${c.id}/members`)} aria-label={`Members (${c.member_count})`}>
              <PeopleIcon size={19} />
              <span className="members-count">{compact(c.member_count)}</span>
            </button>
          )}
          {active && (
            <button className="icon-round pressable" onClick={() => setMenu(true)} aria-label="Community options">
              <DotsIcon size={20} />
            </button>
          )}
        </span>
      }
    >
      <div className="community-banner" style={{ background: `linear-gradient(135deg, ${communityHue(c.id)}, color-mix(in srgb, ${communityHue(c.id)} 35%, #0e1318))` }}>
        {(c.banner || c.banner_thumb) && <img src={c.banner || c.banner_thumb || ''} alt="" />}
      </div>
      <div className="community-head">
        <CommunityAvatar c={c} className="community-avatar large" />
        <div style={{ minWidth: 0 }}>
          <div className="community-meta">
            {c.visibility === 'private' ? 'Private' : 'Public'} · {c.member_count.toLocaleString()} member{c.member_count === 1 ? '' : 's'}
            {me?.role && active && me.role !== 'member' ? ` · You’re ${me.role === 'owner' ? 'the owner' : 'an admin'}` : ''}
          </div>
        </div>
      </div>
      {c.description && <p className="community-desc">{c.description}</p>}

      {(titles.length > 0 || isMod) && (
        <div className="community-titles" aria-label="About">
          {titles.map((t) => (
            <button key={t.ref} className="ctitle pressable" onClick={() => nav(`/${t.ref.split(':')[0]}/${t.ref.split(':')[1]}`)}>
              {t.poster ? (
                <SmartImage src={t.poster} alt="" className="ctitle-poster" />
              ) : (
                <span className="ctitle-poster blank" aria-hidden="true">
                  {t.title.slice(0, 2).toUpperCase()}
                </span>
              )}
              <span className="ctitle-name">{t.title}</span>
            </button>
          ))}
          {isMod && titles.length < 25 && (
            <button className="ctitle add pressable" onClick={() => setAddingTitles(true)} aria-label="Link a title">
              <span className="ctitle-poster add">
                <PlusIcon size={20} />
              </span>
              <span className="ctitle-name">Add title</span>
            </button>
          )}
        </div>
      )}

      {!active && (
        <div className="page-pad" style={{ paddingBottom: 12 }}>
          {me?.status === 'pending' ? (
            <button className="follow-btn pressable" style={{ width: '100%' }} onClick={() => void leave()}>
              Requested · Cancel
            </button>
          ) : me?.status === 'banned' ? (
            <div className="vis-hint">You can’t join this community.</div>
          ) : (
            <button className="follow-btn primary pressable" style={{ width: '100%' }} disabled={busy} onClick={() => void join()}>
              {c.visibility === 'private' ? 'Request to join' : 'Join'}
            </button>
          )}
        </div>
      )}

      {!canRead ? (
        <div className="private-card">
          <div className="private-card-title">This community is private</div>
          <div className="private-card-sub">
            {me?.status === 'pending' ? 'An admin will review your request.' : 'Request to join to see the news, chat and lists.'}
          </div>
        </div>
      ) : (
        <>
          <div className="page-pad community-tabs">
            <Segmented
              options={[
                { key: 'news', label: 'News' },
                { key: 'chat', label: 'Chat' },
                { key: 'lists', label: 'Lists' },
              ]}
              value={tab}
              onChange={setTab}
            />
          </div>
          {tab === 'news' && <Announcements c={c} isMember={active} isMod={isMod} />}
          {tab === 'chat' &&
            (active ? (
              <Chat c={c} isMod={isMod} />
            ) : (
              <div className="private-card">
                <div className="private-card-title">Chat is for members</div>
                <div className="private-card-sub">Join to talk with everyone here.</div>
              </div>
            ))}
          {tab === 'lists' && <CommunityLists c={c} me={me} titles={titles} />}
        </>
      )}
      <div style={{ height: 28 }} />

      {addingTitles && (
        <TitlePicker
          kind="mixed"
          title="Link titles"
          isPicked={(ref) => titles.some((t) => t.ref === ref)}
          onToggle={async (ref, meta) => {
            if (titles.some((t) => t.ref === ref)) return toast('Linked titles stay linked')
            const r = await addCommunityTitles(c.id, [{ ref, title: meta.t, poster: meta.p, year: meta.y }])
            if (!r.ok) return toast(r.code === 'not_set_up' ? 'Run 009_titles_lists_comments.sql in Supabase first' : 'Couldn’t link that title')
            titlesQ.mutate((cur) => [...(cur ?? []), { community_id: c.id, ref, title: meta.t, poster: meta.p ?? null, year: meta.y ?? null }])
            toast(`Linked ${meta.t}`)
          }}
          onClose={() => {
            setAddingTitles(false)
            void titlesQ.reload()
            void load()
          }}
        />
      )}

      {menu &&
        createPortal(
          <div className="sheet-backdrop" onClick={() => setMenu(false)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-handle" />
              <div className="sheet-title">{c.name}</div>
              {isMod && (
                <button className="sheet-row" onClick={() => (setMenu(false), setEditing(true))}>
                  <span>Edit community</span>
                </button>
              )}
              {isMod && (
                <button className="sheet-row" onClick={() => (setMenu(false), setAddingTitles(true))}>
                  <span>Link titles</span>
                </button>
              )}
              {!isOwner && (
                <button className="sheet-row danger" onClick={() => (setMenu(false), setConfirm('leave'))}>
                  <span>Leave community</span>
                </button>
              )}
              {isOwner && (
                <button className="sheet-row danger" onClick={() => (setMenu(false), setConfirm('delete'))}>
                  <span>Delete community</span>
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}

      {editing && <EditSheet c={c} onClose={() => setEditing(false)} onSaved={() => (setEditing(false), void load())} />}

      {confirm &&
        createPortal(
          <div className="sheet-backdrop" onClick={() => setConfirm(null)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-handle" />
              <div className="confirm-title">{confirm === 'leave' ? `Leave ${c.name}?` : `Delete ${c.name}?`}</div>
              <div className="confirm-body">
                {confirm === 'leave'
                  ? c.visibility === 'private'
                    ? 'You’ll need to request to join again.'
                    : 'You can join again any time.'
                  : 'This permanently deletes the community, its news, chat and shared lists for everyone. Members’ own lists stay in their libraries.'}
              </div>
              <div className="confirm-actions">
                <button className="sync-btn ghost pressable" onClick={() => setConfirm(null)}>
                  Cancel
                </button>
                <button className="sync-btn danger pressable" onClick={() => void (confirm === 'leave' ? leave() : remove())}>
                  {confirm === 'leave' ? 'Leave' : 'Delete'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </Shell>
  )
}

const compact = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))

function CommunitySkeleton() {
  return (
    <div aria-busy="true">
      <div className="community-banner skeleton" />
      <div className="community-head">
        <span className="community-avatar large skeleton" />
        <span className="skeleton" style={{ display: 'block', width: 140, height: 12 }} />
      </div>
      <div className="page-pad">
        <span className="skeleton" style={{ display: 'block', width: '85%', height: 12, margin: '6px 0 18px' }} />
        <span className="skeleton" style={{ display: 'block', height: 44, borderRadius: 10, marginBottom: 14 }} />
        {Array.from({ length: 2 }, (_, i) => (
          <span key={i} className="skeleton" style={{ display: 'block', height: 120, borderRadius: 16, marginBottom: 12 }} />
        ))}
      </div>
    </div>
  )
}

function Shell({ title, sub, right, children }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode }) {
  const nav = useNavigate()
  return (
    <div className="scroll-area route-fade">
      <div className="app-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button className="pressable" onClick={() => nav(-1)} aria-label="Back" style={{ color: 'var(--text-dim)' }}>
            <ChevronLeft size={26} />
          </button>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 22, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h1>
            {sub && <div className="sub">{sub}</div>}
          </div>
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------- announcements

function Announcements({ c, isMember, isMod }: { c: Community; isMember: boolean; isMod: boolean }) {
  const toast = useToast((s) => s.show)
  const me = useSync((s) => s.userId)
  const postsQ = useCached<Post[]>(`posts:${c.id}`, () => listPosts(c.id))
  const posts = postsQ.data
  const setPosts = postsQ.mutate as (fn: (l: Post[] | undefined) => Post[] | undefined) => void
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [openPost, setOpenPost] = useState<string | null>(null)
  const [postMenu, setPostMenu] = useState<Post | null>(null)

  const load = postsQ.reload

  const publish = async () => {
    const body = draft.trim()
    if (!body || posting) return
    setPosting(true)
    const ok = await createPost(c.id, body)
    setPosting(false)
    if (!ok) return toast('Couldn’t post right now')
    setDraft('')
    void load()
  }
  const react = async (p: Post, emoji: string) => {
    if (!isMember) return toast('Join to react')
    const had = p.mine.includes(emoji)
    setPosts((list) =>
      list?.map((x) =>
        x.id === p.id
          ? {
              ...x,
              mine: had ? x.mine.filter((e) => e !== emoji) : [...x.mine, emoji],
              reactions: { ...x.reactions, [emoji]: Math.max(0, (x.reactions[emoji] ?? 0) + (had ? -1 : 1)) },
            }
          : x,
      ),
    )
    if (!(await toggleReaction(p, emoji))) void load()
  }

  return (
    <div className={`page-pad ${isMod ? 'has-composer' : ''}`}>
      {isMod && (
        <ComposerBar value={draft} onChange={setDraft} onSend={() => void publish()} busy={posting} placeholder="Share some news…" maxLength={4000} />
      )}
      {posts === undefined ? (
        <PostSkeletons />
      ) : posts.length === 0 ? (
        <div className="empty">
          <div className="empty-title">No news yet</div>
          <div className="empty-sub">{isMod ? 'Write the first post below.' : 'Owners and admins post news here.'}</div>
        </div>
      ) : (
        posts.map((p) => (
          <div key={p.id} className="post-card">
            <div className="post-head">
              {p.author && <UserAvatar profile={p.author} size={34} />}
              <div className="post-who">
                <span className="post-name">{p.author ? nameOf(p.author) : 'Member'}</span>
                <span className="post-time">
                  {ago(p.created_at)}
                  {p.pinned ? ' · Pinned' : ''}
                </span>
              </div>
              {(isMod || p.author_id === me) && (
                <button className="post-more pressable" onClick={() => setPostMenu(p)} aria-label="Post options">
                  <DotsIcon size={18} />
                </button>
              )}
            </div>
            <div className="post-body">{p.body}</div>
            <div className="post-reactions">
              {REACTIONS.map((e) => (
                <button key={e} className={`reaction pressable ${p.mine.includes(e) ? 'on' : ''}`} onClick={() => void react(p, e)}>
                  {e}
                  {p.reactions[e] ? <span>{p.reactions[e]}</span> : null}
                </button>
              ))}
              <button className="reaction comments pressable" onClick={() => setOpenPost(openPost === p.id ? null : p.id)}>
                💬 {p.commentCount || ''}
              </button>
            </div>
            {openPost === p.id && (
              <Comments
                post={p}
                isMember={isMember}
                isMod={isMod}
                onCount={(n) => setPosts((list) => list?.map((x) => (x.id === p.id ? { ...x, commentCount: n } : x)))}
              />
            )}
          </div>
        ))
      )}

      {postMenu &&
        createPortal(
          <div className="sheet-backdrop" onClick={() => setPostMenu(null)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-handle" />
              {isMod && (
                <button
                  className="sheet-row"
                  onClick={async () => {
                    const p = postMenu
                    setPostMenu(null)
                    if (await setPinned(p.id, !p.pinned)) void load()
                    else toast('Couldn’t update right now')
                  }}
                >
                  <span>{postMenu.pinned ? 'Unpin' : 'Pin to top'}</span>
                </button>
              )}
              <button
                className="sheet-row danger"
                onClick={async () => {
                  const p = postMenu
                  setPostMenu(null)
                  if (await deletePost(p.id)) setPosts((list) => list?.filter((x) => x.id !== p.id))
                  else toast('Couldn’t delete right now')
                }}
              >
                <span>Delete post</span>
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

function PostSkeletons() {
  return (
    <>
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="post-card" aria-hidden="true">
          <div className="post-head">
            <span className="skeleton" style={{ width: 34, height: 34, borderRadius: '50%' }} />
            <span className="skeleton" style={{ width: 120, height: 12 }} />
          </div>
          <span className="skeleton" style={{ display: 'block', height: 12, margin: '12px 0 6px' }} />
          <span className="skeleton" style={{ display: 'block', height: 12, width: '70%' }} />
        </div>
      ))}
    </>
  )
}

function Comments({ post, isMember, isMod, onCount }: { post: Post; isMember: boolean; isMod: boolean; onCount: (n: number) => void }) {
  const me = useSync((s) => s.userId)
  const toast = useToast((s) => s.show)
  const [list, setList] = useState<Comment[] | undefined>()
  const [draft, setDraft] = useState('')
  const load = useCallback(
    () =>
      listComments(post.id).then((l) => {
        setList(l)
        onCount(l.length)
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [post.id],
  )
  useEffect(() => {
    void load()
  }, [load])

  const send = async () => {
    const body = draft.trim()
    if (!body) return
    if (await addComment(post, body)) {
      setDraft('')
      void load()
    } else toast('Couldn’t comment right now')
  }

  return (
    <div className="comments">
      {list === undefined ? (
        <RowsSkeleton n={2} h={20} gap={6} />
      ) : list.length === 0 ? (
        <div className="vis-hint">No comments yet.</div>
      ) : (
        list.map((cm) => (
          <div key={cm.id} className="comment">
            <b>{cm.author ? nameOf(cm.author) : 'Member'}</b> {cm.body}
            <span className="post-time"> · {ago(cm.created_at)}</span>
            {(isMod || cm.author_id === me) && (
              <button className="comment-del" aria-label="Delete comment" onClick={async () => ((await deleteComment(cm.id)) ? load() : toast('Couldn’t delete'))}>
                ✕
              </button>
            )}
          </div>
        ))
      )}
      {isMember && (
        <form
          className="comment-form"
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
        >
          <input className="sync-input" maxLength={1000} placeholder="Add a comment…" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <button type="submit" className="send-btn small pressable" disabled={!draft.trim()} aria-label="Send comment">
            <SendIcon size={16} />
          </button>
        </form>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- chat

function Chat({ c, isMod }: { c: Community; isMod: boolean }) {
  const me = useSync((s) => s.userId)
  const toast = useToast((s) => s.show)
  const [msgs, setMsgs] = useState<Message[] | undefined>()
  const [people, setPeople] = useState<Map<string, SocialProfile>>(new Map())
  const [more, setMore] = useState(false)
  const [draft, setDraft] = useState('')
  const [picked, setPicked] = useState<number | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const addPeople = useCallback(async (ids: string[]) => {
    const missing = ids.filter((x) => !people.has(x))
    if (missing.length === 0) return
    const got = await profilesByIds(missing)
    setPeople((m) => new Map([...m, ...got]))
  }, [people])

  useEffect(() => {
    let alive = true
    listMessages(c.id).then((l) => {
      if (!alive) return
      setMsgs(l)
      setMore(l.length === 50)
      void addPeople(l.map((m) => m.author_id))
      setTimeout(() => endRef.current?.scrollIntoView({ block: 'end' }), 30)
    })
    const off = subscribeMessages(
      c.id,
      (m) => {
        setMsgs((list) => (list?.some((x) => x.id === m.id) ? list : [...(list ?? []), m]))
        void addPeople([m.author_id])
        setTimeout(() => endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }), 30)
      },
      (gone) => setMsgs((list) => list?.filter((x) => x.id !== gone)),
    )
    // Safety net if the live connection drops: quietly catch up every 15s.
    const poll = setInterval(async () => {
      const latest = await listMessages(c.id)
      if (!alive) return
      setMsgs((list) => {
        const have = new Set((list ?? []).map((x) => x.id))
        const fresh = latest.filter((x) => !have.has(x.id))
        return fresh.length ? [...(list ?? []), ...fresh].sort((a, b) => a.id - b.id) : list
      })
    }, 15000)
    return () => {
      alive = false
      off()
      clearInterval(poll)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.id])

  const send = async () => {
    const body = draft.trim()
    if (!body) return
    setDraft('')
    const m = await sendMessage(c.id, body)
    if (!m) {
      setDraft(body)
      return toast('Message not sent — try again')
    }
    setMsgs((list) => (list?.some((x) => x.id === m.id) ? list : [...(list ?? []), m]))
    setTimeout(() => endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }), 30)
  }
  const older = async () => {
    if (!msgs?.length) return
    const l = await listMessages(c.id, msgs[0].id)
    setMore(l.length === 50)
    setMsgs((list) => [...l, ...(list ?? [])])
    void addPeople(l.map((m) => m.author_id))
  }

  return (
    <div className="chat has-composer">
      {more && (
        <button className="auth-link" onClick={() => void older()}>
          Load earlier messages
        </button>
      )}
      {msgs === undefined ? (
        <div aria-busy="true">
          {[60, 42, 70, 50].map((w, i) => (
            <div key={i} className={`msg ${i % 2 ? 'mine' : ''}`}>
              <span className="skeleton" style={{ display: 'block', width: `${w}%`, height: 38, borderRadius: 18 }} />
            </div>
          ))}
        </div>
      ) : msgs.length === 0 ? (
        <div className="empty">
          <div className="empty-title">Say hi 👋</div>
          <div className="empty-sub">Messages here are visible to members of {c.name}.</div>
        </div>
      ) : (
        msgs.map((m, i) => {
          const mine = m.author_id === me
          const p = people.get(m.author_id)
          const firstOfRun = i === 0 || msgs[i - 1].author_id !== m.author_id
          return (
            <div key={m.id} className={`msg ${mine ? 'mine' : ''}`}>
              {!mine && firstOfRun && <div className="msg-name">{p ? nameOf(p) : '…'}</div>}
              <button className="msg-bubble" onClick={() => setPicked(picked === m.id ? null : m.id)}>
                {m.body}
                <span className="msg-time">{ago(m.created_at)}</span>
              </button>
              {picked === m.id && (mine || isMod) && (
                <button
                  className="msg-del"
                  onClick={async () => {
                    setPicked(null)
                    if (await deleteMessage(m.id)) setMsgs((list) => list?.filter((x) => x.id !== m.id))
                    else toast('Couldn’t delete')
                  }}
                >
                  Delete message
                </button>
              )}
            </div>
          )
        })
      )}
      <div ref={endRef} />
      <ComposerBar value={draft} onChange={setDraft} onSend={() => void send()} placeholder={`Message ${c.name}`} maxLength={1000} />
    </div>
  )
}

// ---------------------------------------------------------------- members

function Members({ c, me, onChanged }: { c: Community; me: Membership | null; onChanged: () => void }) {
  const nav = useNavigate()
  const myId = useSync((s) => s.userId)
  const toast = useToast((s) => s.show)
  const [list, setList] = useState<Member[] | undefined>()
  const [acting, setActing] = useState<Member | null>(null)
  const isMod = me?.status === 'active' && me.role !== 'member'
  const isOwner = me?.status === 'active' && me.role === 'owner'

  const load = useCallback(() => listMembers(c.id).then(setList), [c.id])
  useEffect(() => {
    void load()
  }, [load])

  const act = async (m: Member, action: ModAction) => {
    setActing(null)
    const r = await moderateMember(c.id, m.user_id, action)
    if (!r.ok) return toast(MOD_ERRORS[r.code] ?? 'Couldn’t update right now')
    const who = m.profile?.username ? `@${m.profile.username}` : 'Member'
    const msg: Record<ModAction, string> = {
      approve: `${who} joined`,
      decline: 'Request declined',
      remove: `${who} removed`,
      ban: `${who} banned`,
      unban: `${who} can join again`,
      make_admin: `${who} is now an admin`,
      make_member: `${who} is now a member`,
      transfer_owner: `${who} is now the owner`,
    }
    toast(msg[action])
    void load()
    onChanged()
  }

  if (list === undefined)
    return (
      <div className="page-pad" aria-busy="true">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="skeleton" style={{ height: 58, borderRadius: 14, margin: '8px 0' }} />
        ))}
      </div>
    )
  const pending = list.filter((m) => m.status === 'pending')
  const active = list.filter((m) => m.status === 'active')
  const banned = list.filter((m) => m.status === 'banned')
  // What the viewer may do to a given member (mirrors the database rules).
  const canManage = (m: Member) => isMod && m.user_id !== myId && m.role !== 'owner' && (m.role !== 'admin' || isOwner)

  const row = (m: Member, right?: React.ReactNode) => (
    <div key={m.user_id} className="user-row pressable" role="button" tabIndex={0} onClick={() => nav(m.user_id === myId ? '/profile' : `/u/${m.user_id}`)}>
      {m.profile ? <UserAvatar profile={m.profile} /> : <span className="user-avatar">?</span>}
      <span className="user-info">
        <span className="user-name">
          {m.profile ? nameOf(m.profile) : 'Member'}
          {m.role !== 'member' && m.status === 'active' && <span className="lock-chip">{m.role === 'owner' ? 'Owner' : 'Admin'}</span>}
        </span>
        {m.profile?.username && <span className="user-handle">@{m.profile.username}</span>}
      </span>
      {right}
    </div>
  )

  return (
    <div className="page-pad">
      {isMod && pending.length > 0 && (
        <>
          <div className="members-label">Requests · {pending.length}</div>
          {pending.map((m) =>
            row(
              m,
              <span style={{ display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                <button className="follow-btn primary compact pressable" onClick={() => void act(m, 'approve')}>
                  Approve
                </button>
                <button className="follow-btn compact pressable" onClick={() => void act(m, 'decline')}>
                  Decline
                </button>
              </span>,
            ),
          )}
        </>
      )}
      <div className="members-label">Members · {active.length}</div>
      {active.map((m) =>
        row(
          m,
          canManage(m) ? (
            <button
              className="post-more pressable"
              aria-label="Manage member"
              onClick={(e) => {
                e.stopPropagation()
                setActing(m)
              }}
            >
              <DotsIcon size={18} />
            </button>
          ) : undefined,
        ),
      )}
      {isMod && banned.length > 0 && (
        <>
          <div className="members-label">Banned · {banned.length}</div>
          {banned.map((m) =>
            row(
              m,
              <button
                className="follow-btn compact pressable"
                onClick={(e) => {
                  e.stopPropagation()
                  void act(m, 'unban')
                }}
              >
                Unban
              </button>,
            ),
          )}
        </>
      )}

      {acting &&
        createPortal(
          <div className="sheet-backdrop" onClick={() => setActing(null)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-handle" />
              <div className="sheet-title">{acting.profile ? nameOf(acting.profile) : 'Member'}</div>
              {isOwner && acting.role === 'member' && (
                <button className="sheet-row" onClick={() => void act(acting, 'make_admin')}>
                  <span>Make admin</span>
                </button>
              )}
              {isOwner && acting.role === 'admin' && (
                <button className="sheet-row" onClick={() => void act(acting, 'make_member')}>
                  <span>Remove admin role</span>
                </button>
              )}
              {isOwner && (
                <button className="sheet-row" onClick={() => void act(acting, 'transfer_owner')}>
                  <span>Make owner (you become an admin)</span>
                </button>
              )}
              <button className="sheet-row danger" onClick={() => void act(acting, 'remove')}>
                <span>Remove from community</span>
              </button>
              <button className="sheet-row danger" onClick={() => void act(acting, 'ban')}>
                <span>Ban</span>
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

// ---------------------------------------------------------------- edit

function EditSheet({ c, onClose, onSaved }: { c: Community; onClose: () => void; onSaved: () => void }) {
  const toast = useToast((s) => s.show)
  const [name, setName] = useState(c.name)
  const [description, setDescription] = useState(c.description)
  const [visibility, setVisibility] = useState(c.visibility)
  const [avatar, setAvatar] = useState<string | null | undefined>(c.avatar)
  const [banner, setBanner] = useState<{ full: string | null; thumb: string | null } | undefined>(
    c.banner || c.banner_thumb ? { full: c.banner ?? null, thumb: c.banner_thumb ?? null } : undefined,
  )
  const [saving, setSaving] = useState(false)
  const avatarInput = useRef<HTMLInputElement>(null)
  const bannerInput = useRef<HTMLInputElement>(null)
  const valid = name.trim().length >= 3
  const save = async () => {
    setSaving(true)
    const patch: Parameters<typeof updateCommunity>[1] = { name: name.trim(), description: description.trim(), visibility }
    if (avatar !== c.avatar) patch.avatar = avatar ?? null
    if ((banner?.full ?? null) !== (c.banner ?? null)) {
      patch.banner = banner?.full ?? null
      patch.banner_thumb = banner?.thumb ?? null
    }
    const r = await updateCommunity(c.id, patch)
    setSaving(false)
    if (r.ok) onSaved()
    else toast(patch.avatar !== undefined || patch.banner !== undefined ? 'Couldn’t save the pictures — run 007_community_images.sql in Supabase' : 'Couldn’t save changes')
  }
  const pick = async (f: File | undefined, kind: 'avatar' | 'banner') => {
    if (!f) return
    try {
      if (kind === 'avatar') setAvatar(await fileToImage(f, 256, 256))
      else setBanner({ full: await fileToImage(f, 1200, 400, 0.78), thumb: await fileToImage(f, 480, 144, 0.72) })
    } catch {
      toast('Couldn’t read that image')
    }
  }
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <form
        className="sheet community-form"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) void save()
        }}
      >
        <div className="sheet-handle" />
        <div className="sheet-title">Edit community</div>
        <div className="edit-pictures">
          <button type="button" className="edit-banner pressable" onClick={() => bannerInput.current?.click()} style={{ background: communityHue(c.id) }}>
            {banner?.full || banner?.thumb ? <img src={banner.full || banner.thumb || ''} alt="" /> : <span>Add a banner</span>}
          </button>
          <button type="button" className="edit-avatar pressable" onClick={() => avatarInput.current?.click()} style={{ background: communityHue(c.id) }}>
            {avatar ? <img src={avatar} alt="" /> : <span>{name.trim()[0]?.toUpperCase() ?? '+'}</span>}
          </button>
        </div>
        <div className="edit-picture-actions">
          <button type="button" className="auth-link" onClick={() => avatarInput.current?.click()}>
            {avatar ? 'Change picture' : 'Add picture'}
          </button>
          {avatar && (
            <button type="button" className="auth-link danger" onClick={() => setAvatar(null)}>
              Remove picture
            </button>
          )}
          {banner && (
            <button type="button" className="auth-link danger" onClick={() => setBanner(undefined)}>
              Remove banner
            </button>
          )}
        </div>
        <input ref={avatarInput} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => (void pick(e.target.files?.[0], 'avatar'), (e.target.value = ''))} />
        <input ref={bannerInput} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => (void pick(e.target.files?.[0], 'banner'), (e.target.value = ''))} />
        <input className="sync-input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        <textarea className="sync-input" rows={3} maxLength={500} placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="vis-choice">
          <button type="button" className={`vis-opt pressable ${visibility === 'public' ? 'on' : ''}`} onClick={() => setVisibility('public')}>
            Public
          </button>
          <button type="button" className={`vis-opt pressable ${visibility === 'private' ? 'on' : ''}`} onClick={() => setVisibility('private')}>
            Private
          </button>
        </div>
        <button type="submit" className="welcome-primary pressable" disabled={!valid || saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>
    </div>,
    document.body,
  )
}
