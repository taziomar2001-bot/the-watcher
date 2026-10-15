import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { PlusIcon, ChevronRight, FilterIcon } from '../components/Icons'
import { SmartImage } from '../components/ui'
import { SearchField, SectionHeader } from '../ui/primitives'
import { useSync } from '../logic/sync'
import { communitiesForTitle, type Community, type CommunityDiscoveryFilters } from '../data/communities'
import { useMyCommunities } from '../logic/communityCache'
import { communityLocation, communitySearchText, contentTypesLabel, matchesCommunityFilters } from '../logic/communityTaxonomy'
import { useCached } from '../utils/cache'
import { CommunityFilterSheet, type MyCommunityRoleFilter } from '../ui/CommunityFilterSheet'

export interface TopicDraft {
  type: 'show' | 'movie'
  id: string
  title: string
  poster?: string
  year?: number
}

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
          <span className="community-tags"><span>{contentTypesLabel(c.content_types)}</span><span>{communityLocation(c)}</span></span>
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
        <span className="community-tags"><span>{contentTypesLabel(c.content_types)}</span><span>{communityLocation(c)}</span></span>
      </span>
      {right ?? <ChevronRight size={20} className="user-chevron" />}
    </button>
  )
}

/** Communities home: a focused entry to discovery and recently active groups. */
export function CommunitiesScreen() {
  const nav = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const signedIn = useSync((s) => s.status === 'signedIn')
  const [q, setQ] = useState('')
  const [filters, setFilters] = useState<CommunityDiscoveryFilters>({})
  const [role, setRole] = useState<MyCommunityRoleFilter>('all')
  const [filterOpen, setFilterOpen] = useState(false)

  // Title deep links still show the groups connected to that title.
  const topicParam = params.get('topic')
  const stateTopic = (location.state as { topic?: TopicDraft } | null)?.topic
  const topic: TopicDraft | undefined = topicParam
    ? stateTopic ?? { type: topicParam.split(':')[0] as 'show' | 'movie', id: topicParam.split(':')[1], title: '' }
    : undefined
  const { list: mine, error: mineError, reload: reloadMine } = useMyCommunities()
  const foundQ = useCached<Community[] | { error: string }>(
    signedIn && topicParam ? `about:${topicParam}` : null,
    async () => {
      const r = await communitiesForTitle(topicParam!)
      if (r.ok) return r.value
      return r.code === 'not_set_up' ? { error: 'not_set_up' } : undefined
    },
  )
  const found = Array.isArray(foundQ.data) ? foundQ.data : undefined
  const error = mineError === 'not_set_up' || (foundQ.data && !Array.isArray(foundQ.data))
    ? 'not_set_up' : mineError || foundQ.failed ? 'error' : undefined
  useEffect(() => {
    void reloadMine()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const myStatus = new Map((mine ?? []).map((c) => [c.id, c]))
  const badgeFor = (c: Community) => {
    const m = myStatus.get(c.id)
    if (!m) return undefined
    return m.status === 'pending' ? 'Requested' : m.role === 'owner' ? 'Owner' : m.role === 'admin' ? 'Admin' : 'Joined'
  }
  const active = (mine ?? []).filter((c) => c.status === 'active')
  const pending = (mine ?? []).filter((c) => c.status === 'pending')
  const term = q.trim().toLocaleLowerCase()
  const visible = active.filter((c) => (role === 'all' || c.role === role) &&
    matchesCommunityFilters(c, filters) && (!term || communitySearchText(c).includes(term)))
  const hasFilters = !!filters.contentType || !!filters.location || role !== 'all'

  return (
    <div className="scroll-area route-fade">
      <div className="app-header community-home-header">
        <div>
          <h1>Communities</h1>
          <div className="sub">Groups for the shows and films you love</div>
        </div>
        {signedIn && !error && (
          <div className="header-icons">
            <button className="icon-round pressable" onClick={() => nav('/communities/new', { state: { topic } })} aria-label="Create a community">
              <PlusIcon size={20} />
            </button>
          </div>
        )}
      </div>

      {!signedIn ? (
        <Empty title="Sign in to join communities" sub="Communities are for Watcher members. Sign in or create an account in Settings." />
      ) : error === 'not_set_up' ? (
        <Empty title="Communities aren’t switched on yet" sub="Run the community SQL steps in Supabase to turn them on." />
      ) : error ? (
        <Empty title="Couldn’t load communities" sub="Check your connection and try again." />
      ) : topic ? (
        <>
          <div className="page-pad topic-banner">
            <span>Communities about <b>{topic.title || 'this title'}</b></span>
            <button className="auth-link" onClick={() => setParams({}, { replace: true })}>See all</button>
          </div>
          <div className="page-pad">
            {found === undefined ? <CardSkeletons n={2} /> :
              found.length === 0 ? <Empty title="No communities yet" sub="Start the first one for this title." /> :
                found.map((c) => <CommunityCard key={c.id} c={c} badge={badgeFor(c)} />)}
            <button className="sync-btn primary full pressable" style={{ marginTop: 10 }} onClick={() => nav('/communities/new', { state: { topic } })}>
              Start a community{topic.title ? ` for ${topic.title}` : ''}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="page-pad">
            <button className="community-discover-hero pressable" onClick={() => nav('/communities/discover')}>
              <span className="community-discover-overline">FIND YOUR PEOPLE</span>
              <span className="community-discover-title">Discover <ChevronRight size={29} /></span>
              <span className="community-discover-sub">Explore every community</span>
            </button>
          </div>
          <SectionHeader title="Your communities" />
          {(mine?.length ?? 0) > 0 && (
            <div className="page-pad community-search-controls">
              <SearchField value={q} onChange={setQ} placeholder="Search your communities" />
              <button className={`icon-round pressable ${hasFilters ? 'has-filters' : ''}`}
                onClick={() => setFilterOpen(true)} aria-label="Filter your communities">
                <FilterIcon size={20} />
              </button>
            </div>
          )}
          <div className="page-pad">
            {mine === undefined ? <CardSkeletons n={2} /> :
              active.length === 0 ? (
                <Empty title="No communities yet" sub="Discover a group or create one of your own." />
              ) : visible.length === 0 ? (
                <Empty title="No matches" sub="Try another search or clear the filters." />
              ) : visible.map((c) => <CommunityCard key={c.id} c={c} badge={badgeFor(c)} />)}
          </div>
          {pending.length > 0 && !term && (
            <>
              <SectionHeader title="Requests" />
              <div className="page-pad">
                {pending.map((c) => <CommunityCard key={c.id} c={c} badge="Requested" />)}
              </div>
            </>
          )}
        </>
      )}
      <div style={{ height: 24 }} />
      {filterOpen && <CommunityFilterSheet filters={filters} role={role}
        onApply={(next, nextRole) => {
          setFilters(next)
          setRole(nextRole ?? 'all')
          setFilterOpen(false)
        }} onClose={() => setFilterOpen(false)} />}
    </div>
  )
}

export function CardSkeletons({ n }: { n: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="community-card skeleton-card" aria-hidden="true">
          <span className="community-card-banner skeleton" />
          <span className="community-card-body">
            <span className="community-avatar card skeleton" />
            <span className="community-row-text">
              <span className="skeleton" style={{ display: 'block', width: '55%', height: 15 }} />
              <span className="skeleton" style={{ display: 'block', width: '35%', height: 11, marginTop: 7 }} />
              <span className="skeleton" style={{ display: 'block', width: '80%', height: 11, marginTop: 7 }} />
            </span>
          </span>
        </div>
      ))}
    </>
  )
}

export function RowSkeletons({ n }: { n: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="community-row skeleton-card" aria-hidden="true">
          <span className="community-avatar skeleton" />
          <span className="community-row-text">
            <span className="skeleton" style={{ display: 'block', width: '50%', height: 14 }} />
            <span className="skeleton" style={{ display: 'block', width: '30%', height: 11, marginTop: 6 }} />
          </span>
        </div>
      ))}
    </>
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

/** Linked titles as poster chips. `onRemove` only for titles not saved yet. */
export function TitleChips({
  titles,
  onRemove,
  onAdd,
  locked,
}: {
  titles: TopicDraft[]
  onRemove?: (t: TopicDraft) => void
  onAdd?: () => void
  locked?: (t: TopicDraft) => boolean
}) {
  return (
    <div className="title-chips">
      {titles.map((t) => (
        <span key={`${t.type}:${t.id}`} className="title-chip">
          <SmartImage src={t.poster} alt="" className="title-chip-poster" />
          <span className="title-chip-name">{t.title || 'Untitled'}</span>
          {onRemove && !locked?.(t) && (
            <button type="button" className="title-chip-x" aria-label={`Remove ${t.title}`} onClick={() => onRemove(t)}>
              ✕
            </button>
          )}
        </span>
      ))}
      {onAdd && (
        <button type="button" className="title-chip add pressable" onClick={onAdd}>
          <PlusIcon size={14} /> Add a title
        </button>
      )}
    </div>
  )
}
