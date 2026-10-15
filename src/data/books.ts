import type { Book } from '../types'
import { BOOKS_MOCK, BOOKS_MOCK_BY_ID } from './mockBooks'

// ---------------------------------------------------------------------------
// Books — Google Books API (https://developers.google.com/books). The key is a
// browser key (restrict it to your site in Google Cloud). Without a key the app
// uses a small sample catalogue, the same way TV and movies fall back to mock
// data without a TMDB key.
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
  return cached('bs:' + q.toLowerCase(), 10 * MIN, async () => (await volumes(q, { maxResults: 20, orderBy: 'relevance' })).items)
}

export async function getBook(id: string): Promise<Book | undefined> {
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

/** Subjects offered as "genres" (Google Books searches by subject). */
export const BOOK_GENRES = [
  'Fantasy', 'Science Fiction', 'Mystery', 'Thriller', 'Romance', 'Horror', 'Historical Fiction',
  'Literary Fiction', 'Young Adult', 'Comics & Graphic Novels', 'Biography & Autobiography', 'History',
  'Self-Help', 'Business & Economics', 'Science', 'Philosophy', 'Poetry', 'True Crime',
].map((name, i) => ({ id: i + 1, name }))

const subjectQuery = (name: string) => `subject:"${name}"`

export interface Section<T> {
  key: string
  title: string
  items: T[]
}

/** The Discover → Books rows: most popular overall, new releases, then by category. */
export const BOOK_ROWS: { key: string; title: string; q: string; newest?: boolean; match?: RegExp }[] = [
  { key: 'popular', title: 'Most Popular', q: 'subject:fiction' },
  { key: 'new', title: 'New Releases', q: `subject:fiction ${new Date().getFullYear()}`, newest: true },
  { key: 'biography', title: 'Biography', q: 'subject:"biography & autobiography"', match: /biograph|memoir/i },
  { key: 'history', title: 'History', q: 'subject:history', match: /histor/i },
  { key: 'romance', title: 'Romance', q: 'subject:romance', match: /romance/i },
  { key: 'scifi', title: 'Science Fiction', q: 'subject:"science fiction"', match: /science fiction/i },
  { key: 'ya', title: 'Young Adult', q: 'subject:"young adult fiction"', match: /young adult/i },
  { key: 'business', title: 'Business & Economics', q: 'subject:"business & economics"', match: /business|econom/i },
  { key: 'truecrime', title: 'True Crime', q: 'subject:"true crime"', match: /true crime/i },
  { key: 'fantasy', title: 'Fantasy', q: 'subject:fantasy', match: /fantasy/i },
  { key: 'thriller', title: 'Mystery & Thriller', q: 'subject:thriller', match: /thriller|mystery/i },
  { key: 'selfhelp', title: 'Self-Help', q: 'subject:"self-help"', match: /self-help/i },
]

/** Most-rated first (Google's closest thing to "popular"), covers first, max 20. */
function byPopularity(xs: Book[]): Book[] {
  const covered = xs.filter((b) => b.poster)
  const pool = covered.length >= 6 ? covered : xs
  return [...pool].sort((a, b) => (b.communityVotes ?? 0) - (a.communityVotes ?? 0) || (b.communityRating ?? 0) - (a.communityRating ?? 0)).slice(0, 20)
}

const ROWS_KEY = 'tw-book-rows-v1'
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
const slim = (b: Book): Book => ({ ...b, overview: b.overview.slice(0, 280) })

export interface BookRowsState {
  sections: Section<Book>[]
  loading: boolean
  /** Rows Google refused, with its reason (shown so a problem is visible). */
  errors: string[]
}

/**
 * Discover → Books. Rows appear as soon as they arrive (and instantly from the
 * last visit — each row is kept for a day), fetched one at a time with a short
 * gap and retries so Google's per-second limit is never hit.
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
            : BOOKS_MOCK.filter((b) => b.genres.some((g) => r.match?.test(g)))
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
    for (const r of due) {
      if (!alive) return
      let ok = false
      for (let attempt = 0; attempt < 3 && !ok && alive; attempt++) {
        try {
          if (attempt) await new Promise((res) => setTimeout(res, attempt * 1200))
          const res = await volumes(r.q, { orderBy: r.newest ? 'newest' : 'relevance', langRestrict: 'en' })
          const today = new Date().toISOString().slice(0, 10)
          const items = r.newest ? res.items.filter((b) => !b.releaseDate || b.releaseDate <= today).filter((b) => b.poster) : byPopularity(res.items)
          if (items.length) {
            cache.rows[r.key] = items.slice(0, 20).map(slim)
            cache.at[r.key] = Date.now()
            writeRows(cache)
          }
          ok = true
        } catch (e) {
          if (attempt === 2) errors.push(`${r.title}: ${(e as Error)?.message ?? e}`)
        }
      }
      emit(true, errors)
      await new Promise((res) => setTimeout(res, 300))
    }
    if (errors.length) console.warn('[books] some rows failed', errors)
    emit(false, errors)
  })()
  return () => {
    alive = false
  }
}

/**
 * A page of books for "Pick for me" / "Watch together". Length = page count
 * (Google can't filter by pages, so it's applied to each page of results).
 */
export async function discoverBookPage(
  page: number,
  genre?: { id: number; name: string },
  len?: { min?: number; max?: number },
): Promise<{ items: Book[]; totalPages: number }> {
  const fits = (b: Book) => !len || (b.pageCount != null && (len.min == null || b.pageCount >= len.min) && (len.max == null || b.pageCount <= len.max))
  if (!USE_GOOGLE_BOOKS) {
    const pool = BOOKS_MOCK.filter((b) => !genre || b.genres.includes(genre.name)).filter(fits)
    const per = 20
    return { items: pool.slice((page - 1) * per, page * per), totalPages: Math.max(1, Math.ceil(pool.length / per)) }
  }
  return cached(`bp:${genre?.name ?? ''}:${len?.min ?? 0}-${len?.max ?? 0}:${page}`, 30 * MIN, async () => {
    const q = genre ? subjectQuery(genre.name) : 'subject:fiction'
    const r = await volumes(q, { startIndex: (page - 1) * 40, orderBy: 'relevance', langRestrict: 'en' })
    return { items: r.items.filter((b) => b.poster).filter(fits), totalPages: Math.max(1, Math.min(10, Math.ceil(r.total / 40))) }
  })
}
