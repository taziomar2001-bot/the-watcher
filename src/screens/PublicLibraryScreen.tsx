import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { SmartImage } from '../components/ui'
import { Segmented } from '../ui/primitives'
import { ChevronLeft } from '../components/Icons'
import { getUser, type PublicRef } from '../data/users'
import { useScrollMemory } from '../hooks/useScrollMemory'

type Kind = 'tv' | 'movies' | 'favorites' | 'list'

/** Read-only poster grid (data-URI posters). No status dots or edit controls. */
function ReadOnlyGrid({ items, ranked }: { items: PublicRef[]; ranked?: boolean }) {
  if (items.length === 0)
    return (
      <div className="empty">
        <div className="empty-title">Nothing here</div>
      </div>
    )
  return (
    <div className="poster-grid">
      {items.map((it, i) => (
        <div key={it.id} className="poster-thumb" style={{ width: 'auto' }}>
          <div className="poster-thumb-art">
            <SmartImage src={it.poster} alt={it.title} />
            {ranked && <span className="rank-badge">{i + 1}</span>}
          </div>
          <div className="poster-thumb-title">{it.title}</div>
        </div>
      ))}
    </div>
  )
}

/**
 * A single read-only browsing screen for another user's TV library, movie
 * library, favorites, or a specific list — same grid language as the owner's
 * screens, with per-screen scroll memory.
 */
export function PublicLibraryScreen({ kind }: { kind: Kind }) {
  const nav = useNavigate()
  const { id = '', listId = '' } = useParams()
  const user = getUser(id)
  const scrollRef = useScrollMemory<HTMLDivElement>(`pub-${id}-${kind}-${listId}`)
  const [favTab, setFavTab] = useState<'show' | 'movie'>('show')

  if (!user)
    return (
      <div className="scroll-area route-fade">
        <div className="app-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="pressable" onClick={() => nav(-1)} aria-label="Back" style={{ color: 'var(--text-dim)' }}>
              <ChevronLeft size={26} />
            </button>
            <h1 style={{ fontSize: 22 }}>Library</h1>
          </div>
        </div>
        <div className="empty">
          <div className="empty-title">User not found</div>
        </div>
      </div>
    )

  const list = kind === 'list' ? user.lists.find((l) => l.id === listId) : undefined
  const title =
    kind === 'tv' ? 'TV Shows' : kind === 'movies' ? 'Movies' : kind === 'favorites' ? 'Favorites' : list?.name ?? 'List'

  let body: React.ReactNode
  if (kind === 'tv') body = <ReadOnlyGrid items={user.shows} />
  else if (kind === 'movies') body = <ReadOnlyGrid items={user.movies} />
  else if (kind === 'favorites')
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
        <ReadOnlyGrid items={favTab === 'show' ? user.favoriteShows : user.favoriteMovies} />
      </>
    )
  else body = <ReadOnlyGrid items={list?.items ?? []} ranked={list?.ranked} />

  return (
    <div className="scroll-area route-fade" ref={scrollRef}>
      <div className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button className="pressable" onClick={() => nav(-1)} aria-label="Back" style={{ color: 'var(--text-dim)' }}>
            <ChevronLeft size={26} />
          </button>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 22, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h1>
            <div className="sub">{user.name}</div>
          </div>
        </div>
      </div>
      {body}
      <div style={{ height: 24 }} />
    </div>
  )
}
