import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { SmartImage } from '../components/ui'
import { ProgressDot, SearchField } from '../ui/primitives'
import { ChevronLeft, DotsIcon, TrashIcon, EditIcon, PlusIcon, CheckIcon } from '../components/Icons'
import { useLibrary, parseRef, listRef } from '../store/useLibrary'
import { useScrollMemory } from '../hooks/useScrollMemory'
import { useAsync } from '../hooks/useAsync'
import { search as searchCatalog } from '../data/catalog'
import { toLibraryItem } from '../utils/media'
import { classifyShow, showColor, movieColor } from '../logic/status'

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
  const [name, setName] = useState(list?.name ?? '')

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
          : movieColor(!!lib.watchedMovies[mid])
      return { ref, type, id: mid, poster: item.poster, title: item.title, color }
    })
    .filter(Boolean) as { ref: string; type: 'show' | 'movie'; id: string; poster?: string; title: string; color: ReturnType<typeof movieColor> }[]

  return (
    <div className="scroll-area route-fade" ref={scrollRef}>
      <div className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button className="pressable" onClick={() => nav(-1)} aria-label="Back" style={{ color: 'var(--text-dim)' }}>
            <ChevronLeft size={26} />
          </button>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 24, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{list.name}</h1>
            <div className="sub">{items.length} {items.length === 1 ? 'title' : 'titles'}</div>
          </div>
        </div>
        <button className="icon-round pressable" onClick={() => setMenu(true)} aria-label="List options">
          <DotsIcon size={20} />
        </button>
      </div>

      <div className="page-pad" style={{ paddingBottom: 10 }}>
        <button className="add-titles-btn pressable" onClick={() => setAdding(true)}>
          <PlusIcon size={17} /> Add titles
        </button>
      </div>

      {items.length === 0 ? (
        <div className="empty">
          <div className="empty-title">This list is empty</div>
          <div className="empty-sub">Tap “Add titles” to fill it with shows and movies</div>
        </div>
      ) : (
        <div className="poster-grid">
          {items.map((it) => (
            <div key={it.ref} className="poster-thumb" style={{ width: 'auto' }}>
              <div className="poster-thumb-art" onClick={() => (edit ? lib.removeFromList(list.id, it.ref) : nav(`/${it.type}/${it.id}`))}>
                <SmartImage src={it.poster} alt={it.title} />
                <span className="poster-thumb-dot">
                  <ProgressDot color={it.color} size={11} />
                </span>
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

      {menu && (
        <div className="sheet-backdrop" onClick={() => setMenu(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-title">{list.name}</div>
            <button
              className="sheet-row"
              onClick={() => {
                setEdit((v) => !v)
                setMenu(false)
              }}
            >
              <span><EditIcon size={16} /> {edit ? 'Done editing' : 'Remove titles'}</span>
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
              className="sheet-row danger"
              onClick={() => {
                setConfirmDel(true)
                setMenu(false)
              }}
            >
              <span><TrashIcon size={16} /> Delete list</span>
            </button>
          </div>
        </div>
      )}

      {renaming && (
        <div className="sheet-backdrop" onClick={() => setRenaming(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-title">Rename list</div>
            <div className="list-create-row">
              <input className="sync-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
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
        </div>
      )}

      {confirmDel && (
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
        </div>
      )}

      {adding && (
        <div className="modal-backdrop" onClick={() => setAdding(false)}>
          <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
            <div className="settings-head">
              <span className="settings-title">Add titles</span>
              <button className="settings-close pressable" onClick={() => setAdding(false)} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="page-pad" style={{ paddingTop: 4, paddingBottom: 8 }}>
              <SearchField value={q} onChange={setQ} placeholder="Search movies & TV shows" autoFocus />
            </div>
            <div className="settings-body" style={{ paddingTop: 0 }}>
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
        </div>
      )}
    </div>
  )
}
