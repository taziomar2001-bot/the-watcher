import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, HeartIcon, ClapperboardIcon, TvIcon, ListIcon, OrderedListIcon } from '../components/Icons'
import { getUser, totalMinutes } from '../data/users'
import { compositionLabel, countRefs } from '../logic/stats'
import { formatDuration as hm } from '../utils/duration'

/**
 * Read-only public profile for another user. Mirrors the owner's Profile tab
 * (identity, TV/Movies dashboards, Lists) using the same cards and navigation,
 * but exposes no editing controls (no settings gear, no "new list", no add/remove).
 */
export function PublicProfileScreen() {
  const nav = useNavigate()
  const { id = '' } = useParams()
  const user = getUser(id)

  if (!user)
    return (
      <div className="scroll-area route-fade">
        <div className="app-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="pressable" onClick={() => nav(-1)} aria-label="Back" style={{ color: 'var(--text-dim)' }}>
              <ChevronLeft size={26} />
            </button>
            <h1 style={{ fontSize: 24 }}>Profile</h1>
          </div>
        </div>
        <div className="empty">
          <div className="empty-title">User not found</div>
        </div>
      </div>
    )

  const s = user.stats
  const total = hm(totalMinutes(user))
  const favShows = user.favoriteShows.length
  const favMovies = user.favoriteMovies.length

  return (
    <div className="scroll-area route-fade">
      <div className="app-header" style={{ paddingBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="pressable" onClick={() => nav(-1)} aria-label="Back" style={{ color: 'var(--text-dim)' }}>
            <ChevronLeft size={26} />
          </button>
          <h1 style={{ fontSize: 22 }}>Profile</h1>
        </div>
      </div>

      {/* Identity */}
      <div className="profile-head2">
        <div className="profile-avatar" style={{ background: user.accent, color: '#0a0f14' }}>
          {user.name[0].toUpperCase()}
        </div>
        <div className="profile-head-text">
          <div className="profile-name">{user.name}</div>
          <div className="profile-handle">@{user.handle} · {total} watched</div>
        </div>
      </div>

      {user.bio && <div className="profile-bio">{user.bio}</div>}

      {/* Dashboards (read-only, open their libraries) */}
      <button className="dash-card pressable" onClick={() => nav(`/u/${user.id}/tv`)}>
        <div className="dash-card-head">
          <span className="dash-icon tv">
            <TvIcon size={18} />
          </span>
          TV Shows
          <ChevronRight size={20} className="dash-chevron" />
        </div>
        <div className="dash-metrics">
          <div className="dash-metric">
            <b>{s.showsFollowed.toLocaleString()}</b>
            <span>followed</span>
          </div>
          <div className="dash-metric">
            <b>{s.showsWatched.toLocaleString()}</b>
            <span>watched</span>
          </div>
          <div className="dash-metric">
            <b>{s.showsCompleted.toLocaleString()}</b>
            <span>finished</span>
          </div>
          <div className="dash-metric">
            <b>{hm(s.tvMin)}</b>
            <span>time watched</span>
          </div>
        </div>
      </button>

      <button className="dash-card pressable" onClick={() => nav(`/u/${user.id}/movies`)}>
        <div className="dash-card-head">
          <span className="dash-icon movie">
            <ClapperboardIcon size={18} />
          </span>
          Movies
          <ChevronRight size={20} className="dash-chevron" />
        </div>
        <div className="dash-metrics">
          <div className="dash-metric">
            <b>{s.moviesFollowed.toLocaleString()}</b>
            <span>followed</span>
          </div>
          <div className="dash-metric">
            <b>{s.moviesWatched.toLocaleString()}</b>
            <span>watched</span>
          </div>
          <div className="dash-metric">
            <b>{hm(s.movieMin)}</b>
            <span>time watched</span>
          </div>
        </div>
      </button>

      {/* Lists */}
      <div className="section-header" style={{ marginTop: 18 }}>
        <div className="section-header-title">Lists</div>
      </div>

      <button className="list-row pressable" onClick={() => nav(`/u/${user.id}/favorites`)}>
        <span className="fav-badge">
          <HeartIcon size={14} fill="#fff" strokeWidth={0} />
        </span>
        <span className="list-row-text">
          <span className="list-row-name">Favorites</span>
          <span className="list-row-sub">{compositionLabel(favMovies, favShows)}</span>
        </span>
        <ChevronRight size={20} />
      </button>

      {user.lists.map((l) => {
        const c = countRefs(l.items.map((r) => `${r.type}:${r.id}`))
        return (
          <button key={l.id} className="list-row pressable" onClick={() => nav(`/u/${user.id}/list/${l.id}`)}>
            <span className={`list-badge ${l.ranked ? 'ranked' : ''}`}>
              {l.ranked ? <OrderedListIcon size={16} /> : <ListIcon size={16} />}
            </span>
            <span className="list-row-text">
              <span className="list-row-name">{l.name}</span>
              <span className="list-row-sub">
                {compositionLabel(c.movies, c.shows)}
                {l.ranked ? ' · Ranked' : ''}
              </span>
            </span>
            <ChevronRight size={20} />
          </button>
        )
      })}

      <div style={{ height: 28 }} />
    </div>
  )
}
