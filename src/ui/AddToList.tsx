import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useLibrary, listRef } from '../store/useLibrary'
import { useToggleFavorite } from '../logic/favorites'
import { useToast } from '../store/useToast'
import { ListIcon, CheckIcon, HeartIcon, PlusIcon } from '../components/Icons'

/** "Add to list" pill + bottom sheet. Membership never affects follow/watched/ratings. */
export function AddToListButton({ type, id }: { type: 'show' | 'movie'; id: string }) {
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const lists = useLibrary((s) => s.lists)
  const addList = useLibrary((s) => s.addList)
  const addToList = useLibrary((s) => s.addToList)
  const removeFromList = useLibrary((s) => s.removeFromList)
  const favShows = useLibrary((s) => s.favoriteShows)
  const favMovies = useLibrary((s) => s.favoriteMovies)
  const toggleFavorite = useToggleFavorite()
  const toast = useToast((s) => s.show)

  const ref = listRef(type, id)
  const isFav = type === 'show' ? !!favShows[id] : !!favMovies[id]
  const memberCount = lists.filter((l) => l.items.includes(ref)).length + (isFav ? 1 : 0)

  const toggleList = (listId: string, member: boolean) => {
    if (member) removeFromList(listId, ref)
    else addToList(listId, ref)
  }
  const create = () => {
    const name = newName.trim()
    if (!name) return
    addList({ name, visibility: 'public', kind: 'mixed', items: [ref] })
    setNewName('')
    toast(`Added to “${name}”`)
  }

  return (
    <>
      <button className={`action-pill pressable ${memberCount ? 'active' : ''}`} onClick={() => setOpen(true)}>
        <ListIcon size={15} /> {memberCount ? `In ${memberCount} list${memberCount > 1 ? 's' : ''}` : 'Add to list'}
      </button>
      {open && createPortal(
        <div className="dialog-backdrop" onClick={() => setOpen(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">Add to a list</div>

            <button className="list-pick-row" onClick={() => toggleFavorite(type, id)}>
              <span className="list-pick-name">
                <span className="fav-badge sm">
                  <HeartIcon size={12} fill="#fff" strokeWidth={0} />
                </span>
                Favorites
              </span>
              {isFav && <CheckIcon size={18} />}
            </button>

            {lists.map((l) => {
              const member = l.items.includes(ref)
              return (
                <button key={l.id} className="list-pick-row" onClick={() => toggleList(l.id, member)}>
                  <span className="list-pick-name">
                    <ListIcon size={16} /> {l.name}
                  </span>
                  {member && <CheckIcon size={18} />}
                </button>
              )
            })}

            <div className="list-create-row">
              <input
                className="sync-input"
                placeholder="New list name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && create()}
              />
              <button className="sync-btn primary pressable" disabled={!newName.trim()} onClick={create}>
                <PlusIcon size={15} /> Create
              </button>
            </div>

            <button className="sync-btn primary pressable" style={{ width: '100%', marginTop: 12, justifyContent: 'center' }} onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
