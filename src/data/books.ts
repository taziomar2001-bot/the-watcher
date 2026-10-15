import type { Book } from '../types'
import { BOOKS_MOCK, BOOKS_MOCK_BY_ID } from './mockBooks'

// ---------------------------------------------------------------------------
// Books come from two free catalogues:
//  · Open Library (openlibrary.org — no key, no daily quota) for everything
//    that browses: the Discover rows, Pick for me and Watch together. It knows
//    what people are actually reading (trending, reading-log counts), which
//    Google Books doesn't, and covers are reliable. Its ids look like "ol-OL…W".
//  · Google Books (browser key) for search, falling back to Open Library when
//    Google refuses (its free quota is 1,000 requests a day per key).
// Books already in your library keep the id they were added with; each id is
// looked up in the catalogue it came from.
// Without a Google Books key the app uses a small sample catalogue, the same
// way TV and movies fall back to mock data without a TMDB key.
// ---------------------------------------------------------------------------

const KEY = import.meta.env.VITE_GOOGLE_BOOKS_KEY as string | undefined
export const USE_GOOGLE_BOOKS = Boolean(KEY)
const API = 'https://www.googleapis.com/books/v1/volumes'

const MIN = 60_000
const memo = new Map<string, { at: number; p: Promise<unknown> }>()
function cached<T>(key: string, ttl: number, run: () => Promise<T>): Promise<T> {
  const hit = memo.get(key)
  if (hit && Date.now() - hit.at < ttl) return hit.p as Promise<T>
  const p = run().catch((e) => {
    memo.delete(key)
    throw e
  })
  memo.set(key, { at: Date.now(), p })
  return p
}

interface GVolume {
  id: string
  volumeInfo: {
    title?: string
    subtitle?: string
    authors?: string[]
    publisher?: string
    publishedDate?: string
    description?: string
    pageCount?: number
    printedPageCount?: number
    categories?: string[]
    averageRating?: number
    ratingsCount?: number
    language?: string
    imageLinks?: Record<string, string>
    industryIdentifiers?: { type: string; identifier: string }[]
  }
}

async function get<T>(params: Record<string, string | number | undefined>): Promise<T> {
  const u = new URL(API)
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') u.searchParams.set(k, String(v))
  u.searchParams.set('key', KEY!)
  const r = await fetch(u.toString())
  if (!r.ok) {
    let why = ''
    try {
      why = ((await r.json()) as { error?: { message?: string } }).error?.message ?? ''
    } catch {
      /* not JSON */
    }
    throw new Error(`Google Books ${r.status}${why ? `: ${why}` : ''}`)
  }
  return r.json() as Promise<T>
}

/** "Fiction / Fantasy / Epic" → ["Fantasy"]; keeps the useful, specific parts. */
export function bookGenres(categories?: string[]): string[] {
  const out = new Set<string>()
  for (const c of categories ?? []) {
    const parts = c.split('/').map((p) => p.trim()).filter(Boolean)
    const specific = parts.length > 1 ? parts.slice(1, 2) : parts
    for (const p of specific) if (!/^general$/i.test(p)) out.add(p)
    if (out.size === 0 && parts[0]) out.add(parts[0])
  }
  return [...out].slice(0, 4)
}

const strip = (html?: string) =>
  (html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

/** Google's cover links are http and tiny by default: ask for a sharper https copy. */
function cover(links?: Record<string, string>): string | undefined {
  const src = links?.thumbnail ?? links?.smallThumbnail
  if (!src) return undefined
  return src.replace(/^http:/, 'https:').replace(/&edge=curl/, '').replace(/zoom=\d/, 'zoom=1') + '&fife=w400'
}

const isoDate = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined)

export function toBook(v: GVolume): Book {
  const i = v.volumeInfo
  const isbn = i.industryIdentifiers?.find((x) => x.type === 'ISBN_13')?.identifier ?? i.industryIdentifiers?.find((x) => x.type === 'ISBN_10')?.identifier
  const year = i.publishedDate ? Number(i.publishedDate.slice(0, 4)) || undefined : undefined
  return {
    id: v.id,
    type: 'book',
    title: i.title ?? 'Untitled',
    subtitle: i.subtitle,
    authors: i.authors ?? [],
    poster: cover(i.imageLinks),
    overview: strip(i.description),
    genres: bookGenres(i.categories),
    pageCount: i.pageCount || i.printedPageCount || undefined,
    releaseDate: isoDate(i.publishedDate),
    year,
    publisher: i.publisher,
    language: i.language,
    isbn,
    communityRating: i.averageRating ? i.averageRating * 2 : undefined,
    communityVotes: i.ratingsCount,
  }
}

const FIELDS = 'items(id,volumeInfo(title,subtitle,authors,publisher,publishedDate,description,pageCount,printedPageCount,categories,averageRating,ratingsCount,language,imageLinks,industryIdentifiers)),totalItems'

async function volumes(q: string, extra: Record<string, string | number> = {}): Promise<{ items: Book[]; total: number }> {
  const r = await get<{ items?: GVolume[]; totalItems?: number }>({ q, printType: 'books', maxResults: 40, fields: FIELDS, ...extra })
  const seen = new Set<string>()
  const items = (r.items ?? [])
    .map(toBook)
    // One entry per work: Google lists many editions of the same book.
    .filter((b) => {
      const k = `${b.title.toLowerCase()}|${(b.authors[0] ?? '').toLowerCase()}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  return { items, total: r.totalItems ?? items.length }
}

// ---- Public API (mirrors the TV/movie catalog) ----

export async function searchBooks(query: string): Promise<Book[]> {
  const q = query.trim()
  if (!q) return []
  if (!USE_GOOGLE_BOOKS) {
    const t = q.toLowerCase()
    return BOOKS_MOCK.filter((b) => b.title.toLowerCase().includes(t) || b.authors.some((a) => a.toLowerCase().includes(t)))
  }
  return cached('bs:' + q.toLowerCase(), 10 * MIN, async () => {
    try {
      const items = (await volumes(q, { maxResults: 20, orderBy: 'relevance' })).items
      if (items.length) return items
    } catch (e) {
      console.warn('[books] Google search failed, using Open Library', e)
    }
    return (await olSearch(olEscape(q), { limit: 20 })).items
  })
}

export const isOpenLibraryId = (id: string) => id.startsWith(OL_PREFIX)
/** Who the details for this book came from (shown as the data credit). */
export const bookSource = (id: string) => (isOpenLibraryId(id) ? 'Open Library' : 'Google Books')

export async function getBook(id: string): Promise<Book | undefined> {
  if (isOpenLibraryId(id)) return getOlBook(id)
  if (!USE_GOOGLE_BOOKS) return BOOKS_MOCK_BY_ID[id]
  return cached('b:' + id, 60 * MIN, async () => {
    const u = new URL(`${API}/${encodeURIComponent(id)}`)
    u.searchParams.set('key', KEY!)
    const r = await fetch(u.toString())
    if (r.status === 404) return undefined
    if (!r.ok) throw new Error(`book ${r.status}`)
    return toBook((await r.json()) as GVolume)
  })
}

// ---- Open Library ----

const OL = 'https://openlibrary.org'
const OL_PREFIX = 'ol-'
const OL_FIELDS = [
  'key', 'title', 'subtitle', 'author_name', 'first_publish_year', 'cover_i', 'number_of_pages_median', 'subject',
  'ratings_average', 'ratings_count', 'editions', 'editions.title', 'editions.cover_i', 'editions.language',
].join(',')

interface OlDoc {
  key: string // "/works/OL82563W"
  title: string
  subtitle?: string
  author_name?: string[]
  first_publish_year?: number
  cover_i?: number
  number_of_pages_median?: number
  subject?: string[]
  ratings_average?: number
  ratings_count?: number
  editions?: { docs?: { title?: string; cover_i?: number }[] }
}

const olCover = (id?: number) => (id ? `https://covers.openlibrary.org/b/id/${id}-L.jpg` : undefined)
const olId = (key: string) => OL_PREFIX + key.split('/').pop()
/** Quote a free-text search so Open Library doesn't read it as field syntax. */
const olEscape = (q: string) => q.replace(/[:"()[\]{}^~*?\\/]/g, ' ').trim()

function fromOl(d: OlDoc): Book {
  // Open Library files a work under its original title ("O Alquimista"); the
  // English edition (asked for with lang=en) carries the title readers know.
  const ed = d.editions?.docs?.[0]
  const translated = !!ed?.title && ed.title.toLowerCase() !== d.title.toLowerCase()
  const r = d.ratings_count && d.ratings_count >= 3 ? d.ratings_average : undefined
  return {
    id: olId(d.key),
    type: 'book',
    title: translated ? ed!.title! : d.title,
    subtitle: translated ? undefined : d.subtitle,
    authors: d.author_name?.slice(0, 3) ?? [],
    poster: olCover((translated && ed?.cover_i) || d.cover_i || ed?.cover_i),
    overview: '',
    genres: genresFromSubjects(d.subject),
    pageCount: d.number_of_pages_median || undefined,
    year: d.first_publish_year,
    communityRating: r ? Math.round(r * 20) / 10 : undefined,
    communityVotes: r ? d.ratings_count : undefined,
  }
}

async function olGet<T>(path: string): Promise<T> {
  const r = await fetch(OL + path)
  if (!r.ok) throw new Error(`Open Library ${r.status}`)
  return r.json() as Promise<T>
}

/** Open Library search, English editions, most read first by default. */
async function olSearch(q: string, o: { sort?: string; limit?: number; page?: number } = {}): Promise<{ items: Book[]; total: number }> {
  const u = new URLSearchParams({ q, lang: 'en', fields: OL_FIELDS, limit: String(o.limit ?? 40), page: String(o.page ?? 1) })
  if (o.sort) u.set('sort', o.sort)
  const r = await olGet<{ docs?: OlDoc[]; numFound?: number }>(`/search.json?${u}`)
  return { items: (r.docs ?? []).map(fromOl), total: r.numFound ?? 0 }
}

/** What people are reading this week (Open Library's trending list), in English. */
async function olTrending(): Promise<Book[]> {
  const t = await olGet<{ works?: { key: string }[] }>('/trending/weekly.json?limit=40')
  const keys = (t.works ?? []).map((w) => w.key).filter((k) => /^\/works\/OL\d+W$/.test(k))
  if (!keys.length) return []
  // One more request fills in English titles, page counts and subjects.
  const full = await olSearch(`key:(${keys.map((k) => `"${k}"`).join(' OR ')})`, { limit: keys.length })
  const byId = new Map(full.items.map((b) => [b.id, b]))
  return keys.map((k) => byId.get(olId(k))).filter((b): b is Book => !!b)
}

async function getOlBook(id: string): Promise<Book | undefined> {
  return cached('b:' + id, 60 * MIN, async () => {
    const key = `/works/${id.slice(OL_PREFIX.length)}`
    if (!/^\/works\/OL\d+W$/.test(key)) return undefined
    const [found, work] = await Promise.all([
      olSearch(`key:"${key}"`, { limit: 1 }),
      olGet<{ description?: string | { value?: string }; first_publish_date?: string }>(`${key}.json`).catch(() => undefined),
    ])
    const b = found.items[0]
    if (!b) return undefined
    const desc = typeof work?.description === 'string' ? work.description : work?.description?.value
    // Open Library descriptions often end with a "([source][1])" link list.
    const overview = (desc ?? '').replace(/\r/g, '').split(/\n-{3,}|\n\s*\[1\]:/)[0].replace(/\[([^\]]+)\]\[\d+\]/g, '$1').trim()
    return { ...b, overview }
  })
}

/** Subjects offered as "genres" (used by Pick for me, Watch together and filters). */
export const BOOK_GENRES = [
  'Fantasy', 'Science Fiction', 'Mystery', 'Thriller', 'Romance', 'Horror', 'Historical Fiction',
  'Literary Fiction', 'Young Adult', 'Comics & Graphic Novels', 'Biography & Autobiography', 'History',
  'Self-Help', 'Business & Economics', 'Science', 'Philosophy', 'Poetry', 'True Crime',
].map((name, i) => ({ id: i + 1, name }))

/** How each genre is asked of Open Library, and how it's recognised in a book's subjects. */
const GENRE_RULES: Record<string, { q: string; match: RegExp }> = {
  Fantasy: { q: 'subject:fantasy', match: /fantasy/i },
  'Science Fiction': { q: 'subject:"science fiction"', match: /science fiction|sci-fi|dystopia/i },
  Mystery: { q: 'subject:mystery', match: /myster|detective/i },
  Thriller: { q: 'subject:thriller', match: /thriller|suspense/i },
  Romance: { q: 'subject:romance', match: /romance|love stor/i },
  Horror: { q: 'subject:horror', match: /horror/i },
  'Historical Fiction': { q: 'subject:"historical fiction"', match: /historical fiction/i },
  'Literary Fiction': { q: 'subject:"literary fiction"', match: /literary fiction|literary/i },
  'Young Adult': { q: 'subject:"young adult fiction"', match: /young adult|teen/i },
  'Comics & Graphic Novels': { q: 'subject:"graphic novels"', match: /comic|graphic novel|manga/i },
  'Biography & Autobiography': { q: 'subject:"biography & autobiography" -subject:fiction', match: /biograph|memoir/i },
  History: { q: 'subject:"world history"', match: /^history|world history|histoire|history,? (modern|ancient|military)/i },
  'Self-Help': { q: 'subject:"self-help"', match: /self-help|self help|personal development|success/i },
  'Business & Economics': { q: 'subject:business -subject:fiction', match: /business|econom|finance/i },
  Science: { q: 'subject:science -subject:fiction', match: /^science$|popular science|physics|biology|astronomy/i },
  Philosophy: { q: 'subject:philosophy', match: /philosoph/i },
  Poetry: { q: 'subject:poetry', match: /poetry|poems/i },
  'True Crime': { q: 'subject:"true crime"', match: /true crime|murder|criminal/i },
}

/** Open Library subjects → the genres above (the ones a book clearly belongs to). */
function genresFromSubjects(subjects?: string[]): string[] {
  const top = (subjects ?? []).slice(0, 40)
  const out = BOOK_GENRES.map((g) => g.name).filter((name) => top.some((s) => GENRE_RULES[name].match.test(s)))
  return out.slice(0, 4)
}

/**
 * Does a book (its stored genres) belong to this genre? Google's categories are
 * worded differently ("Fiction / Fantasy / Epic" → "Fantasy", "Biography &
 * Autobiography"), so this matches by meaning rather than by exact name.
 */
export function bookInGenre(genres: string[] | undefined, name: string): boolean {
  const rule = GENRE_RULES[name]
  return (genres ?? []).some((g) => g === name || (rule ? rule.match.test(g) : false))
}

export interface Section<T> {
  key: string
  title: string
  items: T[]
}

/** The Discover → Books rows: what's popular now, new releases, then by category. */
export const BOOK_ROWS: { key: string; title: string; genre?: string; match?: RegExp }[] = [
  { key: 'popular', title: 'Most Popular' },
  { key: 'new', title: 'New Releases' },
  { key: 'biography', title: 'Biography', genre: 'Biography & Autobiography' },
  { key: 'history', title: 'History', genre: 'History' },
  { key: 'romance', title: 'Romance', genre: 'Romance' },
  { key: 'scifi', title: 'Science Fiction', genre: 'Science Fiction' },
  { key: 'ya', title: 'Young Adult', genre: 'Young Adult' },
  { key: 'business', title: 'Business & Economics', genre: 'Business & Economics' },
  { key: 'truecrime', title: 'True Crime', genre: 'True Crime' },
  { key: 'fantasy', title: 'Fantasy', genre: 'Fantasy' },
  { key: 'thriller', title: 'Mystery & Thriller', match: /thriller|mystery|suspense|detective/i },
  { key: 'selfhelp', title: 'Self-Help', genre: 'Self-Help' },
]

async function fetchRow(r: (typeof BOOK_ROWS)[number]): Promise<Book[]> {
  if (r.key === 'popular') return olTrending()
  const y = new Date().getFullYear()
  const q =
    r.key === 'new'
      ? `first_publish_year:[${y - 1} TO ${y}]`
      : r.key === 'thriller'
        ? '(subject:thriller OR subject:mystery) -subject:"juvenile fiction"'
        : GENRE_RULES[r.genre!].q
  return (await olSearch(`${q} language:eng`, { sort: 'readinglog', limit: 30 })).items
}

// v2: rows now come from Open Library (the old Google rows are simply replaced).
const ROWS_KEY = 'tw-book-rows-v2'
const ROWS_TTL = 24 * 60 * 60 * 1000
type RowCache = { at: Record<string, number>; rows: Record<string, Book[]> }
function readRows(): RowCache {
  try {
    const c = JSON.parse(localStorage.getItem(ROWS_KEY) ?? '') as RowCache
    if (c && c.rows && c.at) return c
  } catch {
    /* none yet */
  }
  return { at: {}, rows: {} }
}
function writeRows(c: RowCache) {
  try {
    localStorage.setItem(ROWS_KEY, JSON.stringify(c))
  } catch {
    /* full or blocked: rows just reload next time */
  }
}

export interface BookRowsState {
  sections: Section<Book>[]
  loading: boolean
  /** Rows that couldn't load, with the reason (shown so a problem is visible). */
  errors: string[]
}

/**
 * Discover → Books. Rows appear as soon as they arrive (and instantly from the
 * last visit — each row is kept for a day), three at a time, with retries.
 */
export function loadBookRows(onUpdate: (s: BookRowsState) => void, force = false): () => void {
  let alive = true
  const cache = readRows()
  const emit = (loading: boolean, errors: string[]) => {
    if (!alive) return
    const sections = BOOK_ROWS.map((r) => ({ key: r.key, title: r.title, items: cache.rows[r.key] ?? [] })).filter((x) => x.items.length > 0)
    onUpdate({ sections, loading, errors })
  }
  if (!USE_GOOGLE_BOOKS) {
    const now = new Date().toISOString().slice(0, 10)
    for (const r of BOOK_ROWS) {
      cache.rows[r.key] =
        r.key === 'popular'
          ? [...BOOKS_MOCK].sort((a, b) => (b.communityRating ?? 0) - (a.communityRating ?? 0))
          : r.key === 'new'
            ? [...BOOKS_MOCK].filter((b) => !b.releaseDate || b.releaseDate <= now).sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
            : BOOKS_MOCK.filter((b) => (r.genre ? bookInGenre(b.genres, r.genre) : b.genres.some((g) => r.match?.test(g))))
    }
    emit(false, [])
    return () => {
      alive = false
    }
  }
  emit(true, [])
  void (async () => {
    const errors: string[] = []
    const due = BOOK_ROWS.filter((r) => force || !cache.rows[r.key]?.length || Date.now() - (cache.at[r.key] ?? 0) > ROWS_TTL)
    const one = async (r: (typeof BOOK_ROWS)[number]) => {
      for (let attempt = 0; attempt < 3 && alive; attempt++) {
        try {
          if (attempt) await new Promise((res) => setTimeout(res, attempt * 1500))
          const items = (await fetchRow(r)).filter((b) => b.poster).slice(0, 20)
          if (items.length) {
            cache.rows[r.key] = items
            cache.at[r.key] = Date.now()
            writeRows(cache)
          }
          emit(true, errors)
          return
        } catch (e) {
          if (attempt === 2) errors.push(`${r.title}: ${(e as Error)?.message ?? e}`)
        }
      }
    }
    const queue = [...due]
    await Promise.all([0, 1, 2].map(async () => {
      while (alive && queue.length) await one(queue.shift()!)
    }))
    if (errors.length) console.warn('[books] some rows failed', errors)
    emit(false, errors)
  })()
  return () => {
    alive = false
  }
}

/**
 * A page of books for "Pick for me" / "Watch together": the most-read books
 * (in a genre, if one is chosen) on Open Library. Length = page count.
 */
export async function discoverBookPage(
  page: number,
  genre?: { id: number; name: string },
  len?: { min?: number; max?: number },
): Promise<{ items: Book[]; totalPages: number }> {
  const fits = (b: Book) => !len || (b.pageCount != null && (len.min == null || b.pageCount >= len.min) && (len.max == null || b.pageCount <= len.max))
  if (!USE_GOOGLE_BOOKS) {
    const pool = BOOKS_MOCK.filter((b) => !genre || bookInGenre(b.genres, genre.name)).filter(fits)
    const per = 20
    return { items: pool.slice((page - 1) * per, page * per), totalPages: Math.max(1, Math.ceil(pool.length / per)) }
  }
  return cached(`bp:${genre?.name ?? ''}:${len?.min ?? 0}-${len?.max ?? 0}:${page}`, 30 * MIN, async () => {
    const base = genre ? GENRE_RULES[genre.name]?.q ?? `subject:"${genre.name}"` : '-subject:"juvenile fiction"'
    // Page-count limits go to Open Library itself, so every page is a full one.
    const pages = len ? ` number_of_pages_median:[${len.min ?? 1} TO ${len.max ?? 99999}]` : ''
    const r = await olSearch(`${base}${pages} language:eng`, { sort: 'readinglog', limit: 40, page })
    // Past the first few hundred, "most read" drifts into obscure titles.
    return { items: r.items.filter((b) => b.poster).filter(fits), totalPages: Math.max(1, Math.min(6, Math.ceil(r.total / 40))) }
  })
}
