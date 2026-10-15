// Build public/places/index.json — the worldwide city search index — from the
// per-country files (each already sorted biggest first). Keeps each country's
// 150 largest places: [id, city, region, countryCode], grouped by country in
// size order (the app uses that order as a size rank).
// Usage: node scripts/build-city-index.mjs   (run after build-community-cities.mjs)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = join('public', 'places')
const out = []
for (const f of readdirSync(dir).sort()) {
  if (!/^[A-Z]{2}\.json$/.test(f)) continue
  const cc = f.slice(0, 2)
  for (const [id, city, state] of JSON.parse(readFileSync(join(dir, f), 'utf8')).slice(0, 150)) out.push([id, city, state, cc])
}
writeFileSync(join(dir, 'index.json'), JSON.stringify(out))
console.log(`Indexed ${out.length} places`)
