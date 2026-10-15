import { useState } from 'react'
import { createPortal } from 'react-dom'
import { LIST_KINDS } from '../logic/lists'
import type { ListKind } from '../store/useLibrary'

export interface NewListDraft {
  name: string
  kind: ListKind
  ranked: boolean
}

/**
 * Create a list: name, what it holds (picked once — a list of episodes stays a
 * list of episodes), and whether it's ranked. `kinds` limits the choice.
 */
export function NewListSheet({
  title = 'New list',
  initial,
  kinds,
  cta = 'Create',
  busy,
  note,
  rankedLocked,
  onClose,
  onCreate,
}: {
  rankedLocked?: boolean
  title?: string
  initial?: Partial<NewListDraft>
  kinds?: ListKind[]
  cta?: string
  busy?: boolean
  note?: string
  onClose: () => void
  onCreate: (d: NewListDraft) => void
}) {
  const options = LIST_KINDS.filter((k) => !kinds || kinds.includes(k.key))
  const [name, setName] = useState(initial?.name ?? '')
  const [kind, setKind] = useState<ListKind>(initial?.kind && options.some((o) => o.key === initial.kind) ? initial.kind : options[0].key)
  const [ranked, setRanked] = useState(initial?.ranked ?? false)
  const valid = name.trim().length > 0
  const submit = () => valid && !busy && onCreate({ name: name.trim(), kind, ranked })

  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <form
        className="sheet community-form"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="sheet-handle" />
        <div className="sheet-title">{title}</div>
        <input className="sync-input" autoFocus placeholder="List name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        {options.length > 1 && (
          <>
            <div className="field-label">What goes in it</div>
            <div className="kind-grid" role="radiogroup" aria-label="List type">
              {options.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  role="radio"
                  aria-checked={kind === o.key}
                  className={`kind-opt pressable ${kind === o.key ? 'on' : ''}`}
                  onClick={() => setKind(o.key)}
                >
                  <span className="kind-opt-label">{o.label}</span>
                  <span className="kind-opt-hint">{o.hint}</span>
                </button>
              ))}
            </div>
          </>
        )}
        <button type="button" className={`ranked-toggle pressable ${ranked ? 'on' : ''}`} disabled={rankedLocked} onClick={() => setRanked((v) => !v)}>
          <span className="ranked-toggle-text">
            <span className="ranked-toggle-title">Ranked list</span>
            <span className="ranked-toggle-sub">Number items 1, 2, 3… and reorder them</span>
          </span>
          <span className={`switch ${ranked ? 'on' : ''}`}>
            <span className="switch-knob" />
          </span>
        </button>
        {note && <div className="vis-hint">{note}</div>}
        <button type="submit" className="welcome-primary pressable" disabled={!valid || busy}>
          {busy ? 'Creating…' : cta}
        </button>
      </form>
    </div>,
    document.body,
  )
}
