import { useNavigate } from 'react-router-dom'
import { SmartImage } from '../components/ui'
import { refLink } from '../logic/lists'

export interface SnapRow {
  ref: string
  title: string
  sub?: string
  poster?: string
}

/** Read-only list: poster grid, or rows with stills for episode lists. */
export function SnapshotList({ items, ranked, episodes }: { items: SnapRow[]; ranked?: boolean; episodes?: boolean }) {
  const nav = useNavigate()
  if (items.length === 0)
    return (
      <div className="empty">
        <div className="empty-title">Nothing here yet</div>
      </div>
    )
  if (episodes)
    return (
      <div className="page-pad ep-list">
        {items.map((it, i) => (
          <button key={it.ref} className="ep-list-row pressable" onClick={() => nav(refLink(it.ref))}>
            {ranked && <span className="ep-rank">{i + 1}</span>}
            <span className="ep-list-still">
              <SmartImage src={it.poster} alt="" />
            </span>
            <span className="ep-list-text">
              <span className="ep-list-title">{it.title}</span>
              {it.sub && <span className="ep-list-sub">{it.sub}</span>}
            </span>
          </button>
        ))}
      </div>
    )
  return (
    <div className="poster-grid">
      {items.map((it, i) => (
        <button key={it.ref} className="poster-thumb pressable" style={{ width: 'auto', textAlign: 'left' }} onClick={() => nav(refLink(it.ref))}>
          <div className="poster-thumb-art">
            <SmartImage src={it.poster} alt={it.title} />
            {ranked && <span className="rank-badge">{i + 1}</span>}
          </div>
          <div className="poster-thumb-title">{it.title}</div>
          {it.sub && it.ref.startsWith('season:') && <div className="poster-thumb-sub">{it.sub}</div>}
        </button>
      ))}
    </div>
  )
}
