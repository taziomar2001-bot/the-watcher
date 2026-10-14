import { useState } from 'react'
import { ChevronRight, SearchIcon, FilterIcon, CheckIcon } from '../components/Icons'
import { DOT_COLOR, DOT_LABEL, type DotColor } from '../logic/status'

// ---- Progress dot (orange / green / red) ----
export function ProgressDot({ color, size = 14 }: { color: DotColor; size?: number }) {
  return (
    <span
      className="progress-dot"
      title={DOT_LABEL[color]}
      aria-label={DOT_LABEL[color]}
      style={{ width: size, height: size, background: DOT_COLOR[color] }}
    />
  )
}

// ---- Segmented toggle (2+ options) ----
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  const idx = Math.max(0, options.findIndex((o) => o.key === value))
  return (
    <div className="segmented" role="tablist" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      <span className="segmented-thumb" style={{ width: `${100 / options.length}%`, transform: `translateX(${idx * 100}%)` }} />
      {options.map((o) => (
        <button
          key={o.key}
          role="tab"
          aria-selected={o.key === value}
          className={`segmented-opt ${o.key === value ? 'active' : ''}`}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ---- Section header ----
export function SectionHeader({
  title,
  count,
  onMore,
  right,
}: {
  title: string
  count?: number
  onMore?: () => void
  right?: React.ReactNode
}) {
  return (
    <div className="section-header">
      <div className="section-header-title">
        {title}
        {count != null && <span className="section-count">{count}</span>}
      </div>
      {right}
      {onMore && (
        <button className="section-more pressable" onClick={onMore} aria-label="See all">
          <ChevronRight size={20} />
        </button>
      )}
    </div>
  )
}

// ---- Search field ----
export function SearchField({
  value,
  onChange,
  placeholder = 'Search',
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  return (
    <label className="search-field">
      <SearchIcon size={20} />
      <input
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        enterKeyHint="search"
      />
      {value && (
        <button className="search-clear" onClick={() => onChange('')} aria-label="Clear">
          ✕
        </button>
      )}
    </label>
  )
}

// ---- Sort menu (button + bottom sheet) ----
export function SortMenu<T extends string>({
  options,
  value,
  onChange,
  title = 'Sort by',
}: {
  options: { key: T; label: string }[]
  value: T
  onChange: (v: T) => void
  title?: string
}) {
  const [open, setOpen] = useState(false)
  const current = options.find((o) => o.key === value)
  return (
    <>
      <button className="sort-btn pressable" onClick={() => setOpen(true)}>
        <FilterIcon size={16} />
        <span>{current?.label ?? title}</span>
      </button>
      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-title">{title}</div>
            {options.map((o) => (
              <button
                key={o.key}
                className={`sheet-row ${o.key === value ? 'active' : ''}`}
                onClick={() => {
                  onChange(o.key)
                  setOpen(false)
                }}
              >
                <span>{o.label}</span>
                {o.key === value && <CheckIcon size={18} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

// ---- Stat tile ----
export function StatTile({ value, label, accent }: { value: string; label: string; accent?: string }) {
  return (
    <div className="stat-tile">
      <div className="stat-tile-value" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      <div className="stat-tile-label">{label}</div>
    </div>
  )
}
