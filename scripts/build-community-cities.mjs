// Rebuild the lazy city picker files from the official GeoNames dump.
// Download cities1000.zip and admin1CodesASCII.txt from
// https://download.geonames.org/export/dump/ then extract cities1000.txt.
// Usage: node scripts/build-community-cities.mjs <directory-with-both-txt-files>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const source = process.argv[2]
if (!source) throw new Error('Pass the directory containing cities1000.txt and admin1CodesASCII.txt')
const admin = new Map(readFileSync(join(source, 'admin1CodesASCII.txt'), 'utf8').split('\n')
  .filter(Boolean).map((line) => {
    const [key, name] = line.split('\t')
    return [key, name]
  }))
const byCountry = new Map()
for (const line of readFileSync(join(source, 'cities1000.txt'), 'utf8').split('\n')) {
  if (!line) continue
  const fields = line.split('\t')
  const [id, name, , , , , , , country, , admin1, , , , population] = fields
  if (!/^[A-Z]{2}$/.test(country) || !/^\d+$/.test(id) || !name) continue
  const state = admin.get(`${country}.${admin1}`) ?? ''
  const row = [Number(id), name, state, Number(population) || 0]
  const list = byCountry.get(country) ?? []
  list.push(row)
  byCountry.set(country, list)
}
const out = join('public', 'places')
mkdirSync(out, { recursive: true })
let total = 0
for (const [country, list] of byCountry) {
  list.sort((a, b) => b[3] - a[3] || a[1].localeCompare(b[1]))
  writeFileSync(join(out, `${country}.json`), JSON.stringify(list.map((r) => r.slice(0, 3))))
  total += list.length
}
console.log(`Generated ${total} verified places in ${byCountry.size} country files`)
console.log("Now run: node scripts/build-city-index.mjs")
