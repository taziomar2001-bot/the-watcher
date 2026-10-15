import { KINDS_ON } from '../logic/content'
import { KIND, KindIcon } from '../ui/kinds'
import type { ContentKind } from '../types'
import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { SnapshotList, type SnapRow } from '../ui/SnapshotList'
import { Segmented } from '../ui/primitives'
import { ChevronLeft } from '../components/Icons'
import { getProfileById, getShowcase, type Showcase, type ShowcaseItem, type SocialProfile } from '../data/social'
import { useScrollMemory } from '../hooks/useScrollMemory'
import { nameOf } from '../ui/social'

type Kind = 'tv' | 'movies' | 'favorites' | 'list'

const rowOf = (it: ShowcaseItem): SnapRow => ({ ref: it.ref ?? `${it.type}:${it.id}`, title: it.title, sub: it.sub, poster: it.poster })
function Grid({ items, ranked, episodes }: { items: ShowcaseItem[]; ranked?: boolean; episodes?: boolean }) {
  return <SnapshotList items={items.map(rowOf)} ranked={ranked} episodes={episodes} />
}

/** Another member's favorites or one of their public lists (from their showcase). */
export function PublicLibraryScreen({ kind }: { kind: Kind }) {
  const nav = useNavigate()
  const { id = '', listId = '' } = useParams()
  const scrollRef = useScrollMemory<HTMLDivElement>(`pub-${id}-${kind}-${listId}`)
  const [favTab, setFavTab] = useState<ContentKind>('show')
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
      <div className="poster-grid" aria-busy="true">
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="poster-thumb" style={{ width: 'auto' }}>
            <div className="poster-thumb-art skeleton" />
          </div>
        ))}
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
            options={KINDS_ON.map((k) =>
              KINDS_ON.length > 2 ? { key: k, label: <span className="seg-icon"><KindIcon kind={k} size={21} /></span>, aria: KIND[k].label } : { key: k, label: KIND[k].label },
            )}
            value={favTab}
            onChange={setFavTab}
          />
        </div>
        <Grid items={favs.filter((f) => f.type === favTab)} />
      </>
    )
  } else body = list ? <Grid items={list.items} ranked={list.ranked} episodes={list.kind === 'episodes'} /> : <div className="empty"><div className="empty-title">List not found</div></div>

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
