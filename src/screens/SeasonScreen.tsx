import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { EpisodeRow } from '../ui/cards'
import { ChevronLeft, CheckIcon } from '../components/Icons'
import { useAsync } from '../hooks/useAsync'
import { getShow } from '../data/catalog'
import { useLibrary } from '../store/useLibrary'
import { toLibraryItem } from '../utils/media'
import { useToast } from '../store/useToast'
import { shortDate } from '../utils/dates'

const isReleased = (airDate?: string) => !airDate || new Date(airDate + 'T00:00:00') <= new Date()

export function SeasonScreen() {
  const { id = '', season = '1' } = useParams()
  const nav = useNavigate()
  const { data: show } = useAsync(() => getShow(id), [id])
  const watched = useLibrary((s) => s.watchedEpisodes)
  const mark = useLibrary((s) => s.markEpisodeWatched)
  const markAll = useLibrary((s) => s.markAllPrevious)
  const markAllUnwatched = useLibrary((s) => s.markAllUnwatched)
  const patchLibraryShow = useLibrary((s) => s.patchLibraryShow)
  const toast = useToast((s) => s.show)
  const [confirmReset, setConfirmReset] = useState(false)

  useEffect(() => {
    if (show) patchLibraryShow(show.id, toLibraryItem(show))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show?.id])

  if (!show)
    return (
      <div className="scroll-area">
        <span className="skeleton" style={{ height: 120, display: 'block', margin: 16 }} />
      </div>
    )

  const seasonObj = show.seasons.find((s) => String(s.season) === String(season)) ?? show.seasons[0]
  const allIds = seasonObj.episodes.map((e) => e.id)
  const releasedIds = seasonObj.episodes.filter((e) => isReleased(e.airDate)).map((e) => e.id)
  const anyWatched = allIds.some((i) => watched[i])
  const allWatched = releasedIds.length > 0 && releasedIds.every((i) => watched[i])

  return (
    <div className="scroll-area route-fade">
      <div className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button className="pressable" onClick={() => nav(-1)} aria-label="Back" style={{ color: 'var(--text-dim)' }}>
            <ChevronLeft size={26} />
          </button>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 22 }}>{seasonObj.name}</h1>
            <div className="sub">{show.title}</div>
          </div>
        </div>
        {allWatched || anyWatched ? (
          <button className="action-pill pressable" onClick={() => setConfirmReset(true)}>
            Unwatch All
          </button>
        ) : (
          <button
            className="action-pill tone-green pressable"
            onClick={() => {
              markAll(releasedIds)
              toast('Season marked watched')
            }}
          >
            <CheckIcon size={15} /> Watch All
          </button>
        )}
      </div>

      <div className="episode-list">
        {seasonObj.episodes.map((e) => (
          <EpisodeRow
            key={e.id}
            still={e.still ?? show.backdrop}
            title={e.title}
            number={e.number}
            airDate={e.airDate ? shortDate(e.airDate) : 'TBA'}
            watched={!!watched[e.id]}
            onToggle={() => toggle(e.id)}
            onClick={() => toggle(e.id)}
          />
        ))}
      </div>
      <div style={{ height: 20 }} />

      {confirmReset && (
        <div className="sheet-backdrop" onClick={() => setConfirmReset(false)}>
          <div className="sheet" onClick={(ev) => ev.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="confirm-title">Mark season as not watched?</div>
            <div className="confirm-body">
              This removes the watched status from every episode in {seasonObj.name}. Your episode history for other
              seasons is unaffected.
            </div>
            <div className="confirm-actions">
              <button className="sync-btn ghost pressable" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
              <button
                className="sync-btn pressable"
                style={{ background: 'var(--orange)', color: '#231400', borderColor: 'var(--orange)' }}
                onClick={() => {
                  markAllUnwatched(allIds)
                  setConfirmReset(false)
                  toast('Season marked not watched')
                }}
              >
                Mark Not Watched
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  function toggle(epId: string) {
    const now = !watched[epId]
    mark(epId, now)
    if (now) toast('Marked watched', { actionLabel: 'Undo', onAction: () => mark(epId, false) })
  }
}
