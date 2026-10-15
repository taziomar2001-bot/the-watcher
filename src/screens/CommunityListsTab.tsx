import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, DotsIcon, PlusIcon } from '../components/Icons'
import { ListBadge } from '../ui/ListBadge'
import { NewListSheet, type NewListDraft } from '../ui/NewListSheet'
import { SnapshotList } from '../ui/SnapshotList'
import { nameOf } from '../ui/social'
import { useSync } from '../logic/sync'
import { useLibrary, type ListKind, type RefMeta } from '../store/useLibrary'
import { useToast } from '../store/useToast'
import { useCached } from '../utils/cache'
import { getShow } from '../data/catalog'
import { listSummary, episodeRef, seasonRef, episodeCode } from '../logic/lists'
import { pushListTo } from '../logic/communityLists'
import {
  communityLists,
  getCommunityList,
  unlinkList,
  type Community,
  type CommunityList,
  type CommunityTitle,
  type Membership,
} from '../data/communities'

/** Kinds a community ranking can take, from what its titles are. */
function kindsFor(titles: CommunityTitle[]): ListKind[] {
  const shows = titles.some((t) => t.ref.startsWith('show:'))
  const movies = titles.some((t) => t.ref.startsWith('movie:'))
  const out: ListKind[] = []
  if (shows && movies) out.push('mixed')
  if (shows) out.push('shows', 'seasons', 'episodes')
  if (movies) out.push('movies')
  return out
}

/** Every item at the chosen level, from the community's titles. */
async function itemsFor(kind: ListKind, titles: CommunityTitle[]): Promise<{ items: string[]; meta: Record<string, RefMeta> }> {
  const items: string[] = []
  const meta: Record<string, RefMeta> = {}
  const add = (ref: string, m: RefMeta) => {
    if (items.length >= 500 || meta[ref]) return
    items.push(ref)
    meta[ref] = m
  }
  for (const t of titles) {
    const [type, id] = t.ref.split(':')
    const base: RefMeta = { t: t.title, p: t.poster ?? undefined, y: t.year ?? undefined }
    if (kind === 'mixed' || (kind === 'shows' && type === 'show') || (kind === 'movies' && type === 'movie')) add(t.ref, base)
    if ((kind === 'seasons' || kind === 'episodes') && type === 'show') {
      const show = await getShow(id)
      if (!show) continue
      for (const s of show.seasons.filter((x) => x.episodes.length > 0)) {
        if (kind === 'seasons') add(seasonRef(id, s.season), { t: s.name || `Season ${s.season}`, s: show.title, p: show.poster })
        else
          for (const e of s.episodes)
            add(episodeRef(id, s.season, e.number), { t: e.title || episodeCode(s.season, e.number), s: show.title, p: e.still ?? show.backdrop ?? show.poster })
      }
    }
  }
  return { items, meta }
}

export function CommunityLists({ c, me, titles }: { c: Community; me: Membership | null; titles: CommunityTitle[] }) {
  const nav = useNavigate()
  const toast = useToast((s) => s.show)
  const myId = useSync((s) => s.userId)
  const addList = useLibrary((s) => s.addList)
  const active = me?.status === 'active'
  const isMod = active && me!.role !== 'member'
  const q = useCached<CommunityList[] | { error: string }>(`cl:${c.id}`, async () => (await communityLists(c.id)) ?? { error: 'not_set_up' })
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const rows = Array.isArray(q.data) ? q.data : undefined
  const kinds = kindsFor(titles)

  const create = async (d: NewListDraft) => {
    setBusy(true)
    try {
      const { items, meta } = await itemsFor(d.kind, titles)
      const ranked = isMod ? d.ranked : true
      const id = addList({ name: d.name, kind: d.kind, ranked, visibility: 'public', items, meta, communities: [c.id] })
      const list = useLibrary.getState().lists.find((l) => l.id === id)!
      const r = await pushListTo(c.id, list)
      if (!r.ok) toast('Saved to your lists — it’ll appear here once you’re back online')
      setCreating(false)
      nav(`/list/${id}${ranked ? '?reorder=1' : ''}`)
    } catch {
      toast('Couldn’t load the episodes — check your connection')
    } finally {
      setBusy(false)
    }
  }

  const open = (l: CommunityList) => (l.owner_id === myId ? nav(`/list/${l.list_id}`) : nav(`/c/${c.id}/l/${l.owner_id}/${encodeURIComponent(l.list_id)}`))
  const official = (rows ?? []).filter((l) => l.official)
  const members = (rows ?? []).filter((l) => !l.official)

  const row = (l: CommunityList) => (
    <button key={`${l.owner_id}/${l.list_id}`} className="list-row pressable" onClick={() => open(l)}>
      <ListBadge cover={l.cover ?? undefined} ranked={l.ranked} />
      <span className="list-row-text">
        <span className="list-row-name">{l.name}</span>
        <span className="list-row-sub">
          {l.owner ? (l.owner_id === myId ? 'You' : nameOf(l.owner)) : 'Member'} · {listSummary({ items: l.items.map((i) => i.r) })}
          {l.ranked ? ' · Ranked' : ''}
        </span>
      </span>
      <ChevronRight size={20} />
    </button>
  )

  return (
    <div className="page-pad">
      {active && (
        <button className="cl-new pressable" onClick={() => (kinds.length ? setCreating(true) : toast(isMod ? 'Link a title to this community first' : 'This community isn’t linked to any titles yet'))}>
          <span className="cl-new-icon">
            <PlusIcon size={18} />
          </span>
          <span className="cl-new-text">
            <span className="cl-new-title">Rank this community’s titles</span>
            <span className="cl-new-sub">{kinds.length ? 'Start a ranked list with every show, season, episode or movie here' : 'Needs at least one linked title'}</span>
          </span>
        </button>
      )}
      {q.data === undefined ? (
        Array.from({ length: 3 }, (_, i) => <div key={i} className="skeleton" style={{ height: 64, borderRadius: 14, margin: '8px 0' }} />)
      ) : !rows ? (
        <div className="empty compact">
          <div className="empty-sub">Lists need the latest database update (009).</div>
        </div>
      ) : rows.length === 0 ? (
        <div className="empty compact">
          <div className="empty-title">No lists yet</div>
          <div className="empty-sub">Share a ranked list from its ••• menu, or start one above.</div>
        </div>
      ) : (
        <>
          {official.length > 0 && (
            <>
              <div className="members-label">Official</div>
              {official.map(row)}
            </>
          )}
          {members.length > 0 && (
            <>
              <div className="members-label">From members</div>
              {members.map(row)}
            </>
          )}
        </>
      )}
      {creating && (
        <NewListSheet
          title="New ranking"
          cta="Create & rank"
          initial={{ name: `My ${c.name} ranking`, ranked: true, kind: kinds.includes('episodes') ? 'episodes' : kinds[0] }}
          kinds={kinds}
          rankedLocked={!isMod}
          busy={busy}
          note={isMod ? 'As an owner/admin it’s shared as an official list.' : 'It’s saved to your lists and shared here; you can reorder it any time.'}
          onClose={() => setCreating(false)}
          onCreate={(d) => void create(d)}
        />
      )}
    </div>
  )
}

/** Another member's list as shared in a community (read-only snapshot). */
export function CommunityListScreen() {
  const nav = useNavigate()
  const toast = useToast((s) => s.show)
  const { id = '', owner = '', listId = '' } = useParams()
  const lid = decodeURIComponent(listId)
  const q = useCached<CommunityList | { missing: true }>(`cll:${id}:${owner}:${lid}`, async () => (await getCommunityList(id, owner, lid)) ?? { missing: true })
  const [menu, setMenu] = useState(false)
  const l = q.data && 'list_id' in q.data ? q.data : null
  return (
    <div className="scroll-area route-fade">
      <div className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button className="pressable" onClick={() => nav(-1)} aria-label="Back">
            <ChevronLeft size={26} />
          </button>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 22, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l?.name ?? 'List'}</h1>
            {l && (
              <div className="sub">
                {l.official ? 'Official · ' : ''}by {l.owner ? nameOf(l.owner) : 'a member'} · {listSummary({ items: l.items.map((i) => i.r) })}
              </div>
            )}
          </div>
        </div>
        {l && (
          <button className="icon-round pressable" onClick={() => setMenu(true)} aria-label="List options">
            <DotsIcon size={20} />
          </button>
        )}
      </div>
      {q.data === undefined ? (
        <div className="poster-grid">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="poster-thumb" style={{ width: 'auto' }}>
              <div className="poster-thumb-art skeleton" />
            </div>
          ))}
        </div>
      ) : !l ? (
        <div className="empty">
          <div className="empty-title">List not found</div>
          <div className="empty-sub">It may have been removed from the community.</div>
        </div>
      ) : (
        <>
          {l.owner && (
            <button className="page-pad cl-owner pressable" onClick={() => nav(`/u/${l.owner_id}`)}>
              See {nameOf(l.owner)}’s profile ›
            </button>
          )}
          <SnapshotList items={l.items.map((i) => ({ ref: i.r, title: i.t, sub: i.s, poster: i.p }))} ranked={l.ranked} episodes={l.kind === 'episodes'} />
        </>
      )}
      <div style={{ height: 24 }} />
      {menu &&
        l &&
        createPortal(
          <div className="sheet-backdrop" onClick={() => setMenu(false)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-handle" />
              <div className="sheet-title">{l.name}</div>
              <button className="sheet-row" onClick={() => (setMenu(false), nav(`/c/${id}`))}>
                <span>Open the community</span>
              </button>
              <button
                className="sheet-row danger"
                onClick={async () => {
                  setMenu(false)
                  const r = await unlinkList(id, l.list_id, l.owner_id)
                  if (!r.ok) return toast('Only owners and admins can remove lists')
                  toast('Removed from the community')
                  nav(-1)
                }}
              >
                <span>Remove from community (owners & admins)</span>
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
