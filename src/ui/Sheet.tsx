import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Bottom drawer. Always rendered at the top level of the page (a portal), so
 * it can never end up behind the tab bar, a sticky header or a composer, and
 * it closes with Escape or a tap outside.
 */
export function Sheet({
  onClose,
  children,
  className = '',
  label,
  zIndex,
}: {
  onClose: () => void
  children: React.ReactNode
  className?: string
  label?: string
  zIndex?: string
}) {
  return createPortal(
    <div
      className="sheet-backdrop"
      style={zIndex ? { zIndex } : undefined}
      onClick={(e) => {
        e.stopPropagation()
        onClose()
      }}
    >
      <div className={`sheet ${className}`} role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        {children}
      </div>
    </div>,
    document.body,
  )
}

/**
 * One Escape handler for every drawer and dialog in the app: Escape closes
 * the topmost one, exactly like tapping outside it. Mounted once in App.
 */
export function useEscapeClosesSheets() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const open = document.querySelectorAll<HTMLElement>('body > .sheet-backdrop, body > .dialog-backdrop')
      const top = open[open.length - 1]
      if (!top) return
      e.preventDefault()
      top.click()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
}

/**
 * "Are you sure?" before anything that can't be undone easily. With
 * `typeToConfirm`, the action stays disabled until that word is typed.
 */
export function ConfirmSheet({
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger,
  typeToConfirm,
  busy,
  onConfirm,
  onCancel,
  zIndex,
}: {
  title: string
  body: React.ReactNode
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  typeToConfirm?: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
  zIndex?: string
}) {
  const [typed, setTyped] = useState('')
  const ready = !typeToConfirm || typed.trim().toLowerCase() === typeToConfirm.toLowerCase()
  return (
    <Sheet onClose={onCancel} label={title} className="confirm-sheet" zIndex={zIndex}>
      <div className="confirm-title">{title}</div>
      <div className="confirm-body">{body}</div>
      {typeToConfirm && (
        <label className="confirm-type">
          <span>
            Type <b>{typeToConfirm}</b> to confirm
          </span>
          <input className="sync-input" value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false} />
        </label>
      )}
      <div className="confirm-actions">
        <button className="sync-btn ghost pressable" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button className={`sync-btn ${danger ? 'danger' : 'primary'} pressable`} disabled={!ready || busy} onClick={onConfirm}>
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Sheet>
  )
}
