import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useLibrary, type ListKind, type RefMeta } from '../store/useLibrary'
import { useToggleFavorite } from '../logic/favorites'
import { useToast } from '../store/useToast'
import { kindAccepts, kindLabel, parseItemRef } from '../logic/lists'
import { ListIcon, CheckIcon, HeartIcon, PlusIcon } from '../components/Icons'
import { NewListSheet } from './NewListSheet'

const KINDS_FOR: Record<string, ListKind[]> = {
  show: ['mixed', 'shows'],
  movie: ['mixed', 'movies'],
  season: ['seasons'],
  episode: ['episodes'],
}

/** Lists this item can go in (by list type), plus Favorites for shows and movies. */
export function AddToListSheet({ itemRef, meta, onClose }: { itemRef: string; meta?: RefMeta; onClose: () => void }) {
  const lists = useLibrary((s) => s.lists)
  const addList = useLibrary((s) => s.addList)
  const addToList = useLibrary((s) => s.addToList)
  const removeFromList = useLibrary((s) => s.removeFromList)
  const favShows = useLibrary((s) => s.favoriteShows)
  const favMovies = useLibrary((s) => s.favoriteMovies)
  const toggleFavorite = useToggleFavorite()
  const toast = useToast((s) => s.show)
  const [creating, setCreating] = useState(false)

  const { type, id } = parseItemRef(itemRef)
  const canFav = type === 'show' || type === 'movie'
  const isFav = type === 'show' ? !!favShows[id] : type === 'movie' ? !!favMovies[id] : false
  const fitting = lists.filter((l) => kindAccepts(l.kind, itemRef))

  if (creating)
    return (
      <NewListSheet
        kinds={KINDS_FOR[type]}
        onClose={() => setCreating(false)}
        onCreate={(d) => {
          addList({ name: d.name, kind: d.kind, ranked: d.ranked, visibility: 'public', items: [itemRef], meta: meta ? { [itemRef]: meta } : undefined })
          toast(`Added to “${d.name}”`)
          setCreating(false)
        }}
      />
    )

  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-title">Add to a list</div>
        {canFav && (
          <button className="list-pick-row" onClick={() => toggleFavorite(type as 'show' | 'movie', id)}>
            <span className="list-pick-name">
              <span className="fav-badge sm">
                <HeartIcon size={12} fill="#fff" strokeWidth={0} />
              </span>
              Favorites
            </span>
            {isFav && <CheckIcon size={18} />}
          </button>
        )}
        {fitting.map((l) => {
          const member = l.items.includes(itemRef)
          return (
            <button key={l.id} className="list-pick-row" onClick={() => (member ? removeFromList(l.id, itemRef) : addToList(l.id, itemRef, meta))}>
              <span className="list-pick-name">
                <ListIcon size={16} /> {l.name}
                <span className="list-pick-kind">{kindLabel(l.kind)}</span>
              </span>
              {member && <CheckIcon size={18} />}
            </button>
          )
        })}
        {fitting.length === 0 && !canFav && <div className="vis-hint" style={{ padding: '6px 2px 10px' }}>No {type} lists yet.</div>}
        <button className="list-pick-row new" onClick={() => setCreating(true)}>
          <span className="list-pick-name">
            <PlusIcon size={16} /> New list
          </span>
        </button>
        <button className="sync-btn primary pressable" style={{ width: '100%', marginTop: 12, justifyContent: 'center' }} onClick={onClose}>
          Done
        </button>
      </div>
    </div>,
    document.body,
  )
}

/** Count of lists (and Favorites) an item is in. */
export function useListMembership(itemRef: string): number {
  const lists = useLibrary((s) => s.lists)
  const favShows = useLibrary((s) => s.favoriteShows)
  const favMovies = useLibrary((s) => s.favoriteMovies)
  const { type, id } = parseItemRef(itemRef)
  const fav = type === 'show' ? !!favShows[id] : type === 'movie' ? !!favMovies[id] : false
  return lists.filter((l) => l.items.includes(itemRef)).length + (fav ? 1 : 0)
}

/** Back-compat pill used by older layouts. */
export function AddToListButton({ type, id, meta }: { type: 'show' | 'movie'; id: string; meta?: RefMeta }) {
  const [open, setOpen] = useState(false)
  const ref = `${type}:${id}`
  const n = useListMembership(ref)
  return (
    <>
      <button className={`action-pill pressable ${n ? 'active' : ''}`} onClick={() => setOpen(true)}>
        <ListIcon size={15} /> {n ? `In ${n} list${n > 1 ? 's' : ''}` : 'Add to list'}
      </button>
      {open && <AddToListSheet itemRef={ref} meta={meta} onClose={() => setOpen(false)} />}
    </>
  )
}
