import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, HeartIcon, ClapperboardIcon, TvIcon, ListIcon, OrderedListIcon } from '../components/Icons'
import {
  getProfileById,
  getProfileStats,
  getRelationship,
  getShowcase,
  type FollowStatus,
  type ProfileStats,
  type Showcase,
  type SocialProfile,
} from '../data/social'
import { useSync } from '../logic/sync'
import { compositionLabel } from '../logic/stats'
import { formatDuration as hm } from '../utils/duration'
import { FollowButton, UserAvatar, nameOf } from '../ui/social'

function Header({ title }: { title: string }) {
  const nav = useNavigate()
  return (
    <div className="app-header" style={{ paddingBottom: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="pressable" onClick={() => nav(-1)} aria-label="Back" style={{ color: 'var(--text-dim)' }}>
          <ChevronLeft size={26} />
        </button>
        <h1 style={{ fontSize: 22 }}>{title}</h1>
      </div>
    </div>
  )
}

/**
 * Another member's profile, read live from Supabase. Identity is public; stats,
 * favorites and public lists appear only when the server allows it (public
 * account, an accepted follow, or yourself).
 */
export function PublicProfileScreen() {
  const nav = useNavigate()
  const { id = '' } = useParams()
  const me = useSync((s) => s.userId)
  const signedIn = useSync((s) => s.status === 'signedIn')
  const [profile, setProfile] = useState<SocialProfile | null | undefined>(undefined)
  const [stats, setStats] = useState<ProfileStats | null>(null)
  const [showcase, setShowcase] = useState<Showcase | null>(null)
  const [rel, setRel] = useState<{ outgoing: FollowStatus; followsMe: boolean } | undefined>()
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!signedIn) return
    let alive = true
    void (async () => {
      const [p, s, sc, r] = await Promise.all([getProfileById(id), getProfileStats(id), getShowcase(id), getRelationship(id)])
      if (!alive) return
      setProfile(p)
      setStats(s)
      setShowcase(sc)
      setRel(r)
    })()
    return () => {
      alive = false
    }
  }, [id, signedIn, reload])

  if (me && id === me) return <Navigate to="/profile" replace />

  if (!signedIn)
    return (
      <div className="scroll-area route-fade">
        <Header title="Profile" />
        <div className="empty">
          <div className="empty-title">Sign in to see profiles</div>
          <div className="empty-sub">Profiles are visible to Watcher members.</div>
        </div>
      </div>
    )

  if (profile === undefined)
    return (
      <div className="scroll-area route-fade">
        <Header title="Profile" />
        <div className="empty">
          <div className="empty-sub">Loading…</div>
        </div>
      </div>
    )

  if (!profile || !profile.username)
    return (
      <div className="scroll-area route-fade">
        <Header title="Profile" />
        <div className="empty">
          <div className="empty-title">User not found</div>
        </div>
      </div>
    )

  const locked = profile.visibility === 'private' && rel?.outgoing !== 'accepted'
  const tvMin = stats?.tv_minutes ?? 0
  const movieMin = stats?.movie_minutes ?? 0
  const total = stats ? hm(stats.minutes_watched) : null
  const favs = showcase?.favorites ?? []
  const favShows = favs.filter((f) => f.type === 'show').length
  const favMovies = favs.length - favShows

  return (
    <div className="scroll-area route-fade">
      <Header title="Profile" />

      <div className="profile-head2">
        <UserAvatar profile={profile} size={64} className="profile-avatar" />
        <div className="profile-head-text">
          <div className="profile-name">{nameOf(profile)}</div>
          <div className="profile-at">
            @{profile.username}
            {rel?.followsMe && <span className="lock-chip">Follows you</span>}
          </div>
          {total && <div className="profile-handle">{total} watched</div>}
          <div className="profile-social-row">
            <button className="profile-social-stat pressable" disabled={locked} onClick={() => nav(`/people/${profile.id}/followers`)}>
              <b>{profile.follower_count}</b> followers
            </button>
            <button className="profile-social-stat pressable" disabled={locked} onClick={() => nav(`/people/${profile.id}/following`)}>
              <b>{profile.following_count}</b> following
            </button>
          </div>
        </div>
      </div>

      {profile.bio && <div className="profile-bio">{profile.bio}</div>}

      <div className="page-pad" style={{ paddingBottom: 12 }}>
        {rel && <FollowButton target={profile} initial={rel.outgoing} onChange={() => setReload((n) => n + 1)} />}
      </div>

      {locked ? (
        <div className="private-card">
          <div className="private-card-title">This account is private</div>
          <div className="private-card-sub">
            {rel?.outgoing === 'pending'
              ? 'Your follow request is waiting for approval.'
              : 'Follow this account to see their stats, favorites and lists.'}
          </div>
        </div>
      ) : (
        <>
          {stats && (
            <>
              <div className="dash-card">
                <div className="dash-card-head">
                  <span className="dash-icon tv">
                    <TvIcon size={18} />
                  </span>
                  TV Shows
                </div>
                <div className="dash-metrics">
                  {stats.shows_followed !== undefined && (
                    <div className="dash-metric">
                      <b>{stats.shows_followed.toLocaleString()}</b>
                      <span>followed</span>
                    </div>
                  )}
                  <div className="dash-metric">
                    <b>{stats.shows_watched.toLocaleString()}</b>
                    <span>watched</span>
                  </div>
                  <div className="dash-metric">
                    <b>{stats.shows_finished.toLocaleString()}</b>
                    <span>finished</span>
                  </div>
                  <div className="dash-metric">
                    <b>{stats.episodes_watched.toLocaleString()}</b>
                    <span>episodes</span>
                  </div>
                  {stats.tv_minutes !== undefined && (
                    <div className="dash-metric">
                      <b>{hm(tvMin)}</b>
                      <span>time watched</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="dash-card">
                <div className="dash-card-head">
                  <span className="dash-icon movie">
                    <ClapperboardIcon size={18} />
                  </span>
                  Movies
                </div>
                <div className="dash-metrics">
                  {stats.movies_followed !== undefined && (
                    <div className="dash-metric">
                      <b>{stats.movies_followed.toLocaleString()}</b>
                      <span>followed</span>
                    </div>
                  )}
                  <div className="dash-metric">
                    <b>{stats.movies_watched.toLocaleString()}</b>
                    <span>watched</span>
                  </div>
                  {stats.movie_minutes !== undefined && (
                    <div className="dash-metric">
                      <b>{hm(movieMin)}</b>
                      <span>time watched</span>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          <div className="section-header" style={{ marginTop: 18 }}>
            <div className="section-header-title">Lists</div>
          </div>

          {favs.length > 0 && (
            <button className="list-row pressable" onClick={() => nav(`/u/${profile.id}/favorites`)}>
              <span className="fav-badge">
                <HeartIcon size={14} fill="#fff" strokeWidth={0} />
              </span>
              <span className="list-row-text">
                <span className="list-row-name">Favorites</span>
                <span className="list-row-sub">{compositionLabel(favMovies, favShows)}</span>
              </span>
              <ChevronRight size={20} />
            </button>
          )}

          {(showcase?.lists ?? []).map((l) => {
            const shows = l.items.filter((i) => i.type === 'show').length
            return (
              <button key={l.id} className="list-row pressable" onClick={() => nav(`/u/${profile.id}/list/${l.id}`)}>
                <span className={`list-badge ${l.ranked ? 'ranked' : ''}`}>
                  {l.ranked ? <OrderedListIcon size={16} /> : <ListIcon size={16} />}
                </span>
                <span className="list-row-text">
                  <span className="list-row-name">{l.name}</span>
                  <span className="list-row-sub">
                    {compositionLabel(l.items.length - shows, shows)}
                    {l.ranked ? ' · Ranked' : ''}
                  </span>
                </span>
                <ChevronRight size={20} />
              </button>
            )
          })}

          {favs.length === 0 && (showcase?.lists ?? []).length === 0 && (
            <div className="empty" style={{ paddingTop: 8 }}>
              <div className="empty-sub">No favorites or public lists yet.</div>
            </div>
          )}
        </>
      )}

      <div style={{ height: 28 }} />
    </div>
  )
}
