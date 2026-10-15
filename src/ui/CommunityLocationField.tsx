import { useEffect, useState } from 'react'
import { COUNTRIES, type CommunityLocation } from '../logic/communityTaxonomy'

type Place = [id: number, city: string, state: string]
const placeCache = new Map<string, Place[]>()

function normalized(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim()
}

/** One location only. City names must be selected from GeoNames data. */
export function CommunityLocationField({
  value,
  onChange,
  hideKindChoice = false,
}: {
  value: CommunityLocation
  onChange: (location: CommunityLocation) => void
  hideKindChoice?: boolean
}) {
  const [countryQuery, setCountryQuery] = useState(value.countryName ?? '')
  const [cityQuery, setCityQuery] = useState(value.city ?? '')
  const [places, setPlaces] = useState<Place[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => { if (value.countryCode) setCountryQuery(value.countryName ?? '') }, [value.countryCode, value.countryName])
  useEffect(() => { if (value.placeId) setCityQuery(value.city ?? '') }, [value.placeId, value.city])
  useEffect(() => {
    if (value.kind !== 'city' || !value.countryCode) {
      setPlaces([])
      return
    }
    const code = value.countryCode
    if (placeCache.has(code)) {
      setPlaces(placeCache.get(code)!)
      setLoadError(false)
      return
    }
    let alive = true
    setLoading(true)
    setLoadError(false)
    void fetch(`${import.meta.env.BASE_URL}places/${code}.json`)
      .then((response) => {
        if (response.status === 404) return [] as Place[]
        if (!response.ok) throw new Error('places unavailable')
        return response.json() as Promise<Place[]>
      })
      .then((rows) => {
        placeCache.set(code, rows)
        if (alive) setPlaces(rows)
      })
      .catch(() => { if (alive) setLoadError(true) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [value.kind, value.countryCode, retry])

  const countryMatches = countryQuery.trim() && !value.countryCode
    ? COUNTRIES.filter((c) => normalized(`${c.name} ${c.code}`).includes(normalized(countryQuery))).slice(0, 8)
    : []
  const term = normalized(cityQuery)
  const cityMatches = value.kind === 'city' && value.countryCode && !value.placeId && term.length >= 2
    ? places.filter((place) => normalized(`${place[1]} ${place[2]}`).includes(term)).slice(0, 20)
    : []

  return (
    <div className="community-location-field">
      {!hideKindChoice && <div className="field-label">Location</div>}
      {!hideKindChoice && <div className="vis-choice" role="group" aria-label="Community location">
        {(['global', 'country', 'city'] as const).map((kind) => (
          <button key={kind} type="button" className={`vis-opt pressable ${value.kind === kind ? 'on' : ''}`}
            aria-pressed={value.kind === kind}
            onClick={() => {
              if (kind === 'global') { setCountryQuery(''); setCityQuery('') }
              onChange(kind === 'global' ? { kind } : kind === 'country'
                ? { kind, countryCode: value.countryCode, countryName: value.countryName }
                : { ...value, kind })
            }}>
            {kind === 'global' ? 'Global' : kind === 'country' ? 'Country' : 'City'}
          </button>
        ))}
      </div>}
      {value.kind !== 'global' && (
        <>
          <label className="field-label" htmlFor="community-country">Country</label>
          <input id="community-country" className="sync-input" autoComplete="off" value={countryQuery}
            placeholder="Search countries" aria-label="Search countries"
            onChange={(e) => {
              setCountryQuery(e.target.value)
              onChange({ kind: value.kind })
            }} />
          {countryMatches.length > 0 && (
            <div className="community-location-results" role="listbox" aria-label="Countries">
              {countryMatches.map((c) => (
                <button key={c.code} type="button" role="option" aria-selected={false}
                  className="community-location-result pressable"
                  onClick={() => {
                    setCountryQuery(c.name)
                    setCityQuery('')
                    onChange({ kind: value.kind, countryCode: c.code, countryName: c.name })
                  }}>
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {value.kind === 'city' && value.countryCode && (
        <>
          <label className="field-label" htmlFor="community-city">City</label>
          <input id="community-city" className="sync-input" autoComplete="off" value={cityQuery}
            placeholder="Search cities" aria-label="Search cities"
            onChange={(e) => {
              setCityQuery(e.target.value)
              onChange({ kind: 'city', countryCode: value.countryCode, countryName: value.countryName })
            }} />
          {loading && <div className="vis-hint">Loading cities…</div>}
          {loadError && <button type="button" className="auth-link" onClick={() => setRetry((n) => n + 1)}>Cities couldn’t load. Try again</button>}
          {!loading && !loadError && term.length >= 2 && !value.placeId && cityMatches.length === 0 && (
            <div className="vis-hint">No matching city in this country.</div>
          )}
          {cityMatches.length > 0 && (
            <div className="community-location-results" role="listbox" aria-label="Cities">
              {cityMatches.map(([id, city, state]) => (
                <button key={id} type="button" role="option" aria-selected={false}
                  className="community-location-result pressable"
                  onClick={() => onChange({ ...value, city, adminName: state, placeId: id })}>
                  {city}{state ? `, ${state}` : ''}, {value.countryName}
                </button>
              ))}
            </div>
          )}
          <div className="vis-hint">Choose a city from the results. Place names by <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a>.</div>
        </>
      )}
      {value.kind === 'global' && <div className="vis-hint">For communities without a physical location.</div>}
    </div>
  )
}
