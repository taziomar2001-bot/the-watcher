import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { SmartImage } from '../components/ui'
import { ProgressDot, SearchField } from '../ui/primitives'
import { ChevronLeft, DotsIcon, TrashIcon, EditIcon, PlusIcon, CheckIcon, GripIcon } from '../components/Icons'
import { RankReorder } from '../ui/RankReorder'
import { useLibrary, parseRef, listRef } from '../store/useLibrary'
import { compositionLabel, countRefs } from '../logic/stats'
import { useScrollMemory } from '../hooks/useScrollMemory'
import { useAsync } from '../hooks/useAsync'
import { search as searchCatalog } from '../data/catalog'
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
  const [q, setQ] = useState('')
  const { data: results } = useAsync(() => (q.trim() ? searchCatalog(q) : Promise.resolve([])), [q])
  const [edit, setEdit] = useState(false)
  const [reordering, setReordering] = useState(false)
  const [name, setName] = useState(list?.name ?? '')
  const [coverSheet, setCoverSheet] = useState(false)
  const coverInput = useRef<HTMLInputElement>(null)

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

  const items = list.items
    .map((ref) => {
      const { type, id: mid } = parseRef(ref)
      const item = type === 'show' ? lib.libraryShows[mid] : lib.libraryMovies[mid]
      if (!item) return null
      const color =
        type === 'show'
          ? showColor(classifyShow(item, lib.watchedEpisodes), !!lib.stoppedShows[mid])
          : movieColor(!!lib.watchedMovies[mid], isUnreleased(item.releaseDate))
      return { ref, type, id: mid, poster: item.poster, title: item.title, color }
    })
    .filter(Boolean) as { ref: string; type: 'show' | 'movie'; id: string; poster?: string; title: string; color: ReturnType<typeof movieColor> }[]

  const ranked = !!list.ranked

  // Commit a new order of the resolvable items, appending any refs that don't
  // resolve to a library item (rare) so nothing is silently dropped.
  const reorderResolved = (refs: string[]) => {
    const resolvable = new Set(items.map((it) => it.ref))
    const leftovers = list.items.filter((r) => !resolvable.has(r))
    lib.reorderList(list.id, [...refs, ...leftovers])
  }

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
              {compositionLabel(countRefs(list.items).movies, countRefs(list.items).shows)} · {list.visibility === 'public' ? 'On your profile' : 'Only you'}
            </div>
          </div>
        </div>
        <button className="icon-round pressable" onClick={() => setMenu(true)} aria-label="List options">
          <DotsIcon size={20} />
        </button>
      </div>

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
          <div className="empty-sub">Use the ••• menu to add shows and movies</div>
        </div>
      ) : reordering ? (
        <RankReorder
          rows={items.map((it) => ({ ref: it.ref, poster: it.poster, title: it.title }))}
          onReorder={reorderResolved}
        />
      ) : (
        <div className="poster-grid">
          {items.map((it, i) => (
            <div key={it.ref} className="poster-thumb" style={{ width: 'auto' }}>
              <div className="poster-thumb-art" onClick={() => (edit ? lib.removeFromList(list.id, it.ref) : nav(`/${it.type}/${it.id}`))}>
                <SmartImage src={it.poster} alt={it.title} />
                <span className="poster-thumb-dot">
                  <ProgressDot color={it.color} size={11} />
                </span>
                {ranked && !edit && <span className="rank-badge">{i + 1}</span>}
                {edit && (
                  <span className="poster-remove">
                    <TrashIcon size={16} />
                  </span>
                )}
              </div>
              <div className="poster-thumb-title" onClick={() => (edit ? lib.removeFromList(list.id, it.ref) : nav(`/${it.type}/${it.id}`))}>
                {it.title}
              </div>
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
              <span><PlusIcon size={16} /> Add titles</span>
            </button>
            <button
              className="sheet-row"
              onClick={() => {
                setEdit((v) => !v)
                setReordering(false)
                setMenu(false)
              }}
            >
              <span><EditIcon size={16} /> {edit ? 'Done editing' : 'Remove titles'}</span>
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
                <EditIcon size={16} /> {list.cover ? 'Change picture' : 'Add a picture'}
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
              <span><EditIcon size={16} /> Rename list</span>
            </button>
            <button
              className="sheet-row"
              onClick={() => {
                lib.setListVisibility(list.id, list.visibility === 'public' ? 'private' : 'public')
                setMenu(false)
              }}
            >
              <span>
                <EditIcon size={16} /> {list.visibility === 'public' ? 'Hide from my profile' : 'Show on my profile'}
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
              <div className="sheet-title">List picture</div>
              <button className="sheet-row" onClick={() => coverInput.current?.click()}>
                <span>Upload a photo</span>
              </button>
              {items.some((it) => it.poster) && (
                <>
                  <div className="cover-pick-label">Or use a poster from this list</div>
                  <div className="cover-pick">
                    {items
                      .filter((it) => it.poster)
                      .slice(0, 12)
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
                  <span>Remove picture</span>
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
              This removes the list only. Your follows, watched status, ratings, and favorites are not affected.
            </div>
            <div className="confirm-actions">
              <button className="sync-btn ghost pressable" onClick={() => setConfirmDel(false)}>
                Cancel
              </button>
              <button
                className="sync-btn danger pressable"
                onClick={() => {
                  lib.deleteList(list.id)
                  nav(-1)
                }}
              >
                Delete List
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {adding && createPortal(
        <div className="picker-backdrop">
          <div className="picker">
            <div className="picker-head">
              <span className="picker-title">Add titles</span>
              <button className="settings-close pressable" onClick={() => setAdding(false)} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="picker-search">
              <SearchField value={q} onChange={setQ} placeholder="Search movies & TV shows" autoFocus />
            </div>
            <div className="picker-body">
              {!q.trim() ? (
                <div className="empty compact">
                  <div className="empty-sub">Search to add shows or movies to this list</div>
                </div>
              ) : (
                (results ?? []).map((m) => {
                  const ref = listRef(m.type, m.id)
                  const inList = list.items.includes(ref)
                  return (
                    <button
                      key={ref}
                      className="pick-row pressable"
                      onClick={() => {
                        if (inList) lib.removeFromList(list.id, ref)
                        else {
                          lib.addToList(list.id, ref)
                          if (m.type === 'show') lib.patchLibraryShow(m.id, toLibraryItem(m))
                          else lib.patchLibraryMovie(m.id, toLibraryItem(m))
                        }
                      }}
                    >
                      <SmartImage src={m.poster} alt={m.title} className="pick-poster" />
                      <span className="pick-info">
                        <span className="pick-title">{m.title}</span>
                        <span className="pick-sub">{m.type === 'show' ? 'TV' : 'Film'}</span>
                      </span>
                      <span className={`pick-check ${inList ? 'on' : ''}`}>
                        {inList ? <CheckIcon size={16} /> : <PlusIcon size={16} />}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
