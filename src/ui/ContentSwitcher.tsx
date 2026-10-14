import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { CheckIcon } from '../components/Icons'
import { CONTENT_CATEGORIES, rememberContent } from '../logic/content'

/**
 * The Content tab's title: tap it to switch between TV Shows, Movies and any
 * future category. Switching is lateral (replace), so Back never bounces
 * between categories.
 */
export function ContentSwitcher({ current }: { current: string }) {
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const cat = CONTENT_CATEGORIES.find((c) => c.key === current) ?? CONTENT_CATEGORIES[0]

  useEffect(() => rememberContent(cat.key), [cat.key])

  return (
    <>
      <button className="content-title pressable" onClick={() => setOpen(true)} aria-haspopup="listbox" aria-label={`${cat.label}, switch category`}>
        <h1>{cat.label}</h1>
        <svg className="content-caret" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div className="sheet-backdrop" onClick={() => setOpen(false)}>
            <div className="sheet" role="listbox" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-handle" />
              <div className="sheet-title">Content</div>
              {CONTENT_CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  role="option"
                  aria-selected={c.key === cat.key}
                  className={`sheet-row ${c.key === cat.key ? 'active' : ''}`}
                  onClick={() => {
                    setOpen(false)
                    if (c.key !== cat.key) nav(c.path, { replace: true })
                  }}
                >
                  <span>
                    <c.Icon size={18} /> {c.label}
                  </span>
                  {c.key === cat.key && <CheckIcon size={18} />}
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
