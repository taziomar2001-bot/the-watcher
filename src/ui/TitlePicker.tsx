import { useState } from 'react'
import { createPortal } from 'react-dom'
import { SmartImage } from '../components/ui'
import { SearchField } from './primitives'
import { CheckIcon, PlusIcon, ChevronLeft, ChevronRight } from '../components/Icons'
import { useAsync, useDebounced } from '../hooks/useAsync'
import { search as searchCatalog, getShow } from '../data/catalog'
import type { ListKind, RefMeta } from '../store/useLibrary'
import { episodeCode, episodeRef, movieRef, seasonRef, showRef } from '../logic/lists'
import { searchBooks } from '../data/books'
import { searchGames } from '../data/games'
import { KINDS_ON } from '../logic/content'
import type { Media, Show, TrackMedia, Book, Game } from '../types'

/**
 * Full-screen picker. "mixed" / "shows" / "movies" search titles directly;
 * "seasons" / "episodes" search a show, then drill into its seasons/episodes.
 */
export function TitlePicker({
  kind,
  title = 'Add titles',
  isPicked,
  onToggle,
  onClose,
}: {
  kind: ListKind
  title?: string
  isPicked: (ref: string) => boolean
  onToggle: (ref: string, meta: RefMeta, media?: Media | TrackMedia) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const dq = useDebounced(q, 250)
  const [show, setShow] = useState<{ id: string; title: string } | null>(null)
  const wantShows = kind === 'mixed' || kind === 'shows' || kind === 'seasons' || kind === 'episodes'
  const wantMovies = kind === 'mixed' || kind === 'movies'
  const wantBooks = (kind === 'mixed' && KINDS_ON.includes('book')) || kind === 'books'
  const wantGames = (kind === 'mixed' && KINDS_ON.includes('game')) || kind === 'games'
  const { data: results, loading, error } = useAsync(
    async (): Promise<(Media | TrackMedia)[]> => {
      if (!dq.trim()) return []
      const [tm, bk, gm] = await Promise.all([
        wantShows || wantMovies ? searchCatalog(dq) : Promise.resolve([] as Media[]),
        wantBooks ? searchBooks(dq).catch(() => [] as Book[]) : Promise.resolve([] as Book[]),
        wantGames ? searchGames(dq).catch(() => [] as Game[]) : Promise.resolve([] as Game[]),
      ])
      return [...tm, ...bk.slice(0, 10), ...gm.slice(0, 10)]
    },
    [dq, kind],
  )
  const drill = kind === 'seasons' || kind === 'episodes'
  const hits = (results ?? []).filter((m) => (m.type === 'show' ? wantShows : m.type === 'movie' ? wantMovies : m.type === 'book' ? wantBooks : wantGames))
  const what =
    kind === 'movies' ? 'movies' : kind === 'shows' ? 'TV shows' : kind === 'books' ? 'books' : kind === 'games' ? 'games' : drill ? 'a TV show' : KINDS_ON.length > 2 ? 'titles' : 'movies & TV shows'

  return createPortal(
    <div className="picker-backdrop">
      <div className="picker">
        <div className="picker-head">
          {show ? (
            <button className="picker-back pressable" onClick={() => setShow(null)} aria-label="Back to search">
              <ChevronLeft size={22} /> <span className="picker-title">{show.title}</span>
            </button>
          ) : (
            <span className="picker-title">{title}</span>
          )}
          <button className="settings-close pressable" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {!show && (
          <div className="picker-search">
            <SearchField value={q} onChange={setQ} placeholder={`Search ${what}`} autoFocus />
          </div>
        )}
        <div className="picker-body">
          {show ? (
            <SeasonDrill showId={show.id} kind={kind as 'seasons' | 'episodes'} isPicked={isPicked} onToggle={onToggle} />
          ) : !dq.trim() ? (
            <div className="empty compact">
              <div className="empty-sub">{drill ? `Search a show, then pick its ${kind}` : `Search ${what} to add`}</div>
            </div>
          ) : error ? (
            <div className="empty compact">
              <div className="empty-sub">Couldn’t search right now — check your connection.</div>
            </div>
          ) : loading && !results ? (
            <PickerSkeleton />
          ) : hits.length === 0 ? (
            <div className="empty compact">
              <div className="empty-sub">No matches</div>
            </div>
          ) : (
            hits.map((m) => {
              const year = m.type === 'show' ? (m as Show).firstAirYear : m.year
              if (drill)
                return (
                  <button key={m.id} className="pick-row pressable" onClick={() => setShow({ id: m.id, title: m.title })}>
                    <SmartImage src={m.poster} alt="" className="pick-poster" />
                    <span className="pick-info">
                      <span className="pick-title">{m.title}</span>
                      <span className="pick-sub">{[year, 'TV'].filter(Boolean).join(' · ')}</span>
                    </span>
                    <ChevronRight size={20} />
                  </button>
                )
              const ref = m.type === 'show' ? showRef(m.id) : m.type === 'movie' ? movieRef(m.id) : `${m.type}:${m.id}`
              const on = isPicked(ref)
              const label = m.type === 'show' ? 'TV' : m.type === 'movie' ? 'Film' : m.type === 'book' ? ['Book', (m as Book).authors[0]].filter(Boolean).join(' · ') : 'Game'
              return (
                <button key={ref} className="pick-row pressable" onClick={() => onToggle(ref, { t: m.title, p: m.poster, y: year }, m)}>
                  <SmartImage src={m.poster} alt="" className="pick-poster" />
                  <span className="pick-info">
                    <span className="pick-title">{m.title}</span>
                    <span className="pick-sub">{[year, label].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className={`pick-check ${on ? 'on' : ''}`}>{on ? <CheckIcon size={16} /> : <PlusIcon size={16} />}</span>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function PickerSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="pick-row">
          <span className="skeleton pick-poster" />
          <span className="pick-info">
            <span className="skeleton" style={{ width: '60%', height: 14, display: 'block' }} />
            <span className="skeleton" style={{ width: '30%', height: 11, display: 'block', marginTop: 6 }} />
          </span>
        </div>
      ))}
    </>
  )
}

function SeasonDrill({
  showId,
  kind,
  isPicked,
  onToggle,
}: {
  showId: string
  kind: 'seasons' | 'episodes'
  isPicked: (ref: string) => boolean
  onToggle: (ref: string, meta: RefMeta) => void
}) {
  const { data: show, error, reload } = useAsync(() => getShow(showId), [showId])
  const [open, setOpen] = useState<number | null>(null)
  if (error)
    return (
      <div className="empty compact">
        <div className="empty-sub">Couldn’t load this show.</div>
        <button className="auth-link" onClick={reload}>
          Try again
        </button>
      </div>
    )
  if (!show) return <PickerSkeleton />
  const seasons = show.seasons.filter((s) => s.episodes.length > 0)
  return (
    <>
      {seasons.map((s) => {
        const sRef = seasonRef(show.id, s.season)
        const label = s.name || `Season ${s.season}`
        if (kind === 'seasons') {
          const on = isPicked(sRef)
          return (
            <button key={s.season} className="pick-row pressable" onClick={() => onToggle(sRef, { t: label, s: show.title, p: show.poster, y: yearOf(s.episodes[0]?.airDate) })}>
              <SmartImage src={show.poster} alt="" className="pick-poster" />
              <span className="pick-info">
                <span className="pick-title">{label}</span>
                <span className="pick-sub">{s.episodes.length} episodes</span>
              </span>
              <span className={`pick-check ${on ? 'on' : ''}`}>{on ? <CheckIcon size={16} /> : <PlusIcon size={16} />}</span>
            </button>
          )
        }
        const picked = s.episodes.filter((e) => isPicked(episodeRef(show.id, s.season, e.number))).length
        return (
          <div key={s.season}>
            <button className="pick-row pressable" onClick={() => setOpen(open === s.season ? null : s.season)} aria-expanded={open === s.season}>
              <span className="pick-info">
                <span className="pick-title">{label}</span>
                <span className="pick-sub">
                  {s.episodes.length} episodes{picked ? ` · ${picked} added` : ''}
                </span>
              </span>
              <ChevronRight size={20} style={{ transform: open === s.season ? 'rotate(90deg)' : undefined, transition: 'transform .15s' }} />
            </button>
            {open === s.season &&
              s.episodes.map((e) => {
                const ref = episodeRef(show.id, s.season, e.number)
                const on = isPicked(ref)
                return (
                  <button
                    key={e.id}
                    className="pick-row ep pressable"
                    onClick={() => onToggle(ref, { t: e.title || episodeCode(s.season, e.number), s: show.title, p: e.still ?? show.backdrop ?? show.poster, y: yearOf(e.airDate) })}
                  >
                    <SmartImage src={e.still ?? show.backdrop} alt="" className="pick-still" />
                    <span className="pick-info">
                      <span className="pick-title">{e.title}</span>
                      <span className="pick-sub">{episodeCode(s.season, e.number)}</span>
                    </span>
                    <span className={`pick-check ${on ? 'on' : ''}`}>{on ? <CheckIcon size={16} /> : <PlusIcon size={16} />}</span>
                  </button>
                )
              })}
          </div>
        )
      })}
    </>
  )
}

const yearOf = (d?: string) => (d ? Number(d.slice(0, 4)) || undefined : undefined)
