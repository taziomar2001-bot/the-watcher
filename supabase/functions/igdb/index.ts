// The Watcher — IGDB proxy (Supabase Edge Function, Deno).
//
// IGDB (https://api-docs.igdb.com) only accepts a Twitch app token, made from a
// client secret that must never reach the browser. This function keeps both on
// the server, turns the app's simple requests into IGDB queries, and caches the
// answers so the 4-requests-per-second IGDB limit is never a problem.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET   (from dev.twitch.tv/console/apps)
//   ALLOWED_ORIGINS (optional)               e.g. https://your-site.netlify.app
//
// Requests (GET):  ?op=search&q=…   ?op=game&id=…   ?op=ids&ids=1,2,3
//                  ?op=discover      ?op=genres      ?op=page&genre=12&min=10&max=30&page=1
// Only public catalogue data passes through here; nothing about users.

const CLIENT_ID = Deno.env.get('TWITCH_CLIENT_ID') ?? ''
const CLIENT_SECRET = Deno.env.get('TWITCH_CLIENT_SECRET') ?? ''
const ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const IGDB = 'https://api.igdb.com/v4'

// ---- Twitch app token (valid ~60 days; refreshed before it runs out) ----
let token: { value: string; until: number } | null = null
async function appToken(force = false): Promise<string> {
  if (!force && token && Date.now() < token.until) return token.value
  const u = new URL('https://id.twitch.tv/oauth2/token')
  u.searchParams.set('client_id', CLIENT_ID)
  u.searchParams.set('client_secret', CLIENT_SECRET)
  u.searchParams.set('grant_type', 'client_credentials')
  const r = await fetch(u, { method: 'POST' })
  if (!r.ok) throw new Error(`twitch token ${r.status}`)
  const j = (await r.json()) as { access_token: string; expires_in: number }
  token = { value: j.access_token, until: Date.now() + (j.expires_in - 3600) * 1000 }
  return token.value
}

// ---- IGDB calls: at most 4 per second, retried once on 429 / expired token ----
let last = 0
async function slot() {
  const wait = Math.max(0, last + 260 - Date.now())
  last = Date.now() + wait
  if (wait) await new Promise((r) => setTimeout(r, wait))
}
async function igdb<T>(endpoint: string, body: string, retry = true): Promise<T> {
  await slot()
  const r = await fetch(`${IGDB}/${endpoint}`, {
    method: 'POST',
    headers: { 'Client-ID': CLIENT_ID, Authorization: `Bearer ${await appToken()}`, Accept: 'application/json' },
    body,
  })
  if (r.status === 401 && retry) {
    await appToken(true)
    return igdb<T>(endpoint, body, false)
  }
  if (r.status === 429 && retry) {
    await new Promise((res) => setTimeout(res, 600))
    return igdb<T>(endpoint, body, false)
  }
  if (!r.ok) throw new Error(`igdb ${endpoint} ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return (await r.json()) as T
}

// IGDB replaced the old `category` field with `game_type` (same numbers:
// 0 main game, 8 remake, 9 remaster, 10 expanded game). Try the new name and
// fall back to the old one if this account's API still expects it.
let typeField: 'game_type' | 'category' = 'game_type'
const mainGames = () => `${typeField} = (0,8,9,10)`
async function games<T>(body: (types: string) => string): Promise<T> {
  try {
    return await igdb<T>('games', body(mainGames()))
  } catch (e) {
    if (typeField === 'game_type' && /400/.test(String(e))) {
      typeField = 'category'
      return igdb<T>('games', body(mainGames()))
    }
    throw e
  }
}

const FIELDS =
  'fields name,summary,first_release_date,cover.image_id,artworks.image_id,screenshots.image_id,genres.name,themes.name,' +
  'platforms.abbreviation,platforms.name,involved_companies.developer,involved_companies.publisher,involved_companies.company.name,' +
  'game_modes.name,total_rating,total_rating_count,hypes;'
const LIST_FIELDS = 'fields name,first_release_date,cover.image_id,genres.name,platforms.abbreviation,platforms.name,total_rating,total_rating_count,summary;'

interface Raw {
  id: number
  name: string
  summary?: string
  first_release_date?: number
  cover?: { image_id: string }
  artworks?: { image_id: string }[]
  screenshots?: { image_id: string }[]
  genres?: { name: string }[]
  themes?: { name: string }[]
  platforms?: { abbreviation?: string; name: string }[]
  involved_companies?: { developer?: boolean; publisher?: boolean; company?: { name: string } }[]
  game_modes?: { name: string }[]
  total_rating?: number
  total_rating_count?: number
}

// Friendlier genre names than IGDB's.
const GENRE_NAMES: Record<string, string> = {
  'Role-playing (RPG)': 'RPG',
  'Real Time Strategy (RTS)': 'Strategy',
  'Turn-based strategy (TBS)': 'Strategy',
  "Hack and slash/Beat 'em up": 'Hack & Slash',
  'Point-and-click': 'Point & Click',
  'Card & Board Game': 'Card & Board',
  'Simulator': 'Simulation',
  'Sport': 'Sports',
  'Quiz/Trivia': 'Trivia',
}
const genreName = (n: string) => GENRE_NAMES[n] ?? n
const PLATFORM_NAMES: Record<string, string> = { 'PC (Microsoft Windows)': 'PC', 'Mac': 'Mac' }
const img = (id: string | undefined, size: string) => (id ? `https://images.igdb.com/igdb/image/upload/t_${size}/${id}.jpg` : undefined)
const iso = (s?: number) => (s ? new Date(s * 1000).toISOString().slice(0, 10) : undefined)

function toGame(g: Raw, full = false) {
  const releaseDate = iso(g.first_release_date)
  const companies = g.involved_companies ?? []
  const platforms = [...new Set((g.platforms ?? []).map((p) => PLATFORM_NAMES[p.name] ?? p.abbreviation ?? p.name))]
  const out: Record<string, unknown> = {
    id: String(g.id),
    type: 'game',
    title: g.name,
    poster: img(g.cover?.image_id, 'cover_big'),
    overview: g.summary ?? '',
    genres: [...new Set((g.genres ?? []).map((x) => genreName(x.name)))].slice(0, 4),
    platforms,
    releaseDate,
    year: releaseDate ? Number(releaseDate.slice(0, 4)) : undefined,
    communityRating: g.total_rating ? Math.round(g.total_rating) / 10 : undefined,
    communityVotes: g.total_rating_count,
  }
  if (full) {
    out.backdrop = img(g.artworks?.[0]?.image_id ?? g.screenshots?.[0]?.image_id, 'screenshot_big')
    out.developer = companies.find((c) => c.developer)?.company?.name
    out.publisher = companies.find((c) => c.publisher)?.company?.name
    out.modes = (g.game_modes ?? []).map((m) => m.name)
  }
  return out
}

const hours = (s?: number) => (s ? Math.round((s / 3600) * 2) / 2 : undefined)

// ---- Operations ----
const now = () => Math.floor(Date.now() / 1000)

async function opSearch(q: string) {
  const safe = q.replace(/["\\]/g, ' ').slice(0, 80)
  const rows = await games<Raw[]>((t) => `${LIST_FIELDS} search "${safe}"; where ${t} & version_parent = null; limit 25;`)
  return rows.map((g) => toGame(g))
}

async function opGame(id: string) {
  const n = Number(id)
  if (!Number.isInteger(n) || n <= 0) return null
  const [rows, ttb] = await Promise.all([
    igdb<Raw[]>('games', `${FIELDS} where id = ${n}; limit 1;`),
    igdb<{ hastily?: number; normally?: number; completely?: number }[]>('game_time_to_beats', `fields hastily,normally,completely,count; where game_id = ${n}; limit 1;`).catch(() => []),
  ])
  if (!rows[0]) return null
  const g = toGame(rows[0], true)
  const t = ttb[0]
  if (t && (t.hastily || t.normally || t.completely)) g.timeToBeat = { hastily: hours(t.hastily), normally: hours(t.normally), completely: hours(t.completely) }
  return g
}

async function opIds(ids: string) {
  const list = ids.split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 100)
  if (!list.length) return []
  const rows = await igdb<Raw[]>('games', `${LIST_FIELDS} where id = (${list.join(',')}); limit ${list.length};`)
  return rows.map((g) => toGame(g))
}

async function opGenres() {
  const rows = await igdb<{ id: number; name: string }[]>('genres', 'fields name; limit 60; sort name asc;')
  // Merge IGDB genres that share a friendly name (RTS + TBS → Strategy).
  const byName = new Map<string, number[]>()
  for (const r of rows) {
    const n = genreName(r.name)
    byName.set(n, [...(byName.get(n) ?? []), r.id])
  }
  return [...byName.entries()].map(([name, ids]) => ({ id: ids[0], name, ids })).sort((a, b) => a.name.localeCompare(b.name))
}

async function multi(queries: { name: string; endpoint: string; body: string }[]) {
  const body = queries.map((q) => `query ${q.endpoint} "${q.name}" { ${q.body} };`).join('\n')
  return igdb<{ name: string; result: Raw[] }[]>('multiquery', body)
}

async function opDiscover() {
  const t = now()
  const run = (types: string) =>
    multi([
      { name: 'new', endpoint: 'games', body: `${LIST_FIELDS} where ${types} & cover != null & first_release_date >= ${t - 75 * 86400} & first_release_date <= ${t} & total_rating_count > 2; sort total_rating_count desc; limit 30;` },
      { name: 'soon', endpoint: 'games', body: `${LIST_FIELDS} where ${types} & cover != null & first_release_date > ${t} & hypes > 3; sort first_release_date asc; limit 30;` },
      { name: 'anticipated', endpoint: 'games', body: `${LIST_FIELDS} where ${types} & cover != null & first_release_date > ${t}; sort hypes desc; limit 30;` },
      { name: 'top', endpoint: 'games', body: `${LIST_FIELDS} where ${types} & cover != null & total_rating_count > 400; sort total_rating desc; limit 30;` },
      { name: 'popular', endpoint: 'games', body: `${LIST_FIELDS} where ${types} & cover != null & first_release_date >= ${t - 3 * 365 * 86400} & total_rating_count > 50; sort total_rating_count desc; limit 30;` },
    ])
  let res
  try {
    res = await run(mainGames())
  } catch (e) {
    if (typeField !== 'game_type' || !/400/.test(String(e))) throw e
    typeField = 'category'
    res = await run(mainGames())
  }
  const get = (n: string) => (res.find((r) => r.name === n)?.result ?? []).map((g) => toGame(g))
  // "Trending" = most visited on IGDB right now (popularity primitives).
  let trending: unknown[] = []
  try {
    const pop = await igdb<{ game_id: number }[]>('popularity_primitives', 'fields game_id,value; where popularity_type = 1; sort value desc; limit 30;')
    if (pop.length) trending = await opIds(pop.map((p) => p.game_id).join(','))
    const order = new Map(pop.map((p, i) => [String(p.game_id), i]))
    trending.sort((a, b) => (order.get((a as { id: string }).id) ?? 99) - (order.get((b as { id: string }).id) ?? 99))
  } catch {
    trending = []
  }
  return [
    { key: 'trending', title: 'Trending', items: trending.length ? trending : get('popular') },
    { key: 'new', title: 'New Releases', items: get('new') },
    { key: 'soon', title: 'Coming Soon', items: get('soon') },
    { key: 'anticipated', title: 'Most Anticipated', items: get('anticipated') },
    { key: 'top', title: 'All-time Greats', items: get('top') },
  ].filter((s) => s.items.length)
}

async function opPage(genreIds: number[], min: number | undefined, max: number | undefined, page: number) {
  const per = 30
  const genre = genreIds.length ? ` & genres = (${genreIds.join(',')})` : ''
  let idFilter = ''
  if (min || max) {
    const conds = [min ? `normally >= ${min * 3600}` : '', max ? `normally <= ${max * 3600}` : ''].filter(Boolean).join(' & ')
    const ttb = await igdb<{ game_id: number }[]>('game_time_to_beats', `fields game_id; where ${conds} & count >= 3; sort count desc; limit 500;`)
    if (!ttb.length) return { items: [], totalPages: 1 }
    idFilter = ` & id = (${ttb.map((x) => x.game_id).join(',')})`
  }
  const rows = await games<Raw[]>(
    (t) => `${LIST_FIELDS} where ${t} & cover != null & total_rating_count > 15${genre}${idFilter}; sort total_rating_count desc; limit ${per}; offset ${(page - 1) * per};`,
  )
  return { items: rows.map((g) => toGame(g)), totalPages: rows.length < per ? page : Math.min(12, page + 3) }
}

// ---- Small in-memory cache (per function instance) ----
const memo = new Map<string, { until: number; body: string }>()
async function cachedJson(key: string, ttlSec: number, run: () => Promise<unknown>): Promise<string> {
  const hit = memo.get(key)
  if (hit && Date.now() < hit.until) return hit.body
  const body = JSON.stringify(await run())
  memo.set(key, { until: Date.now() + ttlSec * 1000, body })
  if (memo.size > 800) memo.delete(memo.keys().next().value!)
  return body
}

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const allow = ORIGINS.length === 0 ? '*' : ORIGINS.includes(origin) ? origin : ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    Vary: 'Origin',
  }
}

Deno.serve(async (req) => {
  const headers = cors(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405, headers })
  if (!CLIENT_ID || !CLIENT_SECRET) return new Response(JSON.stringify({ error: 'not_configured' }), { status: 503, headers: { ...headers, 'Content-Type': 'application/json' } })
  const u = new URL(req.url)
  const op = u.searchParams.get('op') ?? ''
  try {
    let ttl = 3600
    let body: string
    switch (op) {
      case 'search': {
        const q = (u.searchParams.get('q') ?? '').trim()
        ttl = 600
        body = q ? await cachedJson('s:' + q.toLowerCase(), ttl, () => opSearch(q)) : '[]'
        break
      }
      case 'game': {
        const id = u.searchParams.get('id') ?? ''
        ttl = 6 * 3600
        body = await cachedJson('g:' + id, ttl, () => opGame(id))
        break
      }
      case 'ids': {
        const ids = u.searchParams.get('ids') ?? ''
        ttl = 6 * 3600
        body = await cachedJson('i:' + ids, ttl, () => opIds(ids))
        break
      }
      case 'discover':
        body = await cachedJson('d', ttl, opDiscover)
        break
      case 'genres':
        ttl = 24 * 3600
        body = await cachedJson('genres', ttl, opGenres)
        break
      case 'page': {
        const genreIds = (u.searchParams.get('genre') ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0)
        const min = Number(u.searchParams.get('min')) || undefined
        const max = Number(u.searchParams.get('max')) || undefined
        const page = Math.max(1, Math.min(20, Number(u.searchParams.get('page')) || 1))
        body = await cachedJson(`p:${genreIds}:${min}:${max}:${page}`, ttl, () => opPage(genreIds, min, max, page))
        break
      }
      default:
        return new Response(JSON.stringify({ error: 'unknown_op' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } })
    }
    return new Response(body, { headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${Math.min(ttl, 3600)}` } })
  } catch (e) {
    console.error(e)
    return new Response(JSON.stringify({ error: 'upstream' }), { status: 502, headers: { ...headers, 'Content-Type': 'application/json' } })
  }
})
