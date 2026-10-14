import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { PeopleIcon, PlusIcon, ChevronRight } from '../components/Icons'
import { SmartImage } from '../components/ui'
import { SearchField, SectionHeader } from '../ui/primitives'
import { useSync } from '../logic/sync'
import { useToast } from '../store/useToast'
import { createCommunity, findCommunities, myCommunities, type Community, type Membership } from '../data/communities'

export interface TopicDraft {
  type: 'show' | 'movie'
  id: string
  title: string
  poster?: string
}

const mem = { q: '' }

const HUES = ['#2a8fc0', '#7b5cd6', '#c0612a', '#2aa676', '#c03a5a', '#4a6bd6', '#b08a1e']
export function communityHue(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return HUES[Math.abs(h) % HUES.length]
}

/** Community picture: its own photo, else the linked title's poster, else its initial. */
export function CommunityAvatar({ c, className = 'community-avatar' }: { c: Community; className?: string }) {
  const src = c.avatar || c.topic_poster
  return (
    <span className={className} style={src ? undefined : { background: communityHue(c.id) }}>
      {src ? <SmartImage src={src} alt="" /> : c.name[0].toUpperCase()}
    </span>
  )
}

/** Full-width discover card: banner strip, picture, name, size and a line of description. */
export function CommunityCard({ c, badge }: { c: Community; badge?: string }) {
  const nav = useNavigate()
  const hue = communityHue(c.id)
  return (
    <button className="community-card pressable" onClick={() => nav(`/c/${c.id}`)}>
      <span className="community-card-banner" style={{ background: `linear-gradient(135deg, ${hue}, color-mix(in srgb, ${hue} 40%, #0e1318))` }}>
        {c.banner_thumb && <img src={c.banner_thumb} alt="" />}
        {badge && <span className="community-card-badge">{badge}</span>}
      </span>
      <span className="community-card-body">
        <CommunityAvatar c={c} className="community-avatar card" />
        <span className="community-row-text">
          <span className="community-row-name">{c.name}</span>
          <span className="community-row-sub">
            {c.visibility === 'private' ? 'Private · ' : ''}
            {c.member_count.toLocaleString()} member{c.member_count === 1 ? '' : 's'}
            {c.topic_title ? ` · ${c.topic_title}` : ''}
          </span>
          {c.description && <span className="community-card-desc">{c.description}</span>}
        </span>
      </span>
    </button>
  )
}

export function CommunityRow({ c, right }: { c: Community; right?: React.ReactNode }) {
  const nav = useNavigate()
  return (
    <button className="community-row pressable" onClick={() => nav(`/c/${c.id}`)}>
      <CommunityAvatar c={c} />
      <span className="community-row-text">
        <span className="community-row-name">{c.name}</span>
        <span className="community-row-sub">
          {c.visibility === 'private' ? 'Private · ' : ''}
          {c.member_count.toLocaleString()} member{c.member_count === 1 ? '' : 's'}
          {c.topic_title ? ` · ${c.topic_title}` : ''}
        </span>
      </span>
      {right ?? <ChevronRight size={20} className="user-chevron" />}
    </button>
  )
}

/** Communities tab: yours, discover/search, filter by title, and create. */
export function CommunitiesScreen() {
  const nav = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const signedIn = useSync((s) => s.status === 'signedIn')
  const [q, setQState] = useState(mem.q)
  const setQ = (v: string) => ((mem.q = v), setQState(v))
  const [mine, setMine] = useState<(Community & Membership)[] | undefined>()
  const [found, setFound] = useState<Community[] | undefined>()
  const [error, setError] = useState<string>()
  const [creating, setCreating] = useState<TopicDraft | null | false>(false)

  // ?topic=show:1396 (from a show/movie page); title/poster ride along in state.
  const topicParam = params.get('topic')
  const stateTopic = (location.state as { topic?: TopicDraft } | null)?.topic
  const topic: TopicDraft | undefined = topicParam
    ? stateTopic ?? { type: topicParam.split(':')[0] as 'show' | 'movie', id: topicParam.split(':')[1], title: '' }
    : undefined

  useEffect(() => {
    if (!signedIn) return
    let alive = true
    myCommunities().then((r) => {
      if (!alive) return
      if (r.ok) setMine(r.value)
      else setError(r.code)
    })
    return () => {
      alive = false
    }
  }, [signedIn, creating])

  useEffect(() => {
    if (!signedIn) return
    let alive = true
    const t = setTimeout(() => {
      findCommunities(topic ? '' : q, topic ? { type: topic.type, id: topic.id } : undefined).then((r) => {
        if (!alive) return
        if (r.ok) setFound(r.value)
        else setError(r.code)
      })
    }, q ? 300 : 0)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [q, signedIn, topicParam])

  const myStatus = new Map((mine ?? []).map((c) => [c.id, c]))
  const discover = found ?? []
  const badgeFor = (c: Community) => {
    const m = myStatus.get(c.id)
    if (!m) return undefined
    return m.status === 'pending' ? 'Requested' : m.role === 'owner' ? 'Owner' : m.role === 'admin' ? 'Admin' : 'Joined'
  }

  return (
    <div className="scroll-area route-fade">
      <div className="app-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1>Communities</h1>
          <div className="sub">Groups for the shows and films you love</div>
        </div>
        {signedIn && !error && (
          <button className="icon-round pressable" onClick={() => setCreating(topic ?? null)} aria-label="Create a community">
            <PlusIcon size={20} />
          </button>
        )}
      </div>

      {!signedIn ? (
        <Empty title="Sign in to join communities" sub="Communities are for Watcher members. Sign in or create an account in Settings." />
      ) : error === 'not_set_up' ? (
        <Empty title="Communities aren’t switched on yet" sub="Run supabase/006_communities.sql in Supabase to turn them on." />
      ) : error ? (
        <Empty title="Couldn’t load communities" sub="Check your connection and try again." />
      ) : topic ? (
        <>
          <div className="page-pad topic-banner">
            <span>
              Communities about <b>{topic.title || 'this title'}</b>
            </span>
            <button className="auth-link" onClick={() => setParams({}, { replace: true })}>
              See all
            </button>
          </div>
          <div className="page-pad">
            {found === undefined ? (
              <Empty sub="Loading…" />
            ) : found.length === 0 ? (
              <Empty title="No communities yet" sub="Start the first one for this title." />
            ) : (
              found.map((c) => <CommunityCard key={c.id} c={c} badge={badgeFor(c)} />)
            )}
            <button className="sync-btn primary full pressable" style={{ marginTop: 10 }} onClick={() => setCreating(topic)}>
              Start a community{topic.title ? ` for ${topic.title}` : ''}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="page-pad" style={{ paddingBottom: 6 }}>
            <SearchField value={q} onChange={setQ} placeholder="Search communities" />
          </div>

          {!q && (mine?.length ?? 0) > 0 && (
            <>
              <SectionHeader title="Yours" />
              <div className="page-pad">
                {mine!.map((c) => (
                  <CommunityRow
                    key={c.id}
                    c={c}
                    right={
                      c.status === 'pending' ? (
                        <span className="lock-chip">Requested</span>
                      ) : c.role !== 'member' ? (
                        <span className="lock-chip">{c.role === 'owner' ? 'Owner' : 'Admin'}</span>
                      ) : undefined
                    }
                  />
                ))}
              </div>
            </>
          )}

          <SectionHeader title={q ? 'Results' : 'Discover'} />
          <div className="page-pad">
            {found === undefined ? (
              <Empty sub="Loading…" />
            ) : discover.length === 0 ? (
              q ? (
                <Empty title="No communities found" sub="Try another name, or start one." />
              ) : (
                <div className="empty">
                  <div className="soon-icon">
                    <PeopleIcon size={30} />
                  </div>
                  <div className="empty-title">No communities yet</div>
                  <div className="empty-sub">Start one for a show, a film, or anything you watch with friends.</div>
                  <button className="sync-btn primary pressable" style={{ marginTop: 14 }} onClick={() => setCreating(null)}>
                    Start a community
                  </button>
                </div>
              )
            ) : (
              discover.map((c) => <CommunityCard key={c.id} c={c} badge={badgeFor(c)} />)
            )}
          </div>
        </>
      )}
      <div style={{ height: 24 }} />

      {creating !== false && (
        <CreateCommunitySheet
          topic={creating ?? undefined}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false)
            nav(`/c/${id}`)
          }}
        />
      )}
    </div>
  )
}

function Empty({ title, sub }: { title?: string; sub?: string }) {
  return (
    <div className="empty">
      {title && <div className="empty-title">{title}</div>}
      {sub && <div className="empty-sub">{sub}</div>}
    </div>
  )
}

function CreateCommunitySheet({ topic, onClose, onCreated }: { topic?: TopicDraft; onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast((s) => s.show)
  const [name, setName] = useState(topic?.title ? `${topic.title} fans` : '')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [linkTopic, setLinkTopic] = useState(!!topic)
  const [saving, setSaving] = useState(false)
  const valid = name.trim().length >= 3 && name.trim().length <= 60

  const submit = async () => {
    if (!valid || saving) return
    setSaving(true)
    const r = await createCommunity({ name: name.trim(), description: description.trim(), visibility, topic: linkTopic ? topic : undefined })
    setSaving(false)
    if (r.ok) onCreated(r.value)
    else toast(r.code === 'too_many_communities' ? 'You can own up to 10 communities' : 'Couldn’t create the community')
  }

  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <form
        className="sheet community-form"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="sheet-handle" />
        <div className="sheet-title">New community</div>
        <input className="sync-input" placeholder="Name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        <textarea className="sync-input" placeholder="What’s it about? (optional)" maxLength={500} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        {topic && (
          <button type="button" className="settings-switch-row" onClick={() => setLinkTopic((v) => !v)}>
            <span>Linked to {topic.title || 'this title'}</span>
            <span className={`switch ${linkTopic ? 'on' : ''}`}>
              <span className="switch-knob" />
            </span>
          </button>
        )}
        <div className="vis-choice">
          <button type="button" className={`vis-opt pressable ${visibility === 'public' ? 'on' : ''}`} onClick={() => setVisibility('public')}>
            Public
          </button>
          <button type="button" className={`vis-opt pressable ${visibility === 'private' ? 'on' : ''}`} onClick={() => setVisibility('private')}>
            Private
          </button>
        </div>
        <div className="vis-hint">
          {visibility === 'public'
            ? 'Anyone can read announcements and join. Chat is for members.'
            : 'Anyone can find it, but you approve who joins and only members see inside.'}
        </div>
        <button type="submit" className="welcome-primary pressable" disabled={!valid || saving}>
          {saving ? 'Creating…' : 'Create community'}
        </button>
      </form>
    </div>,
    document.body,
  )
}
