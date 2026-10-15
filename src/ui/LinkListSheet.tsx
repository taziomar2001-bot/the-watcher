import { useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckIcon } from '../components/Icons'
import { CommunityAvatar } from '../screens/CommunitiesScreen'
import { useLibrary, type CustomList } from '../store/useLibrary'
import { useToast } from '../store/useToast'
import { useMyCommunities } from '../logic/communityCache'
import { forgetPushed, pushListTo } from '../logic/communityLists'
import { unlinkList } from '../data/communities'

/**
 * Show a list in communities. Owners/admins can link any list (it appears as
 * "Official"); members can link ranked lists.
 */
export function LinkListSheet({ list, onClose }: { list: CustomList; onClose: () => void }) {
  const toast = useToast((s) => s.show)
  const setListCommunities = useLibrary((s) => s.setListCommunities)
  const { list: mine, error } = useMyCommunities()
  const [busy, setBusy] = useState<string | null>(null)
  const linked = new Set(list.communities ?? [])
  const active = (mine ?? []).filter((c) => c.status === 'active')

  const toggle = async (cid: string, name: string) => {
    setBusy(cid)
    const cur = useLibrary.getState().lists.find((l) => l.id === list.id) ?? list
    const now = new Set(cur.communities ?? [])
    if (now.has(cid)) {
      const r = await unlinkList(cid, list.id)
      setBusy(null)
      if (!r.ok) return toast('Couldn’t unlink right now')
      now.delete(cid)
      forgetPushed(cid, list.id)
      setListCommunities(list.id, [...now])
      toast(`Removed from ${name}`)
    } else {
      const r = await pushListTo(cid, cur)
      setBusy(null)
      if (!r.ok)
        return toast(
          r.code === 'not_set_up'
            ? 'Run 009_titles_lists_comments.sql in Supabase first'
            : r.code === 'too_many_lists'
              ? 'You can link up to 20 lists to a community'
              : r.code === 'not_allowed'
                ? 'Members can link ranked lists only'
                : 'Couldn’t link right now',
        )
      now.add(cid)
      setListCommunities(list.id, [...now])
      toast(r.value ? `Shared in ${name} as an official list` : `Shared in ${name}`)
    }
  }

  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-title">Share in a community</div>
        <div className="vis-hint" style={{ marginBottom: 8 }}>
          Members see this list in the community’s Lists tab and it stays up to date as you edit it. {list.ranked ? '' : 'As a member you can share ranked lists; owners and admins can share any list.'}
        </div>
        {mine === undefined && !error ? (
          Array.from({ length: 3 }, (_, i) => <div key={i} className="skeleton" style={{ height: 52, borderRadius: 12, margin: '6px 0' }} />)
        ) : active.length === 0 ? (
          <div className="empty compact">
            <div className="empty-sub">{error ? 'Couldn’t load your communities.' : 'Join a community first.'}</div>
          </div>
        ) : (
          active.map((c) => {
            const mod = c.role !== 'member'
            const allowed = mod || !!list.ranked
            const on = linked.has(c.id)
            return (
              <button
                key={c.id}
                className="list-pick-row"
                disabled={(!allowed && !on) || busy !== null}
                onClick={() => void toggle(c.id, c.name)}
                style={!allowed && !on ? { opacity: 0.5 } : undefined}
              >
                <span className="list-pick-name">
                  <CommunityAvatar c={c} className="community-avatar xs" />
                  <span className="list-pick-text">
                    {c.name}
                    <span className="list-pick-kind">{mod ? 'Official list' : allowed ? 'Member list' : 'Ranked lists only'}</span>
                  </span>
                </span>
                {busy === c.id ? <span className="spinner sm" /> : on && <CheckIcon size={18} />}
              </button>
            )
          })
        )}
        <button className="sync-btn primary pressable" style={{ width: '100%', marginTop: 12, justifyContent: 'center' }} onClick={onClose}>
          Done
        </button>
      </div>
    </div>,
    document.body,
  )
}
