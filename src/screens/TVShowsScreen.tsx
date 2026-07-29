import { useNavigate } from 'react-router-dom'
import { CategoryCard } from '../ui/cards'
import { useShowEntries } from '../logic/useLibraryData'
import { categorize } from '../logic/status'

export function TVShowsScreen() {
  const nav = useNavigate()
  const entries = useShowEntries()
  const { currentlyWatching, upToDate, notWatchedRecently, following, finished, stopped } = categorize(entries, Date.now())

  const cats = [
    { key: 'watching', title: 'Currently Watching', list: currentlyWatching },
    { key: 'uptodate', title: 'Up to Date', list: upToDate },
    { key: 'stale', title: 'Not Watched Recently', list: notWatchedRecently },
    { key: 'following', title: "Haven't Started Yet", list: following },
    { key: 'finished', title: 'Finished', list: finished },
    { key: 'stopped', title: 'Stopped Watching', list: stopped },
  ]

  return (
    <div className="scroll-area route-fade">
      <div className="app-header">
        <div>
          <h1>TV Shows</h1>
          <div className="sub">{entries.length} in your library</div>
        </div>
      </div>

      <div className="card-list" style={{ gap: 12, marginTop: 6 }}>
        {cats.map((c) => (
          <CategoryCard
            key={c.key}
            title={c.title}
            count={c.list.length}
            posters={c.list.slice(0, 3).map((e) => e.item.poster)}
            onClick={() => nav(`/tv/category/${c.key}`)}
          />
        ))}
      </div>

      {entries.length === 0 && (
        <div className="empty">
          <div className="empty-title">No shows yet</div>
          <div className="empty-sub">Follow shows from Discover to start tracking</div>
        </div>
      )}
    </div>
  )
}
