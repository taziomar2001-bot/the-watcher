import type { Community, CommunityContentType, CommunityDiscoveryFilters, CommunityLocationKind } from '../data/communities'

export const COMMUNITY_CONTENT_TYPES: { key: CommunityContentType; label: string }[] = [
  { key: 'show', label: 'TV Shows' },
  { key: 'movie', label: 'Movies' },
]

export interface CommunityLocation {
  kind: CommunityLocationKind
  countryCode?: string
  countryName?: string
  city?: string
  placeId?: number
  adminName?: string
}

export function validCommunityLocation(location: CommunityLocation): boolean {
  return location.kind === 'global' ||
    (!!location.countryCode && !!location.countryName &&
      (location.kind === 'country' || (!!location.placeId && (location.city ?? '').trim().length >= 1)))
}

export function contentTypesLabel(types?: CommunityContentType[]): string {
  const chosen = COMMUNITY_CONTENT_TYPES.filter((t) => types?.includes(t.key))
  return chosen.length === 0 || chosen.length === COMMUNITY_CONTENT_TYPES.length
    ? 'General'
    : chosen.map((t) => t.label).join(' · ')
}

export function communityLocation(c: Pick<Community, 'location_kind' | 'location_country_name' | 'location_city' | 'location_admin_name'>): string {
  if (c.location_kind === 'city' && c.location_city) return [c.location_city, c.location_admin_name, c.location_country_name].filter(Boolean).join(', ')
  if (c.location_kind === 'country') return c.location_country_name || 'Country'
  return 'Global'
}

export function matchesCommunityFilters(c: Community, filters: CommunityDiscoveryFilters): boolean {
  if (filters.contentType && !(c.content_types ?? ['show', 'movie']).includes(filters.contentType)) return false
  if (filters.location?.kind === 'global') return !c.location_kind || c.location_kind === 'global'
  if (filters.location?.countryCode && c.location_country_code !== filters.location.countryCode) return false
  if (filters.location?.kind === 'city' && filters.location.placeId &&
      c.location_place_id !== filters.location.placeId) return false
  return true
}

export function communitySearchText(c: Community): string {
  return [c.name, c.description, c.topic_title, contentTypesLabel(c.content_types), communityLocation(c)]
    .filter(Boolean).join(' ').toLocaleLowerCase()
}

// ISO 3166-1 alpha-2 codes. DisplayNames provides the current localized names.
const COUNTRY_CODES = (
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FK FM FO FR ' +
  'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM ' +
  'JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP ' +
  'MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY ' +
  'QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO ' +
  'TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW'
).split(' ')

export const COUNTRIES = (() => {
  const names = new Intl.DisplayNames(['en'], { type: 'region' })
  return COUNTRY_CODES.map((code) => ({ code, name: names.of(code) || code }))
    .sort((a, b) => a.name.localeCompare(b.name))
})()
