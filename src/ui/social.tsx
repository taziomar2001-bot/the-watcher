import { useEffect, useState } from 'react'
import { followUser, getRelationship, unfollowUser, type FollowStatus, type SocialProfile } from '../data/social'
import { useSync } from '../logic/sync'
import { useToast } from '../store/useToast'

// Stable accent per user so initials avatars stay the same everywhere.
const ACCENTS = ['#64d2ff', '#46d369', '#ff9838', '#b98cff', '#ff5964', '#4aa8ff', '#f2c744', '#5ce0c6']
export function accentFor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return ACCENTS[Math.abs(h) % ACCENTS.length]
}

export const nameOf = (p: Pick<SocialProfile, 'display_name' | 'username'>) => p.display_name || p.username || 'Watcher'

export function UserAvatar({ profile, size = 42, className = 'user-avatar' }: { profile: Pick<SocialProfile, 'id' | 'avatar' | 'display_name' | 'username'>; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.4), background: accentFor(profile.id), overflow: 'hidden' as const }
  return (
    <span className={className} style={style}>
      {profile.avatar ? <img src={profile.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : nameOf(profile)[0].toUpperCase()}
    </span>
  )
}

/**
 * Follow / Request / Requested / Following. Status is decided server-side
 * (public → accepted, private → pending); this button just reflects it.
 */
export function FollowButton({
  target,
  initial,
  onChange,
  compact,
}: {
  target: Pick<SocialProfile, 'id' | 'visibility' | 'username'>
  initial?: FollowStatus
  onChange?: (s: FollowStatus) => void
  compact?: boolean
}) {
  const me = useSync((s) => s.userId)
  const toast = useToast((s) => s.show)
  const [status, setStatus] = useState<FollowStatus | undefined>(initial)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (initial !== undefined) {
      setStatus(initial)
      return
    }
    let alive = true
    if (me && me !== target.id) getRelationship(target.id).then((r) => alive && setStatus(r.outgoing))
    return () => {
      alive = false
    }
  }, [target.id, me, initial])

  if (!me || me === target.id || status === undefined) return null

  const set = (s: FollowStatus) => {
    setStatus(s)
    onChange?.(s)
  }
  const click = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    if (status === 'none') {
      const ok = await followUser(target.id)
      if (ok) set(target.visibility === 'private' ? 'pending' : 'accepted')
      else toast("Couldn't follow right now")
    } else {
      const ok = await unfollowUser(target.id)
      if (ok) set('none')
      else toast("Couldn't update right now")
    }
    setBusy(false)
  }

  const label =
    status === 'accepted' ? 'Following' : status === 'pending' ? 'Requested' : target.visibility === 'private' ? 'Request' : 'Follow'
  return (
    <button
      className={`follow-btn pressable ${status === 'none' ? 'primary' : ''} ${compact ? 'compact' : ''}`}
      disabled={busy}
      onClick={click}
    >
      {label}
    </button>
  )
}

export function UserRow({ profile, onOpen, right }: { profile: SocialProfile; onOpen: () => void; right?: React.ReactNode }) {
  return (
    <div className="user-row pressable" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <UserAvatar profile={profile} />
      <span className="user-info">
        <span className="user-name">
          {nameOf(profile)}
          {profile.visibility === 'private' && <span className="lock-chip">Private</span>}
        </span>
        <span className="user-handle">@{profile.username}</span>
      </span>
      {right ?? <FollowButton target={profile} compact />}
    </div>
  )
}
