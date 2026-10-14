import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { SmartImage } from '../components/ui'
import { Segmented } from '../ui/primitives'
import { ChevronLeft } from '../components/Icons'
import { getProfileById, getShowcase, type Showcase, type ShowcaseItem, type SocialProfile } from '../data/social'
import { useScrollMemory } from '../hooks/useScrollMemory'
import { nameOf } from '../ui/social'

type Kind = 'tv' | 'movies' | 'favorites' | 'list'

function Grid({ items, ranked }: { items: ShowcaseItem[]; ranked?: boolean }) {
  const nav = useNavigate()
  if (items.length === 0)
    return (
      <div className="empty">
        <div className="empty-title">Nothing here</div>
      </div>
    )
  return (
    <div className="poster-grid">
      {items.map((it, i) => (
        <button key={`${it.type}:${it.id}`} className="poster-thumb pressable" style={{ width: 'auto', textAlign: 'left' }} onClick={() => nav(`/${it.type}/${it.id}`)}>
          <div className="poster-thumb-art">
            <SmartImage src={it.poster} alt={it.title} />
            {ranked && <span className="rank-badge">{i + 1}</span>}
          </div>
          <div className="poster-thumb-title">{it.title}</div>
        </button>
      ))}
    </div>
  )
}

/** Another member's favorites or one of their public lists (from their showcase). */
export function PublicLibraryScreen({ kind }: { kind: Kind }) {
  const nav = useNavigate()
  const { id = '', listId = '' } = useParams()
  const scrollRef = useScrollMemory<HTMLDivElement>(`pub-${id}-${kind}-${listId}`)
  const [favTab, setFavTab] = useState<'show' | 'movie'>('show')
  const [data, setData] = useState<{ profile: SocialProfile | null; showcase: Showcase | null } | undefined>()

  useEffect(() => {
    let alive = true
    Promise.all([getProfileById(id), getShowcase(id)]).then(([profile, showcase]) => alive && setData({ profile, showcase }))
    return () => {
      alive = false
    }
  }, [id])

  // Full libraries stay private; these old routes just go back to the profile.
  if (kind === 'tv' || kind === 'movies') return <Navigate to={`/u/${id}`} replace />

  const list = kind === 'list' ? data?.showcase?.lists.find((l) => l.id === listId) : undefined
  const title = kind === 'favorites' ? 'Favorites' : list?.name ?? 'List'

  let body: React.ReactNode
  if (data === undefined)
    body = (
      <div className="empty">
        <div className="empty-sub">Loading…</div>
      </div>
    )
  else if (!data.showcase)
    body = (
      <div className="empty">
        <div className="empty-title">Not available</div>
        <div className="empty-sub">This account is private or hasn’t shared anything yet.</div>
      </div>
    )
  else if (kind === 'favorites') {
    const favs = data.showcase.favorites
    body = (
      <>
        <div className="page-pad" style={{ paddingBottom: 10 }}>
          <Segmented
            options={[
              { key: 'show', label: 'TV Shows' },
              { key: 'movie', label: 'Movies' },
            ]}
            value={favTab}
            onChange={setFavTab}
          />
        </div>
        <Grid items={favs.filter((f) => f.type === favTab)} />
      </>
    )
  } else body = list ? <Grid items={list.items} ranked={list.ranked} /> : <div className="empty"><div className="empty-title">List not found</div></div>

  return (
    <div className="scroll-area route-fade" ref={scrollRef}>
      <div className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button className="pressable" onClick={() => nav(-1)} aria-label="Back" style={{ color: 'var(--text-dim)' }}>
            <ChevronLeft size={26} />
          </button>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 22, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h1>
            {data?.profile && <div className="sub">{nameOf(data.profile)}</div>}
          </div>
        </div>
      </div>
      {body}
      <div style={{ height: 24 }} />
    </div>
  )
}
