import { ListIcon, OrderedListIcon } from '../components/Icons'

/** A list's picture: its cover when it has one, otherwise the list / ranked icon. */
export function ListBadge({ cover, ranked }: { cover?: string; ranked?: boolean }) {
  if (cover)
    return (
      <span className="list-cover">
        <img src={cover} alt="" />
        {ranked && (
          <span className="list-cover-rank">
            <OrderedListIcon size={11} />
          </span>
        )}
      </span>
    )
  return <span className={`list-badge ${ranked ? 'ranked' : ''}`}>{ranked ? <OrderedListIcon size={16} /> : <ListIcon size={16} />}</span>
}
