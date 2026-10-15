import { trackColor } from '../logic/tracks'
import { whenDrawersSettled } from '../ui/gestures'
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { SmartImage } from '../components/ui'
import { ProgressDot } from '../ui/primitives'
import { ChevronLeft, DotsIcon, TrashIcon, EditIcon, PlusIcon, GripIcon, PeopleIcon, ImageIcon, EyeIcon, EyeOffIcon, MinusCircleIcon } from '../components/Icons'
import { RankReorder } from '../ui/RankReorder'
import { TitlePicker } from '../ui/TitlePicker'
import { LinkListSheet } from '../ui/LinkListSheet'
import { useLibrary, type ListKind } from '../store/useLibrary'
import { kindLabel, listSummary, parseItemRef, resolveItem, type ResolvedItem } from '../logic/lists'
import { unlinkEverywhere } from '../logic/communityLists'
import { useMyCommunities } from '../logic/communityCache'
import { useScrollMemory } from '../hooks/useScrollMemory'
import { toLibraryItem } from '../utils/media'
import { fileToImage } from '../utils/image'
import { classifyShow, showColor, movieColor, isUnreleased } from '../logic/status'

export function ListScreen() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const scrollRef = useScrollMemory<HTMLDivElement>(`list-${id}`)
  const lib = useLibrary()
  const list = lib.lists.find((l) => l.id === id)
  const [menu, setMenu] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [adding, setAdding] = useState(false)
  const [linking, setLinking] = useState(false)
  const [edit, setEdit] = useState(false)
  const [params] = useSearchParams()
  const [reordering, setReordering] = useState(() => params.get('reorder') === '1')
  const [name, setName] = useState(list?.name ?? '')
  const [coverSheet, setCoverSheet] = useState(false)
  const coverInput = useRef<HTMLInputElement>(null)
  const { list: mine } = useMyCommunities()

  if (!list)
    return (
      <div className="scroll-area route-fade">
        <div className="app-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="pressable" onClick={() => nav(-1)} aria-label="Back" style={{ color: 'var(--text-dim)' }}>
              <ChevronLeft size={26} />
            </button>
            <h1 style={{ fontSize: 24 }}>List</h1>
          </div>
        </div>
        <div className="empty">
          <div className="empty-title">List not found</div>
        </div>
      </div>
    )

  const kind = list.kind ?? 'mixed'
  const items = list.items
    .map((ref) => {
      const r = resolveItem(ref, lib, list.meta)
      if (!r) return null
      const p = parseItemRef(ref)
      let color: ReturnType<typeof movieColor> | undefined
      if (p.type === 'show' && lib.libraryShows[p.id]) color = showColor(classifyShow(lib.libraryShows[p.id], lib.watchedEpisodes), !!lib.stoppedShows[p.id])
      else if (p.type === 'movie' && lib.libraryMovies[p.id]) color = movieColor(!!lib.watchedMovies[p.id], isUnreleased(lib.libraryMovies[p.id].releaseDate))
      else if (p.type === 'book' || p.type === 'game') color = trackColor((p.type === 'book' ? lib.books : lib.games)[p.id])
      return { ...r, color }
    })
    .filter(Boolean) as (ResolvedItem & { color?: ReturnType<typeof movieColor> })[]

  const ranked = !!list.ranked
  const coverOf = list.cover ?? items.find((it) => it.poster)?.poster
  const linkedNames = (list.communities ?? []).map((cid) => mine?.find((c) => c.id === cid)).filter(Boolean)

  // Commit a new order of the resolvable items, appending any refs that don't
  // resolve (rare) so nothing is silently dropped.
  const reorderResolved = (refs: string[]) => {
    const resolvable = new Set(items.map((it) => it.ref))
    const leftovers = list.items.filter((r) => !resolvable.has(r))
    lib.reorderList(list.id, [...refs, ...leftovers])
  }
  const open = (it: ResolvedItem) => (edit ? lib.removeFromList(list.id, it.ref) : nav(it.link))

  return (
    <div className="scroll-area route-fade" ref={scrollRef}>
      <div className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button className="pressable" onClick={() => nav(-1)} aria-label="Back" style={{ color: 'var(--text-dim)' }}>
            <ChevronLeft size={26} />
          </button>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 24, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{list.name}</h1>
            <div className="sub">
              {listSummary(list)}
              {ranked ? ' · Ranked' : ''} · {list.visibility === 'public' ? 'On your profile' : 'Only you'}
            </div>
          </div>
        </div>
        <button className="icon-round pressable" onClick={() => setMenu(true)} aria-label="List options">
          <DotsIcon size={20} />
        </button>
      </div>

      <div className="page-pad list-head">
        <button className="list-head-cover pressable" onClick={() => setCoverSheet(true)} aria-label="Choose a cover">
          {coverOf ? <img src={coverOf} alt="" /> : <ImageIcon size={22} />}
          <span className="list-head-cover-edit">
            <EditIcon size={12} />
          </span>
        </button>
        <div className="list-head-text">
          <div className="list-head-kind">{kindLabel(kind)} list{ranked ? ' · Ranked' : ''}</div>
          {list.remixOf && <div className="list-head-sub">Remix of {list.remixOf.name}{list.remixOf.by ? ` by ${list.remixOf.by}` : ''}</div>}
          {!list.cover && items.length > 0 && <div className="list-head-sub">Cover: first title · tap to choose</div>}
        </div>
      </div>

      {linkedNames.length > 0 && (
        <div className="page-pad list-linked">
          <PeopleIcon size={14} />
          <span>
            Shared in{' '}
            {linkedNames.map((c, i) => (
              <span key={c!.id}>
                {i > 0 ? ', ' : ''}
                <button className="auth-link inline" onClick={() => nav(`/c/${c!.id}?tab=lists`)}>
                  {c!.name}
                </button>
              </span>
            ))}
          </span>
        </div>
      )}

      {reordering && (
        <div className="reorder-banner">
          <span>Drag the handles to change ranks</span>
          <button className="sync-btn primary pressable" onClick={() => setReordering(false)}>
            Done
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="empty">
          <div className="empty-title">This list is empty</div>
          <div className="empty-sub">Add {kindNoun(kind)} to get started</div>
          <button className="sync-btn primary pressable" style={{ marginTop: 14 }} onClick={() => setAdding(true)}>
            <PlusIcon size={15} /> Add {kindNoun(kind)}
          </button>
        </div>
      ) : reordering ? (
        <RankReorder rows={items.map((it) => ({ ref: it.ref, poster: it.poster, title: it.sub && it.type !== 'episode' ? `${it.title} · ${it.sub}` : it.type === 'episode' ? `${it.sub} · ${it.title}` : it.title }))} onReorder={reorderResolved} />
      ) : kind === 'episodes' ? (
        <div className="page-pad ep-list">
          {items.map((it, i) => (
            <button key={it.ref} className="ep-list-row pressable" onClick={() => open(it)}>
              {ranked && !edit && <span className="ep-rank">{i + 1}</span>}
              <span className="ep-list-still">
                <SmartImage src={it.poster} alt="" />
                {edit && (
                  <span className="poster-remove">
                    <TrashIcon size={16} />
                  </span>
                )}
              </span>
              <span className="ep-list-text">
                <span className="ep-list-title">{it.title}</span>
                <span className="ep-list-sub">{it.sub}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="poster-grid">
          {items.map((it, i) => (
            <div key={it.ref} className="poster-thumb" style={{ width: 'auto' }}>
              <div className="poster-thumb-art" onClick={() => open(it)}>
                <SmartImage src={it.poster} alt={it.title} />
                {it.color && (
                  <span className="poster-thumb-dot">
                    <ProgressDot color={it.color} size={11} />
                  </span>
                )}
                {ranked && !edit && <span className="rank-badge">{i + 1}</span>}
                {edit && (
                  <span className="poster-remove">
                    <TrashIcon size={16} />
                  </span>
                )}
              </div>
              <div className="poster-thumb-title" onClick={() => open(it)}>
                {it.title}
              </div>
              {it.type === 'season' && it.sub && <div className="poster-thumb-sub">{it.sub}</div>}
            </div>
          ))}
        </div>
      )}
      <div style={{ height: 24 }} />

      {menu && createPortal(
        <div className="sheet-backdrop" onClick={() => setMenu(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-title">{list.name}</div>
            <button
              className="sheet-row"
              onClick={() => {
                setAdding(true)
                setMenu(false)
              }}
            >
              <span><PlusIcon size={16} /> Add {kindNoun(kind)}</span>
            </button>
            <button
              className="sheet-row"
              onClick={() => {
                setLinking(true)
                setMenu(false)
              }}
            >
              <span><PeopleIcon size={16} /> Share in a community</span>
            </button>
            <button
              className="sheet-row"
              onClick={() => {
                setEdit((v) => !v)
                setReordering(false)
                setMenu(false)
              }}
            >
              <span><MinusCircleIcon size={16} /> {edit ? 'Done removing' : `Remove ${kindNoun(kind)}`}</span>
            </button>
            {ranked && (
              <button
                className="sheet-row"
                onClick={() => {
                  setReordering((v) => !v)
                  setEdit(false)
                  setMenu(false)
                }}
              >
                <span><GripIcon size={16} /> {reordering ? 'Done reordering' : 'Reorder ranks'}</span>
              </button>
            )}
            <button
              className="sheet-row"
              onClick={() => {
                setCoverSheet(true)
                setMenu(false)
              }}
            >
              <span>
                <ImageIcon size={16} /> {list.cover ? 'Change cover' : 'Choose a cover'}
              </span>
            </button>
            <button
              className="sheet-row"
              onClick={() => {
                setName(list.name)
                setRenaming(true)
                setMenu(false)
              }}
            >
              <span><EditIcon size={16} /> Rename</span>
            </button>
            <button
              className="sheet-row"
              onClick={() => {
                lib.setListVisibility(list.id, list.visibility === 'public' ? 'private' : 'public')
                setMenu(false)
              }}
            >
              <span>
                {list.visibility === 'public' ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />} {list.visibility === 'public' ? 'Hide from my profile' : 'Show on my profile'}
              </span>
            </button>
            <button
              className="sheet-row danger"
              onClick={() => {
                setConfirmDel(true)
                setMenu(false)
              }}
            >
              <span><TrashIcon size={16} /> Delete list</span>
            </button>
          </div>
        </div>,
        document.body,
      )}

      {renaming && createPortal(
        <div className="dialog-backdrop" onClick={() => setRenaming(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">Rename list</div>
            <div className="list-create-row">
              <input
                className="sync-input"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && name.trim() && (lib.renameList(list.id, name.trim()), setRenaming(false))}
              />
              <button
                className="sync-btn primary pressable"
                disabled={!name.trim()}
                onClick={() => {
                  lib.renameList(list.id, name.trim())
                  setRenaming(false)
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      <input
        ref={coverInput}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          try {
            lib.setListCover(list.id, await fileToImage(f, 240, 240))
            setCoverSheet(false)
          } catch {
            /* unreadable image */
          }
        }}
      />
      {coverSheet &&
        createPortal(
          <div className="sheet-backdrop" onClick={() => setCoverSheet(false)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-handle" />
              <div className="sheet-title">List cover</div>
              {!items.some((it) => it.poster) && <div className="vis-hint" style={{ padding: '4px 4px 12px' }}>Add titles first — the cover is one of their posters.</div>}
              {items.some((it) => it.poster) && (
                <>
                  <div className="cover-pick-label">Pick one of the titles in this list</div>
                  <div className="cover-pick">
                    {items
                      .filter((it) => it.poster)
                      .slice(0, 30)
                      .map((it) => (
                        <button
                          key={it.ref}
                          className={`cover-pick-item pressable ${list.cover === it.poster ? 'on' : ''}`}
                          onClick={() => {
                            lib.setListCover(list.id, it.poster)
                            setCoverSheet(false)
                          }}
                        >
                          <SmartImage src={it.poster} alt={it.title} />
                        </button>
                      ))}
                  </div>
                </>
              )}
              {list.cover && (
                <button
                  className="sheet-row danger"
                  onClick={() => {
                    lib.setListCover(list.id, undefined)
                    setCoverSheet(false)
                  }}
                >
                  <span>Use the first title automatically</span>
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}

      {confirmDel && createPortal(
        <div className="sheet-backdrop" onClick={() => setConfirmDel(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="confirm-title">Delete “{list.name}”?</div>
            <div className="confirm-body">
              This removes the list only{list.communities?.length ? ' (and its copy in communities)' : ''}. Your follows, watched status, ratings, and favorites are not affected.
            </div>
            <div className="confirm-actions">
              <button className="sync-btn ghost pressable" onClick={() => setConfirmDel(false)}>
                Cancel
              </button>
              <button
                className="sync-btn danger pressable"
                onClick={() => {
                  void unlinkEverywhere(list)
                  setConfirmDel(false)
                  lib.deleteList(list.id)
                  whenDrawersSettled(() => nav(-1))
                }}
              >
                Delete list
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {adding && (
        <TitlePicker
          kind={kind}
          title={`Add ${kindNoun(kind)}`}
          isPicked={(ref) => list.items.includes(ref)}
          onToggle={(ref, meta, media) => {
            if (list.items.includes(ref)) return lib.removeFromList(list.id, ref)
            lib.addToList(list.id, ref, meta)
            if (media) {
              if (media.type === 'show') lib.patchLibraryShow(media.id, toLibraryItem(media))
              else if (media.type === 'movie') lib.patchLibraryMovie(media.id, toLibraryItem(media))
              // Books/games: the list keeps its own snapshot (meta) of the title.
            }
          }}
          onClose={() => setAdding(false)}
        />
      )}
      {linking && <LinkListSheet list={list} onClose={() => setLinking(false)} />}
    </div>
  )
}

export const kindNoun = (k: ListKind) =>
  k === 'mixed' ? 'titles' : k === 'shows' ? 'shows' : k === 'movies' ? 'movies' : k === 'seasons' ? 'seasons' : k === 'books' ? 'books' : k === 'games' ? 'games' : 'episodes'
