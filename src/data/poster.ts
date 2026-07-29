// Generates cinematic placeholder poster / backdrop artwork as SVG data URIs.
// Used when no TMDB key is configured, so the whole UI is fully populated and
// looks good out of the box. Real TMDB images replace these once a key is set.

function hash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

// Curated moody, cinematic hue pairs (deep tones, no bright/pastel).
const PALETTES: [string, string, string][] = [
  ['#1a2740', '#0a0f1c', '#3d5a8a'],
  ['#3a1220', '#120608', '#7a2438'],
  ['#12302a', '#050f0c', '#2f6f5e'],
  ['#2a1a3a', '#0d0714', '#5a3f7a'],
  ['#3a2810', '#140d04', '#8a6320'],
  ['#102a3a', '#04101a', '#2f6a8a'],
  ['#2a2a2e', '#0a0a0c', '#5a5a62'],
  ['#341018', '#100405', '#7a2028'],
  ['#1a2e18', '#080f07', '#3f6a38'],
]

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function initials(title: string): string {
  const words = title.replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

function svgToDataUri(svg: string): string {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}

export function makePoster(title: string): string {
  const h = hash(title)
  const [a, b, c] = PALETTES[h % PALETTES.length]
  const angle = 90 + (h % 60)
  const ini = initials(title)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1" gradientTransform="rotate(${angle} .5 .5)">
<stop offset="0" stop-color="${a}"/>
<stop offset="1" stop-color="${b}"/>
</linearGradient>
<radialGradient id="v" cx="0.5" cy="0.35" r="0.9">
<stop offset="0" stop-color="${c}" stop-opacity="0.55"/>
<stop offset="0.6" stop-color="${c}" stop-opacity="0"/>
</radialGradient>
</defs>
<rect width="300" height="450" fill="url(#g)"/>
<rect width="300" height="450" fill="url(#v)"/>
<text x="150" y="215" font-family="Helvetica, Arial, sans-serif" font-size="150" font-weight="800" fill="#ffffff" fill-opacity="0.10" text-anchor="middle">${esc(ini)}</text>
<rect x="0" y="330" width="300" height="120" fill="#000000" fill-opacity="0.45"/>
<text x="150" y="405" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="700" fill="#ffffff" text-anchor="middle">${esc(title.length > 22 ? title.slice(0, 20) + '…' : title)}</text>
</svg>`
  return svgToDataUri(svg)
}

export function makeBackdrop(title: string): string {
  const h = hash(title + '_bd')
  const [a, b, c] = PALETTES[h % PALETTES.length]
  const angle = 20 + (h % 40)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="780" height="440" viewBox="0 0 780 440">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1" gradientTransform="rotate(${angle} .5 .5)">
<stop offset="0" stop-color="${a}"/>
<stop offset="1" stop-color="${b}"/>
</linearGradient>
<radialGradient id="v" cx="0.35" cy="0.4" r="0.8">
<stop offset="0" stop-color="${c}" stop-opacity="0.6"/>
<stop offset="0.7" stop-color="${c}" stop-opacity="0"/>
</radialGradient>
</defs>
<rect width="780" height="440" fill="url(#g)"/>
<rect width="780" height="440" fill="url(#v)"/>
<text x="60" y="250" font-family="Helvetica, Arial, sans-serif" font-size="150" font-weight="800" fill="#ffffff" fill-opacity="0.06">${esc(initials(title))}</text>
</svg>`
  return svgToDataUri(svg)
}

export function makeStill(title: string, ep: string): string {
  const h = hash(title + ep)
  const [a, b, c] = PALETTES[h % PALETTES.length]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
<radialGradient id="v" cx="0.5" cy="0.4" r="0.9">
<stop offset="0" stop-color="${c}" stop-opacity="0.5"/><stop offset="0.7" stop-color="${c}" stop-opacity="0"/></radialGradient></defs>
<rect width="300" height="200" fill="url(#g)"/><rect width="300" height="200" fill="url(#v)"/></svg>`
  return svgToDataUri(svg)
}
