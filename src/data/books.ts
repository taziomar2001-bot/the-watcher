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

export function discoverBooks(): Promise<Section<Book>[]> {
  return cached('discoverBooks', 30 * MIN, async () => {
    if (!USE_GOOGLE_BOOKS) {
      const now = new Date().toISOString().slice(0, 10)
      const rated = [...BOOKS_MOCK].sort((a, b) => (b.communityRating ?? 0) - (a.communityRating ?? 0))
      return [
        { key: 'new', title: 'New Releases', items: [...BOOKS_MOCK].filter((b) => !b.releaseDate || b.releaseDate <= now).sort((a, b) => (b.year ?? 0) - (a.year ?? 0)) },
        { key: 'fantasy', title: 'Fantasy & Sci-Fi', items: BOOKS_MOCK.filter((b) => b.genres.some((g) => /fantasy|science/i.test(g))) },
        { key: 'thriller', title: 'Mystery & Thriller', items: BOOKS_MOCK.filter((b) => b.genres.some((g) => /thriller|mystery/i.test(g))) },
        { key: 'nonfiction', title: 'Non-fiction', items: BOOKS_MOCK.filter((b) => b.genres.some((g) => /history|self|biography|science$/i.test(g))) },
        { key: 'rated', title: 'Loved by Readers', items: rated },
        { key: 'soon', title: 'Coming Soon', items: BOOKS_MOCK.filter((b) => b.releaseDate && b.releaseDate > now) },
      ]
    }
    // Gentle on Google's per-second limit: two queries at a time, each retried
    // once. A failed or empty row is skipped; if every row fails we throw, so
    // nothing empty is cached and the screen offers "Try again".
    const year = new Date().getFullYear()
    const errors: string[] = []
    const run = async (q: string, extra: Record<string, string | number> = {}): Promise<Book[]> => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          return (await volumes(q, extra)).items
        } catch (e) {
          if (attempt === 1) errors.push(String((e as Error)?.message ?? e))
          else await new Promise((r) => setTimeout(r, 700))
        }
      }
      return []
    }
    const plan: [string, Record<string, string | number>][] = [
      [`subject:fiction ${year}`, { orderBy: 'newest' }],
      ['subject:fiction', { orderBy: 'relevance' }],
      ['subject:fantasy', { orderBy: 'relevance' }],
      ['subject:thriller', { orderBy: 'relevance' }],
      ['subject:romance', { orderBy: 'relevance' }],
      ['subject:history', { orderBy: 'relevance' }],
    ]
    const results: Book[][] = []
    for (let i = 0; i < plan.length; i += 2) {
      const pair = await Promise.all(plan.slice(i, i + 2).map(([q, extra]) => run(q, { ...extra, langRestrict: 'en' })))
      results.push(...pair)
    }
    const [fresh, fiction, fantasy, thriller, romance, history] = results
    const today = new Date().toISOString().slice(0, 10)
    // Prefer titles with a cover; fall back to all of them rather than an empty row.
    const covered = (xs: Book[]) => {
      const c = xs.filter((b) => b.poster)
      return c.length >= 4 ? c : xs
    }
    const sections = [
      { key: 'new', title: 'New Releases', items: covered(fresh.filter((b) => !b.releaseDate || b.releaseDate <= today)) },
      { key: 'soon', title: 'Coming Soon', items: covered(fresh.filter((b) => b.releaseDate && b.releaseDate > today)) },
      { key: 'fiction', title: 'Popular Fiction', items: covered(fiction) },
      { key: 'fantasy', title: 'Fantasy', items: covered(fantasy) },
      { key: 'thriller', title: 'Mystery & Thriller', items: covered(thriller) },
      { key: 'romance', title: 'Romance', items: covered(romance) },
      { key: 'history', title: 'History', items: covered(history) },
    ].filter((x) => x.items.length > 0)
    if (!sections.length) {
      console.warn('[books] discover failed', errors)
      throw new Error(errors[0] ?? 'No books came back')
    }
    return sections
  })
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
