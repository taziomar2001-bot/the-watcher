import { useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, CheckIcon } from '../components/Icons'
import { Segmented } from './primitives'
import { LENGTHS, SOURCES, lengthOf, type Genre, type Kind, type PickFilters } from '../logic/pickFilters'

type Sheet = 'source' | 'genre' | 'length' | null

/**
 * Movie / TV switch + three compact filter chips (source, genre, length).
 * Each chip opens a sheet with all its options — no walls of pills.
 */
export function PickFilterBar({
  value,
  onChange,
  genres,
  sourceNote,
}: {
  value: PickFilters
  onChange: (f: PickFilters) => void
  genres: Genre[]
  sourceNote?: string
}) {
  const [sheet, setSheet] = useState<Sheet>(null)
  const src = SOURCES[value.kind].find((s) => s.key === value.source) ?? SOURCES[value.kind][0]
  const len = lengthOf(value.kind, value.length)
  const set = (patch: Partial<PickFilters>) => onChange({ ...value, ...patch })
  const setKind = (kind: Kind) =>
    onChange({ kind, genre: null, length: 'any', source: SOURCES[kind].some((s) => s.key === value.source) ? value.source : 'anything' })
  const close = () => setSheet(null)

  return (
    <div className="pf-bar">
      <Segmented
        options={[
          { key: 'movie', label: 'Movies' },
          { key: 'show', label: 'TV shows' },
        ]}
        value={value.kind}
        onChange={setKind}
      />
      <div className="filter-chips" role="toolbar" aria-label="Filters">
        <FilterChip label={src.label} active={value.source !== 'anything'} onClick={() => setSheet('source')} />
        <FilterChip label={value.genre?.name ?? 'Genre'} active={!!value.genre} onClick={() => setSheet('genre')} />
        <FilterChip label={len.key === 'any' ? 'Length' : len.short} active={len.key !== 'any'} onClick={() => setSheet('length')} />
      </div>

      {sheet &&
        createPortal(
          <div className="sheet-backdrop" onClick={close}>
            <div className="sheet filter-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-handle" />
              {sheet === 'source' && (
                <>
                  <div className="sheet-title">Pick from</div>
                  {SOURCES[value.kind].map((s) => (
                    <OptionRow key={s.key} label={s.label} hint={s.hint} on={value.source === s.key} onClick={() => (set({ source: s.key }), close())} />
                  ))}
                  {sourceNote && <div className="vis-hint" style={{ marginTop: 8 }}>{sourceNote}</div>}
                </>
              )}
              {sheet === 'genre' && (
                <>
                  <div className="sheet-title">Genre</div>
                  <div className="genre-grid">
                    <button className={`genre-opt pressable ${!value.genre ? 'on' : ''}`} onClick={() => (set({ genre: null }), close())}>
                      Any genre
                    </button>
                    {genres.map((g) => (
                      <button key={g.id} className={`genre-opt pressable ${value.genre?.id === g.id ? 'on' : ''}`} onClick={() => (set({ genre: g }), close())}>
                        {g.name}
                      </button>
                    ))}
                  </div>
                  {genres.length === 0 && <div className="vis-hint">Genres couldn’t load — check your connection.</div>}
                </>
              )}
              {sheet === 'length' && (
                <>
                  <div className="sheet-title">{value.kind === 'movie' ? 'Movie length' : 'Episode length'}</div>
                  {LENGTHS[value.kind].map((l) => (
                    <OptionRow key={l.key} label={l.label} on={value.length === l.key} onClick={() => (set({ length: l.key }), close())} />
                  ))}
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button className={`filter-chip ${active ? 'on' : ''}`} onClick={onClick} aria-haspopup="dialog">
      <span>{label}</span>
      <ChevronDown size={14} />
    </button>
  )
}

function OptionRow({ label, hint, on, onClick }: { label: string; hint?: string; on: boolean; onClick: () => void }) {
  return (
    <button className="option-row" role="radio" aria-checked={on} onClick={onClick}>
      <span className="option-row-text">
        <span className="option-row-label">{label}</span>
        {hint && <span className="option-row-hint">{hint}</span>}
      </span>
      <span className={`option-radio ${on ? 'on' : ''}`}>{on && <CheckIcon size={14} />}</span>
    </button>
  )
}
