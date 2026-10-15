import { useState } from 'react'
import { SmartImage } from '../components/ui'
import { ChevronLeft } from '../components/Icons'
import { Segmented } from './primitives'

/** Backdrop + overlapping poster + title block shared by every title page. */
export function DetailHero({
  backdrop,
  poster,
  title,
  eyebrow,
  meta,
  onBack,
  backLabel = 'Back',
  children,
  still,
}: {
  backdrop?: string
  poster?: string
  title: string
  eyebrow?: React.ReactNode
  meta?: React.ReactNode
  onBack: () => void
  backLabel?: string
  children?: React.ReactNode
  /** Episode pages: wide still instead of a poster. */
  still?: boolean
}) {
  return (
    <header className={`dh ${still ? 'still' : ''}`}>
      <div className="dh-backdrop">
        <SmartImage src={backdrop} alt="" />
        <div className="detail-hero-scrim" />
        <button className="icon-btn-float" style={{ left: 14 }} onClick={onBack} aria-label={backLabel}>
          <ChevronLeft size={22} />
        </button>
      </div>
      <div className="dh-row">
        {!still && <SmartImage src={poster} alt={title} className="dh-poster" />}
        <div className="dh-info">
          {eyebrow && <div className="dh-eyebrow">{eyebrow}</div>}
          <h1 className="detail-title dh-title">{title}</h1>
          {meta && <div className="dh-meta">{meta}</div>}
          {children}
        </div>
      </div>
    </header>
  )
}

/** Evenly spaced icon actions (icon over a short label), like Letterboxd / Apple TV. */
export function ActionBar({ children }: { children: React.ReactNode }) {
  return <div className="action-bar">{children}</div>
}

export function ActionBtn({
  icon,
  label,
  on,
  tone,
  onClick,
  disabled,
}: {
  icon: React.ReactNode
  label: string
  on?: boolean
  tone?: 'green' | 'gold' | 'red'
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button className={`action-btn ${on ? 'on' : ''} ${tone ? `tone-${tone}` : ''}`} aria-pressed={on} onClick={onClick} disabled={disabled}>
      <span className="action-btn-icon">{icon}</span>
      <span className="action-btn-label">{label}</span>
    </button>
  )
}

const tabMem = new Map<string, string>()

/** Underline tabs that stick under the status bar; remembered per page. */
export function useDetailTab<T extends string>(key: string, initial: T): [T, (t: T) => void] {
  const fromUrl = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('tab') as T | null
  const [tab, setTab] = useState<T>((fromUrl ?? (tabMem.get(key) as T | undefined) ?? initial) as T)
  return [tab, (t: T) => (tabMem.set(key, t), setTab(t))]
}

export function DetailTabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="detail-tabs">
      <Segmented options={tabs} value={value} onChange={onChange} />
    </div>
  )
}
