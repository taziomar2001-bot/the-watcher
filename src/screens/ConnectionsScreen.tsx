import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft } from '../components/Icons'
import { Segmented } from '../ui/primitives'
import { UserRow } from '../ui/social'
import { acceptFollower, listFollowConnections, listPendingRequests, removeFollower, type SocialProfile } from '../data/social'
import { useSync } from '../logic/sync'
import { useToast } from '../store/useToast'

type Tab = 'followers' | 'following' | 'requests'

/** Followers / Following for any visible profile, plus Requests on your own. */
export function ConnectionsScreen() {
  const nav = useNavigate()
  const { id: rawId = 'me', tab: rawTab = 'followers' } = useParams()
  const me = useSync((s) => s.userId)
  const toast = useToast((s) => s.show)
  const id = rawId === 'me' ? me : rawId
  const isMe = !!me && id === me
  const tab: Tab = rawTab === 'following' ? 'following' : rawTab === 'requests' && isMe ? 'requests' : 'followers'
  const [people, setPeople] = useState<SocialProfile[] | undefined>()
  const [requestCount, setRequestCount] = useState(0)

  useEffect(() => {
    if (!id) return
    let alive = true
    setPeople(undefined)
    const load = tab === 'requests' ? listPendingRequests() : listFollowConnections(id, tab)
    load.then((p) => alive && setPeople(p.filter((x) => x.username)))
    if (isMe) listPendingRequests().then((r) => alive && setRequestCount(r.length))
    return () => {
      alive = false
    }
  }, [id, tab, isMe])

  const go = (t: Tab) => nav(`/people/${rawId}/${t}`, { replace: true })
  const open = (p: SocialProfile) => nav(p.id === me ? '/profile' : `/u/${p.id}`)

  const respond = async (p: SocialProfile, accept: boolean) => {
    const ok = accept ? await acceptFollower(p.id) : await removeFollower(p.id)
    if (!ok) return toast("Couldn't update right now")
    setPeople((list) => list?.filter((x) => x.id !== p.id))
    setRequestCount((n) => Math.max(0, n - 1))
    toast(accept ? `${p.username} can now see your profile` : 'Request declined')
  }

  const options: { key: Tab; label: string }[] = [
    { key: 'followers', label: 'Followers' },
    { key: 'following', label: 'Following' },
  ]
  if (isMe) options.push({ key: 'requests', label: requestCount ? `Requests (${requestCount})` : 'Requests' })

  return (
    <div className="scroll-area route-fade">
      <div className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="pressable" onClick={() => nav(-1)} aria-label="Back" style={{ color: 'var(--text-dim)' }}>
            <ChevronLeft size={26} />
          </button>
          <h1 style={{ fontSize: 22 }}>People</h1>
        </div>
      </div>
      <div className="page-pad" style={{ paddingBottom: 12 }}>
        <Segmented options={options} value={tab} onChange={go} />
      </div>

      <div className="page-pad">
        {people === undefined ? (
          <div className="empty">
            <div className="empty-sub">Loading…</div>
          </div>
        ) : people.length === 0 ? (
          <div className="empty">
            <div className="empty-sub">
              {tab === 'requests' ? 'No pending requests.' : tab === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}
            </div>
          </div>
        ) : (
          people.map((p) => (
            <UserRow
              key={p.id}
              profile={p}
              onOpen={() => open(p)}
              right={
                tab === 'requests' ? (
                  <span style={{ display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                    <button className="follow-btn primary compact pressable" onClick={() => void respond(p, true)}>
                      Accept
                    </button>
                    <button className="follow-btn compact pressable" onClick={() => void respond(p, false)}>
                      Decline
                    </button>
                  </span>
                ) : undefined
              }
            />
          ))
        )}
      </div>
      <div style={{ height: 24 }} />
    </div>
  )
}
