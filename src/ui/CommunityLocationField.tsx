import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, CheckIcon } from '../components/Icons'
import { SearchField } from './primitives'
import { COUNTRIES, type CommunityLocation } from '../logic/communityTaxonomy'
import { FormRow } from './FormRows'

// ---------------------------------------------------------------------------
// Location: Global, a country, or a city. One search box finds both cities
// ("Casablanca, Morocco") and countries; smaller towns can be browsed per
// country. City data from GeoNames (public/places).
// ---------------------------------------------------------------------------

type Place = [id: number, city: string, state: string]
type IndexRow = [id: number, city: string, state: string, cc: string]
interface Hit {
  id: number
  city: string
  state: string
  cc: string
  rank: number
  n: string // normalized name, computed once
}

const placeCache = new Map<string, Place[]>()
let indexCache: Hit[] | null = null
let indexLoading: Promise<Hit[]> | null = null
const countryName = new Map(COUNTRIES.map((c) => [c.code, c.name]))

export function normalized(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase().trim()
}

function loadIndex(): Promise<Hit[]> {
  if (indexCache) return Promise.resolve(indexCache)
  if (!indexLoading)
    indexLoading = fetch(`${import.meta.env.BASE_URL}places/index.json`)
      .then((r) => {
        if (!r.ok) throw new Error('index unavailable')
        return r.json() as Promise<IndexRow[]>
      })
      .then((rows) => {
        // Rows are grouped by country, biggest first: position = size rank.
        const out: Hit[] = []
        let cc = ''
        let rank = 0
        for (const [id, city, state, c] of rows) {
          if (c !== cc) {
            cc = c
            rank = 0
          }
          out.push({ id, city, state, cc: c, rank: rank++, n: normalized(city) })
        }
        indexCache = out
        return out
      })
      .catch((e) => {
        indexLoading = null
        throw e
      })
  return indexLoading
}

async function loadCountry(code: string): Promise<Place[]> {
  if (placeCache.has(code)) return placeCache.get(code)!
  const response = await fetch(`${import.meta.env.BASE_URL}places/${code}.json`)
  if (response.status === 404) return []
  if (!response.ok) throw new Error('places unavailable')
  const rows = (await response.json()) as Place[]
  placeCache.set(code, rows)
  return rows
}

/** "Casablanca, Morocco" · "Morocco" · "Global" (or "Anywhere" for filters). */
export function locationLabel(v: CommunityLocation | undefined, anyLabel = 'Global'): string {
  if (!v) return anyLabel
  if (v.kind === 'city' && v.city) return `${v.city}, ${v.countryName ?? ''}`.replace(/, $/, '')
  if (v.kind === 'country' && v.countryName) return v.countryName
  return v.kind === 'global' ? 'Global' : anyLabel
}

/** A settings-style row that opens the location drawer. */
export function CommunityLocationField({
  value,
  onChange,
  allowAny,
}: {
  value: CommunityLocation | undefined
  onChange: (location: CommunityLocation | undefined) => void
  /** Filters: "Anywhere" (no location filter) is an option. */
  allowAny?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <FormRow label="Location" value={locationLabel(value, allowAny ? 'Anywhere' : 'Global')} onClick={() => setOpen(true)} />
      {open && (
        <LocationDrawer
          value={value}
          allowAny={allowAny}
          onClose={() => setOpen(false)}
          onPick={(v) => {
            onChange(v)
            setOpen(false)
          }}
        />
      )}
    </>
  )
}

function LocationDrawer({
  value,
  allowAny,
  onPick,
  onClose,
}: {
  value: CommunityLocation | undefined
  allowAny?: boolean
  onPick: (v: CommunityLocation | undefined) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [index, setIndex] = useState<Hit[] | null>(indexCache)
  const [failed, setFailed] = useState(false)
  const [browse, setBrowse] = useState<null | { code: string; name: string }>(null)
  const [browseQ, setBrowseQ] = useState('')
  const [places, setPlaces] = useState<Place[] | null>(null)

  useEffect(() => {
    let alive = true
    loadIndex()
      .then((i) => alive && setIndex(i))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [])
  useEffect(() => {
    if (!browse) return
    let alive = true
    setPlaces(placeCache.get(browse.code) ?? null)
    loadCountry(browse.code)
      .then((p) => alive && setPlaces(p))
      .catch(() => alive && setPlaces([]))
    return () => {
      alive = false
    }
  }, [browse])

  const term = normalized(q)
  const countries = useMemo(() => (term ? COUNTRIES.filter((c) => normalized(c.name).includes(term)).slice(0, 6) : []), [term])
  const cities = useMemo(() => {
    if (!index || term.length < 2) return []
    const starts: Hit[] = []
    const contains: Hit[] = []
    for (const h of index) {
      if (h.n.startsWith(term)) starts.push(h)
      else if (h.n.includes(term)) contains.push(h)
    }
    const byRank = (a: Hit, b: Hit) => a.rank - b.rank
    return [...starts.sort(byRank), ...contains.sort(byRank)].slice(0, 30)
  }, [index, term])
  const bterm = normalized(browseQ)
  const browsed = useMemo(() => {
    if (!places) return []
    if (!bterm) return places.slice(0, 80)
    // Town names first, then towns whose region matches.
    const byName = places.filter((p) => normalized(p[1]).includes(bterm))
    const byRegion = places.filter((p) => !normalized(p[1]).includes(bterm) && normalized(p[2]).includes(bterm))
    return [...byName, ...byRegion].slice(0, 80)
  }, [places, bterm])

  const pickCity = (id: number, city: string, state: string, cc: string) =>
    onPick({ kind: 'city', placeId: id, city, adminName: state, countryCode: cc, countryName: countryName.get(cc) ?? cc })
  const sel = (k: string) => (value === undefined ? k === 'any' : value.kind === 'global' ? k === 'global' : value.kind === 'country' ? k === `c:${value.countryCode}` : k === `p:${value.placeId}`)

  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet place-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Choose a location">
        <div className="sheet-handle" />
        {browse ? (
          <>
            <div className="place-sheet-head">
              <button type="button" className="place-back pressable" onClick={() => setBrowse(null)} aria-label="Back to search">
                <ChevronLeft size={18} /> {browse.name}
              </button>
            </div>
            <SearchField value={browseQ} onChange={setBrowseQ} placeholder={`Search towns in ${browse.name}`} autoFocus />
            <div className="place-list">
              <button type="button" className="place-item pressable" onClick={() => onPick({ kind: 'country', countryCode: browse.code, countryName: browse.name })}>
                <span className="place-item-text">
                  <span>All of {browse.name}</span>
                  <span className="place-item-sub">Country-wide community</span>
                </span>
                {sel(`c:${browse.code}`) && <CheckIcon size={16} />}
              </button>
              {places === null
                ? Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton" style={{ height: 44, borderRadius: 10, margin: '6px 0' }} />)
                : browsed.map(([id, city, state]) => (
                    <button key={id} type="button" className="place-item pressable" onClick={() => pickCity(id, city, state, browse.code)}>
                      <span className="place-item-text">
                        <span>{city}</span>
                        {state && <span className="place-item-sub">{state}</span>}
                      </span>
                      {sel(`p:${id}`) && <CheckIcon size={16} />}
                    </button>
                  ))}
              <div className="vis-hint place-credit">
                Place names by <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a>.
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="place-sheet-head">
              <span className="sheet-title" style={{ margin: 0 }}>
                Location
              </span>
            </div>
            <SearchField value={q} onChange={setQ} placeholder="Search a city or country" autoFocus />
            <div className="place-list">
              {!term && (
                <>
                  {allowAny && <Option label="Anywhere" sub="Don’t filter by location" on={sel('any')} onClick={() => onPick(undefined)} />}
                  <Option label="Global" sub="Not tied to a place" on={sel('global')} onClick={() => onPick({ kind: 'global' })} />
                  {value && value.kind !== 'global' && (
                    <Option label={locationLabel(value)} sub={value.kind === 'city' ? value.adminName || 'City' : 'Country'} on onClick={() => onPick(value)} />
                  )}
                  <div className="vis-hint place-tip">Type a city — like “Casablanca” — or a country.</div>
                </>
              )}
              {term && (
                <>
                  {cities.length > 0 && <div className="place-section">Cities</div>}
                  {cities.map((h) => (
                    <button key={h.id} type="button" className="place-item pressable" onClick={() => pickCity(h.id, h.city, h.state, h.cc)}>
                      <span className="place-item-text">
                        <span>
                          {h.city}, {countryName.get(h.cc) ?? h.cc}
                        </span>
                        {h.state && <span className="place-item-sub">{h.state}</span>}
                      </span>
                      {sel(`p:${h.id}`) && <CheckIcon size={16} />}
                    </button>
                  ))}
                  {countries.length > 0 && <div className="place-section">Countries</div>}
                  {countries.map((c) => (
                    <div key={c.code} className="place-country">
                      <button type="button" className="place-item pressable" onClick={() => onPick({ kind: 'country', countryCode: c.code, countryName: c.name })}>
                        <span className="place-item-text">
                          <span>{c.name}</span>
                          <span className="place-item-sub">Country-wide</span>
                        </span>
                        {sel(`c:${c.code}`) && <CheckIcon size={16} />}
                      </button>
                      <button type="button" className="place-browse pressable" onClick={() => (setBrowse({ code: c.code, name: c.name }), setBrowseQ(''))} aria-label={`Browse towns in ${c.name}`}>
                        Towns <ChevronRight size={14} />
                      </button>
                    </div>
                  ))}
                  {!index && !failed && term.length >= 2 && Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton" style={{ height: 44, borderRadius: 10, margin: '6px 0' }} />)}
                  {failed && <div className="vis-hint place-empty">Cities couldn’t load — check your connection.</div>}
                  {index && cities.length === 0 && countries.length === 0 && (
                    <div className="vis-hint place-empty">{term.length < 2 ? 'Keep typing…' : `No place matches “${q}”. Small town? Search its country, then tap Towns.`}</div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

function Option({ label, sub, on, onClick }: { label: string; sub?: string; on?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="place-item pressable" onClick={onClick}>
      <span className="place-item-text">
        <span>{label}</span>
        {sub && <span className="place-item-sub">{sub}</span>}
      </span>
      {on && <CheckIcon size={16} />}
    </button>
  )
}
