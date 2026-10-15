import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, CheckIcon } from '../components/Icons'
import { SearchField } from './primitives'
import { COUNTRIES, type CommunityLocation } from '../logic/communityTaxonomy'

type Place = [id: number, city: string, state: string]
const placeCache = new Map<string, Place[]>()

function normalized(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase().trim()
}

async function loadPlaces(code: string): Promise<Place[]> {
  if (placeCache.has(code)) return placeCache.get(code)!
  const response = await fetch(`${import.meta.env.BASE_URL}places/${code}.json`)
  if (response.status === 404) return []
  if (!response.ok) throw new Error('places unavailable')
  const rows = (await response.json()) as Place[]
  placeCache.set(code, rows)
  return rows
}

/**
 * Where a community is: Global, a country, or a city. Choosing opens a drawer
 * with a search box — for a city you pick its country first, then the city
 * (cities are listed per country, biggest first).
 */
export function CommunityLocationField({
  value,
  onChange,
  hideKindChoice = false,
}: {
  value: CommunityLocation
  onChange: (location: CommunityLocation) => void
  hideKindChoice?: boolean
}) {
  const [sheet, setSheet] = useState<null | 'country' | 'city'>(null)

  const setKind = (kind: CommunityLocation['kind']) => {
    if (kind === 'global') return onChange({ kind })
    if (kind === 'country') return onChange({ kind, countryCode: value.countryCode, countryName: value.countryName })
    onChange({ kind, countryCode: value.countryCode, countryName: value.countryName })
  }

  const cityLabel = value.placeId ? [value.city, value.adminName].filter(Boolean).join(', ') : undefined

  return (
    <div className="community-location-field">
      {!hideKindChoice && (
        <>
          <div className="field-label">Location</div>
          <div className="vis-choice" role="radiogroup" aria-label="Community location">
            {(['global', 'country', 'city'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={value.kind === kind}
                className={`vis-opt pressable ${value.kind === kind ? 'on' : ''}`}
                onClick={() => setKind(kind)}
              >
                {kind === 'global' ? 'Global' : kind === 'country' ? 'Country' : 'City'}
              </button>
            ))}
          </div>
        </>
      )}
      {value.kind === 'global' && <div className="vis-hint">For communities without a physical location.</div>}
      {value.kind === 'country' && (
        <PickerRow label="Country" value={value.countryName} placeholder="Choose a country" onClick={() => setSheet('country')} />
      )}
      {value.kind === 'city' && (
        <PickerRow
          label="City"
          value={cityLabel ? `${cityLabel}` : undefined}
          sub={cityLabel ? value.countryName : undefined}
          placeholder="Choose a city"
          onClick={() => setSheet(value.countryCode ? 'city' : 'country')}
        />
      )}

      {sheet && (
        <PlaceSheet
          step={sheet}
          kind={value.kind}
          value={value}
          onStep={setSheet}
          onClose={() => setSheet(null)}
          onPickCountry={(code, name) => {
            if (value.kind === 'city') {
              onChange({ kind: 'city', countryCode: code, countryName: name })
              setSheet('city')
            } else {
              onChange({ kind: 'country', countryCode: code, countryName: name })
              setSheet(null)
            }
          }}
          onPickCity={([id, city, state]) => {
            onChange({ kind: 'city', countryCode: value.countryCode, countryName: value.countryName, city, adminName: state, placeId: id })
            setSheet(null)
          }}
        />
      )}
    </div>
  )
}

function PickerRow({ label, value, sub, placeholder, onClick }: { label: string; value?: string; sub?: string; placeholder: string; onClick: () => void }) {
  return (
    <button type="button" className="picker-row pressable" onClick={onClick}>
      <span className="picker-row-text">
        <span className="picker-row-label">{label}</span>
        <span className={`picker-row-value ${value ? '' : 'is-empty'}`}>{value ?? placeholder}</span>
        {sub && <span className="picker-row-sub">{sub}</span>}
      </span>
      <ChevronRight size={18} />
    </button>
  )
}

function PlaceSheet({
  step,
  kind,
  value,
  onStep,
  onClose,
  onPickCountry,
  onPickCity,
}: {
  step: 'country' | 'city'
  kind: CommunityLocation['kind']
  value: CommunityLocation
  onStep: (s: 'country' | 'city') => void
  onClose: () => void
  onPickCountry: (code: string, name: string) => void
  onPickCity: (p: Place) => void
}) {
  const [q, setQ] = useState('')
  const [places, setPlaces] = useState<Place[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setQ('')
    listRef.current?.scrollTo(0, 0)
  }, [step])

  useEffect(() => {
    if (step !== 'city' || !value.countryCode) return
    let alive = true
    setPlaces(placeCache.get(value.countryCode) ?? null)
    setFailed(false)
    loadPlaces(value.countryCode)
      .then((rows) => alive && setPlaces(rows))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [step, value.countryCode, retry])

  const term = normalized(q)
  const countries = useMemo(() => (term ? COUNTRIES.filter((c) => normalized(`${c.name} ${c.code}`).includes(term)) : COUNTRIES), [term])
  const cities = useMemo(() => {
    if (!places) return []
    const list = term ? places.filter((p) => normalized(`${p[1]} ${p[2]}`).includes(term)) : places
    return list.slice(0, 60)
  }, [places, term])

  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet place-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={step === 'country' ? 'Choose a country' : 'Choose a city'}>
        <div className="sheet-handle" />
        <div className="place-sheet-head">
          {step === 'city' ? (
            <button type="button" className="place-back pressable" onClick={() => onStep('country')} aria-label="Change country">
              <ChevronLeft size={18} /> {value.countryName}
            </button>
          ) : (
            <span className="sheet-title" style={{ margin: 0 }}>
              {kind === 'city' ? 'Which country is the city in?' : 'Choose a country'}
            </span>
          )}
          {kind === 'city' && (
            <span className="place-steps" aria-hidden="true">
              <i className={step === 'country' ? 'on' : 'done'} />
              <i className={step === 'city' ? 'on' : ''} />
            </span>
          )}
        </div>
        <SearchField value={q} onChange={setQ} placeholder={step === 'country' ? 'Search countries' : `Search cities in ${value.countryName ?? 'this country'}`} autoFocus />
        <div className="place-list" ref={listRef}>
          {step === 'country' ? (
            countries.length === 0 ? (
              <div className="vis-hint place-empty">No country matches “{q}”.</div>
            ) : (
              countries.map((c) => (
                <button key={c.code} type="button" className="place-item pressable" onClick={() => onPickCountry(c.code, c.name)}>
                  <span>{c.name}</span>
                  {value.countryCode === c.code ? <CheckIcon size={16} /> : kind === 'city' ? <ChevronRight size={16} /> : null}
                </button>
              ))
            )
          ) : failed ? (
            <div className="place-empty">
              <div className="vis-hint">Cities couldn’t load.</div>
              <button type="button" className="auth-link" onClick={() => setRetry((n) => n + 1)}>
                Try again
              </button>
            </div>
          ) : places === null ? (
            Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton" style={{ height: 44, borderRadius: 10, margin: '6px 0' }} />)
          ) : cities.length === 0 ? (
            <div className="vis-hint place-empty">{term ? `No city matches “${q}” in ${value.countryName}.` : `No cities listed for ${value.countryName}.`}</div>
          ) : (
            <>
              {!term && <div className="place-section">Largest cities</div>}
              {cities.map((p) => (
                <button key={p[0]} type="button" className="place-item pressable" onClick={() => onPickCity(p)}>
                  <span className="place-item-text">
                    <span>{p[1]}</span>
                    {p[2] && <span className="place-item-sub">{p[2]}</span>}
                  </span>
                  {value.placeId === p[0] && <CheckIcon size={16} />}
                </button>
              ))}
            </>
          )}
          {step === 'city' && <div className="vis-hint place-credit">Place names by <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a>.</div>}
        </div>
      </div>
    </div>,
    document.body,
  )
}
