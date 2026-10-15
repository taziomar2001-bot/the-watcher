import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, FilterIcon, CheckIcon, TrophyIcon } from '../components/Icons'
import { Segmented } from '../ui/primitives'
import { UserAvatar, nameOf } from '../ui/social'
import { getLeaderboard, type LeaderMetric, type LeaderRow, type ProfileStats } from '../data/social'
import { useSync } from '../logic/sync'
import { useMyStats } from '../logic/stats'
import { formatDuration as hm } from '../utils/duration'
import { RowsSkeleton } from '../ui/Skeletons'

const METRICS: { key: LeaderMetric; label: string; value: (s: ProfileStats) => number; format: (n: number) => string }[] = [
  { key: 'minutes_watched', label: 'Total time watched', value: (s) => s.minutes_watched, format: hm },
  { key: 'movies_watched', label: 'Movies watched', value: (s) => s.movies_watched, format: (n) => n.toLocaleString() },
  { key: 'shows_watched', label: 'TV shows watched', value: (s) => s.shows_watched, format: (n) => n.toLocaleString() },
  { key: 'episodes_watched', label: 'Episodes watched', value: (s) => s.episodes_watched, format: (n) => n.toLocaleString() },
]

// Survives navigating into a profile and back.
const mem = { metric: 'minutes_watched' as LeaderMetric, scope: 'everyone' as 'everyone' | 'following' }

/**
 * Real leaderboard: only accounts that exist, with a username, whose stats the
 * viewer is allowed to see (public, followed, or yourself). No sample users.
 */
export function LeaderboardScreen() {
  const nav = useNavigate()
  const signedIn = useSync((s) => s.status === 'signedIn')
  const me = useSync((s) => s.userId)
  const local = useMyStats()
  const [metric, setMetricState] = useState<LeaderMetric>(mem.metric)
  const [scope, setScopeState] = useState(mem.scope)
  const [filterOpen, setFilterOpen] = useState(false)
  const [rows, setRows] = useState<LeaderRow[] | null | undefined>(undefined)
  const setMetric = (m: LeaderMetric) => ((mem.metric = m), setMetricState(m))
  const setScope = (s: 'everyone' | 'following') => ((mem.scope = s), setScopeState(s))

  useEffect(() => {
    if (!signedIn) return
    let alive = true
    setRows(undefined)
    getLeaderboard(metric, scope).then((r) => alive && setRows(r))
    return () => {
      alive = false
    }
  }, [metric, scope, signedIn])

  const active = METRICS.find((m) => m.key === metric)!
  // Your own row uses this device's numbers, which are always the freshest.
  const ranked = (rows ?? [])
    .map((r) =>
      r.profile.id === me
        ? {
            ...r,
            stats: {
              ...r.stats,
              minutes_watched: local.totalMin,
              movies_watched: local.moviesWatched,
              shows_watched: local.showsStarted,
              episodes_watched: local.episodesWatched,
            },
          }
        : r,
    )
    .sort((a, b) => active.value(b.stats) - active.value(a.stats))
  const myRank = ranked.findIndex((r) => r.profile.id === me) + 1

  return (
    <div className="scroll-area route-fade">
      <div className="app-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button className="pressable" onClick={() => nav(-1)} aria-label="Back" style={{ color: 'var(--text-dim)' }}>
            <ChevronLeft size={26} />
          </button>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 22 }}>Leaderboard</h1>
            <div className="sub">Ranked by {active.label.toLowerCase()}</div>
          </div>
        </div>
        {signedIn && (
          <button className="icon-round pressable" onClick={() => setFilterOpen(true)} aria-label="Rank by">
            <FilterIcon size={20} />
          </button>
        )}
      </div>

      {!signedIn ? (
        <div className="empty">
          <div className="empty-title">Sign in to see the leaderboard</div>
          <div className="empty-sub">It ranks real Watcher accounts — create one in Settings to join.</div>
        </div>
      ) : (
        <>
          <div className="page-pad" style={{ paddingBottom: 10 }}>
            <Segmented
              options={[
                { key: 'everyone', label: 'Everyone' },
                { key: 'following', label: 'Following' },
              ]}
              value={scope}
              onChange={setScope}
            />
          </div>

          {myRank > 0 && ranked.length > 1 && (
            <div className="page-pad" style={{ paddingBottom: 8 }}>
              <div className="lb-you-card">
                <TrophyIcon size={18} />
                <span>
                  You’re <b>#{myRank}</b> of {ranked.length} by {active.label.toLowerCase()}
                </span>
              </div>
            </div>
          )}

          {rows === undefined ? (
            <div className="page-pad">
              <RowsSkeleton n={8} h={62} />
            </div>
          ) : rows === null ? (
            <div className="empty">
              <div className="empty-title">Couldn’t load the leaderboard</div>
              <div className="empty-sub">Check your connection and try again.</div>
            </div>
          ) : ranked.length <= 1 ? (
            <>
              {ranked.length === 1 && <LbList rows={ranked} me={me} active={active} onOpen={(id) => nav(id === me ? '/profile' : `/u/${id}`)} />}
              <div className="empty">
                <div className="empty-title">{scope === 'following' ? 'Follow people to compare' : 'It’s just you so far'}</div>
                <div className="empty-sub">
                  {scope === 'following'
                    ? 'Find friends from the search bar in Discover.'
                    : 'As more people join The Watcher, they’ll show up here.'}
                </div>
              </div>
            </>
          ) : (
            <LbList rows={ranked} me={me} active={active} onOpen={(id) => nav(id === me ? '/profile' : `/u/${id}`)} />
          )}
        </>
      )}
      <div style={{ height: 24 }} />

      {filterOpen &&
        createPortal(
          <div className="sheet-backdrop" onClick={() => setFilterOpen(false)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-handle" />
              <div className="sheet-title">Rank by</div>
              {METRICS.map((m) => (
                <button
                  key={m.key}
                  className={`sheet-row ${m.key === metric ? 'active' : ''}`}
                  onClick={() => {
                    setMetric(m.key)
                    setFilterOpen(false)
                  }}
                >
                  <span>{m.label}</span>
                  {m.key === metric && <CheckIcon size={18} />}
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

function LbList({
  rows,
  me,
  active,
  onOpen,
}: {
  rows: LeaderRow[]
  me?: string
  active: (typeof METRICS)[number]
  onOpen: (id: string) => void
}) {
  return (
    <div className="lb-list">
      {rows.map((r, i) => {
        const isMe = r.profile.id === me
        return (
          <button key={r.profile.id} className={`lb-row pressable ${isMe ? 'me' : ''}`} onClick={() => onOpen(r.profile.id)}>
            <span className={`lb-rank ${i < 3 ? 'top top-' + (i + 1) : ''}`}>{i + 1}</span>
            <UserAvatar profile={r.profile} className="lb-avatar" />
            <span className="lb-id">
              <span className="lb-name">
                {nameOf(r.profile)}
                {isMe ? ' (You)' : ''}
              </span>
              <span className="lb-handle">@{r.profile.username}</span>
            </span>
            <span className="lb-metric">{active.format(active.value(r.stats))}</span>
          </button>
        )
      })}
    </div>
  )
}
