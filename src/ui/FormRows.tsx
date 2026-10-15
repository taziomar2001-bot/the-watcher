import { createPortal } from 'react-dom'
import { ChevronRight, CheckIcon } from '../components/Icons'

// Settings-style form building blocks: grouped cards of compact rows. Values
// are changed in drawers instead of piling every control onto the page.

export function FormGroup({ title, footer, children }: { title?: string; footer?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="fg">
      {title && <div className="fg-title">{title}</div>}
      <div className="fg-card">{children}</div>
      {footer && <div className="fg-foot">{footer}</div>}
    </section>
  )
}

export function FormRow({ label, value, onClick, danger }: { label: string; value?: React.ReactNode; onClick?: () => void; danger?: boolean }) {
  return (
    <button type="button" className={`fg-row pressable ${danger ? 'danger' : ''}`} onClick={onClick}>
      <span className="fg-row-label">{label}</span>
      {value !== undefined && <span className="fg-row-value">{value}</span>}
      {onClick && <ChevronRight size={16} className="fg-row-chev" />}
    </button>
  )
}

export function FormInput({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  multiline,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  maxLength?: number
  multiline?: boolean
  hint?: string
}) {
  const id = `fi-${label.toLowerCase().replace(/\W+/g, '-')}`
  return (
    <div className="fg-field">
      <label className="fg-field-label" htmlFor={id}>
        {label}
      </label>
      {multiline ? (
        <textarea id={id} className="fg-input" rows={3} value={value} maxLength={maxLength} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} className="fg-input" value={value} maxLength={maxLength} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
      {hint && <span className="fg-field-hint">{hint}</span>}
    </div>
  )
}

export interface ChoiceOption<T extends string> {
  key: T
  label: string
  hint?: string
}

/** A drawer of options with checkmarks: single choice, or multiple with `multi`. */
export function ChoiceDrawer<T extends string>({
  title,
  options,
  value,
  multi,
  note,
  onChange,
  onClose,
}: {
  title: string
  options: ChoiceOption<T>[]
  value: T[]
  multi?: boolean
  note?: string
  onChange: (v: T[]) => void
  onClose: () => void
}) {
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="sheet-handle" />
        <div className="sheet-title">{title}</div>
        <div className="fg-card">
          {options.map((o) => {
            const on = value.includes(o.key)
            return (
              <button
                key={o.key}
                type="button"
                role={multi ? 'checkbox' : 'radio'}
                aria-checked={on}
                className="fg-row choice pressable"
                onClick={() => {
                  if (!multi) {
                    onChange([o.key])
                    onClose()
                  } else if (on) {
                    if (value.length > 1) onChange(value.filter((k) => k !== o.key))
                  } else onChange(options.map((x) => x.key).filter((k) => k === o.key || value.includes(k)))
                }}
              >
                <span className="fg-choice-text">
                  <span className="fg-row-label">{o.label}</span>
                  {o.hint && <span className="fg-choice-hint">{o.hint}</span>}
                </span>
                <span className={`fg-check ${on ? 'on' : ''}`}>{on && <CheckIcon size={13} />}</span>
              </button>
            )
          })}
        </div>
        {note && <div className="fg-foot">{note}</div>}
        {multi && (
          <button type="button" className="sync-btn primary pressable fg-done" onClick={onClose}>
            Done
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}
