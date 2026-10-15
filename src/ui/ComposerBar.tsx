import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { SendIcon } from './SendIcon'

/**
 * Bottom-docked composer, like a messaging app: grows to 4 lines, arrow sends.
 * `above` renders a strip over the input (e.g. "Replying to …"); `leading`
 * sits left of the input (e.g. a spoiler toggle).
 */
export function ComposerBar({
  value,
  onChange,
  onSend,
  placeholder,
  maxLength,
  busy,
  above,
  leading,
  inputRef,
}: {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  placeholder: string
  maxLength: number
  busy?: boolean
  above?: React.ReactNode
  leading?: React.ReactNode
  inputRef?: React.RefObject<HTMLTextAreaElement | null>
}) {
  const own = useRef<HTMLTextAreaElement>(null)
  const ref = inputRef ?? own
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 110) + 'px'
  }, [value, ref])
  return createPortal(
    <form
      className={`composer-bar ${above ? 'with-above' : ''}`}
      onSubmit={(e) => {
        e.preventDefault()
        if (value.trim() && !busy) onSend()
      }}
    >
      {above && <div className="composer-above">{above}</div>}
      <div className="composer-row">
        {leading}
        <textarea
          ref={ref}
          rows={1}
          className="composer-input"
          maxLength={maxLength}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) {
              e.preventDefault()
              if (value.trim() && !busy) onSend()
            }
          }}
        />
        <button type="submit" className="send-btn pressable" disabled={!value.trim() || busy} aria-label="Send">
          <SendIcon size={18} />
        </button>
      </div>
    </form>,
    document.querySelector('.app-shell') ?? document.body,
  )
}
