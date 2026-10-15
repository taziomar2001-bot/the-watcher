import { useEffect, useRef, useState } from 'react'
import { SmartImage } from '../components/ui'
import { GripIcon } from '../components/Icons'

export interface RankRow {
  ref: string
  poster?: string
  title: string
}

const GAP = 8 // must match .reorder-list gap in CSS

/**
 * Pointer-based drag-and-drop reordering for ranked lists. Grab a row by its
 * handle and drag it to the rank you want; the other rows slide out of the way
 * live, and the new order is committed on release. Works with touch and mouse
 * (Pointer Events), no external dependency.
 */
export function RankReorder({ rows, onReorder }: { rows: RankRow[]; onReorder: (refs: string[]) => void }) {
  const byRef = new Map(rows.map((r) => [r.ref, r]))
  const [order, setOrder] = useState<string[]>(rows.map((r) => r.ref))

  // Re-sync when the incoming set of items changes (add/remove), but not on a
  // reorder we just committed (same membership).
  const membershipKey = rows
    .map((r) => r.ref)
    .slice()
    .sort()
    .join('|')
  const lastKey = useRef(membershipKey)
  useEffect(() => {
    if (lastKey.current !== membershipKey) {
      lastKey.current = membershipKey
      setOrder(rows.map((r) => r.ref))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membershipKey])

  const drag = useRef<{
    ref: string
    startY: number
    startIndex: number
    curIndex: number
    rowH: number
    offset: number
  } | null>(null)
  const [, force] = useState(0)
  const rerender = () => force((n) => n + 1)

  const onPointerDown = (e: React.PointerEvent, ref: string) => {
    const rowEl = (e.currentTarget as HTMLElement).closest('.reorder-row') as HTMLElement | null
    const rowH = (rowEl?.offsetHeight ?? 66) + GAP
    const index = order.indexOf(ref)
    drag.current = { ref, startY: e.clientY, startIndex: index, curIndex: index, rowH, offset: 0 }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    rerender()
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dy = e.clientY - d.startY
    const desired = Math.max(0, Math.min(order.length - 1, d.startIndex + Math.round(dy / d.rowH)))
    if (desired !== d.curIndex) {
      const next = order.filter((r) => r !== d.ref)
      next.splice(desired, 0, d.ref)
      setOrder(next)
      d.curIndex = desired
    }
    // Keep the dragged row under the finger despite the slot shifts.
    d.offset = dy - (d.curIndex - d.startIndex) * d.rowH
    rerender()
  }

  const endDrag = () => {
    const d = drag.current
    if (!d) return
    drag.current = null
    rerender()
    onReorder(order)
  }

  return (
    <div className="reorder-list">
      {order.map((ref, i) => {
        const row = byRef.get(ref)
        if (!row) return null
        const isDragging = drag.current?.ref === ref
        return (
          <div
            key={ref}
            className={`reorder-row ${isDragging ? 'dragging' : drag.current ? 'shifting' : ''}`}
            style={isDragging ? { transform: `translateY(${drag.current!.offset}px)` } : undefined}
          >
            <span className="reorder-rank">{i + 1}</span>
            <SmartImage src={row.poster} alt={row.title} className="reorder-poster" />
            <span className="reorder-title">{row.title}</span>
            <button type="button"
              className="reorder-handle"
              aria-label="Drag to reorder"
              onPointerDown={(e) => onPointerDown(e, ref)}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <GripIcon size={22} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
