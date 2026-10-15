import { useMemo } from 'react'
import { useLibrary, type TrackKind, type TrackItem, type Tracked, type TrackState } from '../store/useLibrary'
import type { Book, Game, TrackMedia } from '../types'
import type { DotColor } from './status'

// ---------------------------------------------------------------------------
// Books: status-only tracking, same colour language as TV and movies —
// nothing (not in your library) · white (following, not started) · blue (not
// out yet) · orange (reading) · green (finished) · red (stopped midway).
//
// Video games are simpler: Played (green) · On shelf (orange) · Upcoming
// (white). Any status a game had before (playing, finished, stopped) counts as
// Played; the stored value is left as it was.
// ---------------------------------------------------------------------------

/** Has this game been played (any status counts)? */
export const isPlayed = (t?: Tracked) => !!t?.state

export const TRACK_KINDS: TrackKind[] = ['book', 'game']

/** Words that change between books and games. */
export const WORDS: Record<TrackKind, {
  one: string
  many: string
  Many: string
  active: string // "Reading"
  doing: string // "reading"
  start: string // "Start reading"
  done: string // "Finished"
  stopped: string // "Stopped reading"
  stop: string // "Stop reading"
  notStarted: string
  backlog: string // "Want to read"
}> = {
  book: {
    one: 'book', many: 'books', Many: 'Books', active: 'Reading', doing: 'reading', start: 'Start reading', done: 'Finished',
    stopped: 'Stopped reading', stop: 'Stopped reading', notStarted: 'Not started', backlog: 'Want to read',
  },
  game: {
    one: 'game', many: 'games', Many: 'Games', active: 'Played', doing: 'playing', start: 'Played', done: 'Played',
    stopped: 'Played', stop: 'Played', notStarted: 'On shelf', backlog: 'On shelf',
  },
}

export const mapKey = (kind: TrackKind) => (kind === 'book' ? 'books' : 'games') as 'books' | 'games'

const today = () => new Date().toISOString().slice(0, 10)
export const notOutYet = (releaseDate?: string) => !!releaseDate && releaseDate > today()

/** Status colour, or undefined when the title isn't in your library. */
export function trackColor(t?: Tracked): DotColor | undefined {
  if (!t) return undefined
  if (t.item.type === 'game') {
    if (isPlayed(t)) return 'green'
    if (!t.followed) return undefined
    return notOutYet(t.item.releaseDate) ? 'orange' /* white */ : 'yellow' /* orange */
  }
  if (t.state === 'done') return 'green'
  if (t.state === 'stopped') return 'red'
  if (t.state === 'active') return 'yellow'
  if (!t.followed) return undefined
  return notOutYet(t.item.releaseDate) ? 'blue' : 'orange'
}

/** A short line for the detail page and lists. */
export function trackStatusText(kind: TrackKind, t?: Tracked): string | null {
  if (!t) return null
  const w = WORDS[kind]
  if (kind === 'game') {
    if (isPlayed(t)) return t.platform ? `Played on ${t.platform}` : 'Played'
    if (!t.followed) return null
    return notOutYet(t.item.releaseDate) ? 'Upcoming' : 'On shelf'
  }
  if (t.state === 'done') return w.done
  if (t.state === 'stopped') return w.stopped
  if (t.state === 'active') return w.active
  if (!t.followed) return null
  if (notOutYet(t.item.releaseDate)) return 'Not out yet'
  return w.backlog
}

/** The cached summary we keep for a catalogue book or game. */
export function toTrackItem(m: TrackMedia): TrackItem {
  if (m.type === 'book') {
    const b = m as Book
    return { id: b.id, type: 'book', title: b.title, poster: b.poster, year: b.year, releaseDate: b.releaseDate, genres: b.genres?.length ? b.genres : undefined, authors: b.authors?.length ? b.authors : undefined, pageCount: b.pageCount, checkedAt: Date.now() }
  }
  const g = m as Game
  return { id: g.id, type: 'game', title: g.title, poster: g.poster, year: g.year, releaseDate: g.releaseDate, genres: g.genres?.length ? g.genres : undefined, platforms: g.platforms?.length ? g.platforms : undefined, developer: g.developer, ttb: g.timeToBeat?.normally, checkedAt: Date.now() }
}

export interface TrackEntry {
  id: string
  kind: TrackKind
  t: Tracked
  color: DotColor | undefined
}

/** Every book (or game) in your library, with its colour. */
export function useTrackEntries(kind: TrackKind): TrackEntry[] {
  const map = useLibrary((s) => s[mapKey(kind)])
  return useMemo(
    () => Object.entries(map ?? {}).map(([id, t]) => ({ id, kind, t, color: trackColor(t) })),
    [map, kind],
  )
}

export interface TrackSections {
  active: TrackEntry[]
  backlog: TrackEntry[] // following, out, not started
  soon: TrackEntry[] // following, not out yet
  done: TrackEntry[]
  stopped: TrackEntry[]
}

export function sectionsOf(entries: TrackEntry[]): TrackSections {
  const out: TrackSections = { active: [], backlog: [], soon: [], done: [], stopped: [] }
  for (const e of entries) {
    const s: TrackState | undefined = e.t.state
    // Games: any status is "Played".
    if (e.kind === 'game' && s) out.done.push(e)
    else if (s === 'active') out.active.push(e)
    else if (s === 'done') out.done.push(e)
    else if (s === 'stopped') out.stopped.push(e)
    else if (e.t.followed) (notOutYet(e.t.item.releaseDate) ? out.soon : out.backlog).push(e)
  }
  const recent = (a: TrackEntry, b: TrackEntry) => (b.t.stateAt ?? b.t.addedAt) - (a.t.stateAt ?? a.t.addedAt) || a.t.item.title.localeCompare(b.t.item.title)
  out.active.sort(recent)
  out.done.sort(recent)
  out.stopped.sort(recent)
  out.backlog.sort((a, b) => b.t.addedAt - a.t.addedAt || a.t.item.title.localeCompare(b.t.item.title))
  out.soon.sort((a, b) => (a.t.item.releaseDate ?? '').localeCompare(b.t.item.releaseDate ?? ''))
  return out
}

/** Counts for the Profile cards and public stats. */
export function trackTotals(entries: TrackEntry[]) {
  let followed = 0
  let active = 0
  let done = 0
  let stopped = 0
  let backlog = 0
  let upcoming = 0
  for (const e of entries) {
    if (e.t.followed || e.t.state) followed++
    if (e.kind === 'game' && e.t.state) done++
    else if (e.t.state === 'active') active++
    else if (e.t.state === 'done') done++
    else if (e.t.state === 'stopped') stopped++
    else if (e.t.followed) {
      if (notOutYet(e.t.item.releaseDate)) upcoming++
      else backlog++
    }
  }
  return { followed, active, done, stopped, backlog, upcoming }
}

/** "34 books" / "1 game". */
export const countLabel = (kind: TrackKind, n: number) => `${n.toLocaleString()} ${n === 1 ? WORDS[kind].one : WORDS[kind].many}`
