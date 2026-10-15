import type { TitleMeta } from '../data/tmdb'
import type { LibraryItem, TrackKind, Tracked } from '../store/useLibrary'

/** One watched title with everything the stats need. */
export interface WatchedTitle {
  key: string // "movie:ID" | "show:ID"
  item: LibraryItem
  when?: number // last watched (ms)
  episodes?: number // shows: episodes watched
  mine?: number // personal rating, 1–5 (movies) or episode average (shows)
}

export interface Share {
  name: string
  count: number
  pct: number
}

export interface Insights {
  total: number
  known: number // titles we have facts for
  genres: Share[]
  decades: Share[]
  languages: Share[]
  countries: Share[]
  byYear: { year: number; count: number }[] // watched per calendar year (movies)
  ratings: number[] // count of 1★..5★
  avgMine?: number // stars
  avgPublicOfRated?: number // TMDB /10, for titles you rated
  avgMineOfRated10?: number // your stars ×2, same titles
  highlights: { label: string; value: string; sub?: string }[]
}

const langName = (() => {
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'language' })
    return (code: string) => dn.of(code) ?? code
  } catch {
    return (code: string) => code.toUpperCase()
  }
})()
const countryName = (() => {
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'region' })
    return (code: string) => dn.of(code) ?? code
  } catch {
    return (code: string) => code
  }
})()

function shares(counts: Map<string, number>, total: number, limit: number): Share[] {
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count, pct: total ? Math.round((count / total) * 100) : 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)
}

export function computeInsights(kind: 'movie' | 'show', titles: WatchedTitle[], meta: Record<string, TitleMeta>): Insights {
  const facts = (t: WatchedTitle): TitleMeta | undefined => {
    const m = meta[t.key]
    if (m) return m
    if (t.item.genres?.length || t.item.year) return { g: t.item.genres ?? [], y: t.item.year }
    return undefined
  }
  const known = titles.filter((t) => facts(t))

  const genre = new Map<string, number>()
  const decade = new Map<string, number>()
  const lang = new Map<string, number>()
  const country = new Map<string, number>()
  let withGenre = 0
  let withYear = 0
  let withLang = 0
  let withCountry = 0
  for (const t of known) {
    const f = facts(t)!
    if (f.g.length) {
      withGenre++
      for (const g of new Set(f.g)) genre.set(g, (genre.get(g) ?? 0) + 1)
    }
    if (f.y) {
      withYear++
      const d = `${Math.floor(f.y / 10) * 10}s`
      decade.set(d, (decade.get(d) ?? 0) + 1)
    }
    if (f.l) {
      withLang++
      const n = langName(f.l)
      lang.set(n, (lang.get(n) ?? 0) + 1)
    }
    if (f.c) {
      withCountry++
      const n = countryName(f.c)
      country.set(n, (country.get(n) ?? 0) + 1)
    }
  }

  // Decades in chronological order, including empty ones in between.
  const decadeList: Share[] = []
  const dKeys = [...decade.keys()].map((d) => Number(d.slice(0, 4))).sort((a, b) => a - b)
  if (dKeys.length) {
    for (let d = dKeys[0]; d <= dKeys[dKeys.length - 1]; d += 10) {
      const count = decade.get(`${d}s`) ?? 0
      decadeList.push({ name: `${d}s`, count, pct: withYear ? Math.round((count / withYear) * 100) : 0 })
    }
  }

  // Watched per calendar year (when we know the date).
  const yearCount = new Map<number, number>()
  for (const t of titles) if (t.when) {
    const y = new Date(t.when).getFullYear()
    if (y > 1990) yearCount.set(y, (yearCount.get(y) ?? 0) + 1)
  }
  const years = [...yearCount.keys()].sort((a, b) => a - b)
  const byYear: { year: number; count: number }[] = []
  if (years.length) for (let y = Math.max(years[0], years[years.length - 1] - 9); y <= years[years.length - 1]; y++) byYear.push({ year: y, count: yearCount.get(y) ?? 0 })

  // Ratings.
  const ratings = [0, 0, 0, 0, 0]
  const rated = titles.filter((t) => t.mine != null)
  for (const t of rated) ratings[Math.min(5, Math.max(1, Math.round(t.mine!))) - 1]++
  const avgMine = rated.length ? rated.reduce((n, t) => n + t.mine!, 0) / rated.length : undefined
  const both = rated.filter((t) => facts(t)?.v)
  const avgPublicOfRated = both.length ? both.reduce((n, t) => n + facts(t)!.v!, 0) / both.length : undefined
  const avgMineOfRated10 = both.length ? both.reduce((n, t) => n + t.mine! * 2, 0) / both.length : undefined

  // Highlights.
  const highlights: Insights['highlights'] = []
  const topGenre = shares(genre, withGenre, 1)[0]
  if (topGenre) highlights.push({ label: 'Top genre', value: topGenre.name, sub: `${topGenre.pct}% of ${kind === 'movie' ? 'your movies' : 'your shows'}` })
  const topDecade = [...decadeList].sort((a, b) => b.count - a.count)[0]
  if (topDecade?.count) highlights.push({ label: 'Favourite decade', value: topDecade.name, sub: `${topDecade.pct}% of what you watched` })
  const oldest = known.filter((t) => facts(t)!.y).sort((a, b) => facts(a)!.y! - facts(b)!.y!)[0]
  if (oldest) highlights.push({ label: kind === 'movie' ? 'Oldest movie' : 'Oldest show', value: oldest.item.title, sub: String(facts(oldest)!.y) })
  if (kind === 'show') {
    const most = [...titles].sort((a, b) => (b.episodes ?? 0) - (a.episodes ?? 0))[0]
    if (most?.episodes) highlights.push({ label: 'Most watched show', value: most.item.title, sub: `${most.episodes.toLocaleString()} episodes` })
    const nets = new Map<string, number>()
    for (const t of known) {
      const n = facts(t)!.n
      if (n) nets.set(n, (nets.get(n) ?? 0) + 1)
    }
    const topNet = shares(nets, known.length, 1)[0]
    if (topNet) highlights.push({ label: 'Top network', value: topNet.name, sub: `${topNet.count} shows` })
  } else {
    const nonEnglish = known.filter((t) => facts(t)!.l && facts(t)!.l !== 'en').length
    if (withLang) highlights.push({ label: 'Not in English', value: `${Math.round((nonEnglish / withLang) * 100)}%`, sub: `${nonEnglish} movies` })
    const lens = known.map((t) => facts(t)!.r ?? t.item.runtime).filter((x): x is number => !!x)
    if (lens.length) highlights.push({ label: 'Average length', value: `${Math.round(lens.reduce((a, b) => a + b, 0) / lens.length)} min` })
  }

  return {
    total: titles.length,
    known: known.length,
    genres: shares(genre, withGenre, 10),
    decades: decadeList,
    languages: shares(lang, withLang, 6),
    countries: shares(country, withCountry, 6),
    byYear,
    ratings,
    avgMine,
    avgPublicOfRated,
    avgMineOfRated10,
    highlights,
  }
}

// ---- Books & games ----

export interface TrackInsights extends Insights {
  /** Authors (books) or platforms (games). */
  makers: Share[]
  finished: number
}

/**
 * Stats for books / games from what's saved with each title (genres, year,
 * authors or platforms, pages or hours). Counts every title you've started;
 * "per year" uses the date you marked it finished.
 */
export function computeTrackInsights(kind: TrackKind, all: { id: string; t: Tracked }[]): TrackInsights {
  const started = all.filter((e) => e.t.state)
  const genre = new Map<string, number>()
  const decade = new Map<string, number>()
  const maker = new Map<string, number>()
  let withGenre = 0
  let withYear = 0
  let withMaker = 0
  for (const { t } of started) {
    const g = t.item.genres ?? []
    if (g.length) {
      withGenre++
      for (const x of new Set(g)) genre.set(x, (genre.get(x) ?? 0) + 1)
    }
    if (t.item.year) {
      withYear++
      const d = `${Math.floor(t.item.year / 10) * 10}s`
      decade.set(d, (decade.get(d) ?? 0) + 1)
    }
    const m = kind === 'book' ? (t.item.authors ?? []).slice(0, 1) : t.item.platforms ?? []
    if (m.length) {
      withMaker++
      for (const x of new Set(m)) maker.set(x, (maker.get(x) ?? 0) + 1)
    }
  }
  const decadeList: Share[] = []
  const dKeys = [...decade.keys()].map((d) => Number(d.slice(0, 4))).sort((a, b) => a - b)
  if (dKeys.length)
    for (let d = dKeys[0]; d <= dKeys[dKeys.length - 1]; d += 10) {
      const count = decade.get(`${d}s`) ?? 0
      decadeList.push({ name: `${d}s`, count, pct: withYear ? Math.round((count / withYear) * 100) : 0 })
    }
  const finished = started.filter((e) => e.t.state === 'done')
  const yearCount = new Map<number, number>()
  for (const { t } of finished)
    if (t.finishedAt) {
      const y = new Date(t.finishedAt).getFullYear()
      yearCount.set(y, (yearCount.get(y) ?? 0) + 1)
    }
  const years = [...yearCount.keys()].sort((a, b) => a - b)
  const byYear: { year: number; count: number }[] = []
  if (years.length) for (let y = Math.max(years[0], years[years.length - 1] - 9); y <= years[years.length - 1]; y++) byYear.push({ year: y, count: yearCount.get(y) ?? 0 })

  const ratings = [0, 0, 0, 0, 0]
  const rated = all.filter((e) => e.t.rating != null)
  for (const e of rated) ratings[Math.min(5, Math.max(1, Math.round(e.t.rating!))) - 1]++
  const avgMine = rated.length ? rated.reduce((n, e) => n + e.t.rating!, 0) / rated.length : undefined

  const word = kind === 'book' ? 'books' : 'games'
  const highlights: Insights['highlights'] = []
  const topGenre = shares(genre, withGenre, 1)[0]
  if (topGenre) highlights.push({ label: 'Top genre', value: topGenre.name, sub: `${topGenre.pct}% of your ${word}` })
  const topMaker = shares(maker, withMaker, 1)[0]
  if (topMaker) highlights.push({ label: kind === 'book' ? 'Most-read author' : 'Top platform', value: topMaker.name, sub: `${topMaker.count} ${topMaker.count === 1 ? word.slice(0, -1) : word}` })
  const topDecade = [...decadeList].sort((a, b) => b.count - a.count)[0]
  if (topDecade?.count) highlights.push({ label: 'Favourite decade', value: topDecade.name, sub: `${topDecade.pct}% of your ${word}` })
  const oldest = started.filter((e) => e.t.item.year).sort((a, b) => a.t.item.year! - b.t.item.year!)[0]
  if (oldest) highlights.push({ label: kind === 'book' ? 'Oldest book' : 'Oldest game', value: oldest.t.item.title, sub: String(oldest.t.item.year) })
  const sizes = started.map((e) => (kind === 'book' ? e.t.item.pageCount : e.t.item.ttb)).filter((x): x is number => !!x)
  if (sizes.length)
    highlights.push(
      kind === 'book'
        ? { label: 'Average length', value: `${Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length)} pages` }
        : { label: 'Average time to beat', value: `${Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length)} h` },
    )

  return {
    total: started.length,
    known: started.length,
    genres: shares(genre, withGenre, 10),
    decades: decadeList,
    languages: [],
    countries: [],
    byYear,
    ratings,
    avgMine,
    highlights,
    makers: shares(maker, withMaker, 6),
    finished: finished.length,
  }
}
