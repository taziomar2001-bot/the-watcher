import { useNavigate, useParams } from 'react-router-dom'
import { SmartImage } from '../components/ui'
import { StarRating } from '../ui/StarRating'
import { ChevronLeft, CheckIcon } from '../components/Icons'
import { useAsync } from '../hooks/useAsync'
import { getShow } from '../data/catalog'
import { useLibrary } from '../store/useLibrary'
import { useToast } from '../store/useToast'
import { shortDate } from '../utils/dates'

const pad = (n: number) => String(n).padStart(2, '0')

export function EpisodeScreen() {
  const { id = '', season = '1', number = '1' } = useParams()
  const nav = useNavigate()
  const { data: show } = useAsync(() => getShow(id), [id])
  const watched = useLibrary((s) => s.watchedEpisodes)
  const mark = useLibrary((s) => s.markEpisodeWatched)
  const epRatings = useLibrary((s) => s.episodeRatings)
  const setEpisodeRating = useLibrary((s) => s.setEpisodeRating)
  const toast = useToast((s) => s.show)

  if (!show)
    return (
      <div className="scroll-area">
        <span className="skeleton" style={{ height: 220, display: 'block', margin: 16 }} />
      </div>
    )

  const seasonObj = show.seasons.find((s) => String(s.season) === String(season))
  const ep = seasonObj?.episodes.find((e) => String(e.number) === String(number))

  if (!ep)
    return (
      <div className="scroll-area route-fade">
        <div className="app-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="pressable" onClick={() => nav(-1)} aria-label="Back" style={{ color: 'var(--text-dim)' }}>
              <ChevronLeft size={26} />
            </button>
            <h1 style={{ fontSize: 22 }}>Episode</h1>
          </div>
        </div>
        <div className="empty">
          <div className="empty-title">Episode not found</div>
        </div>
      </div>
    )

  const isWatched = !!watched[ep.id]
  const rating = epRatings[ep.id]

  return (
    <div className="scroll-area route-fade">
      <div className="detail-hero" style={{ height: 220 }}>
        <SmartImage src={ep.still ?? show.backdrop} alt={ep.title} />
        <div className="detail-hero-scrim" />
        <button className="icon-btn-float" style={{ left: 14 }} onClick={() => nav(-1)} aria-label="Back">
          <ChevronLeft size={22} />
        </button>
      </div>

      <div className="page-pad" style={{ paddingTop: 14 }}>
        <div className="episode-eyebrow">
          {show.title} · S{pad(Number(season))} · E{pad(ep.number)}
        </div>
        <h1 className="detail-title" style={{ marginTop: 4 }}>
          {ep.title}
        </h1>
        <div className="detail-sub" style={{ marginTop: 6 }}>
          {[ep.airDate ? shortDate(ep.airDate) : null, ep.runtime ? `${ep.runtime} min` : null].filter(Boolean).join('  ·  ')}
        </div>
      </div>

      <div className="detail-actions">
        <button
          className={`action-pill tone-green pressable ${isWatched ? 'active' : ''}`}
          onClick={() => {
            mark(ep.id, !isWatched)
            if (!isWatched) toast('Marked watched')
          }}
        >
          <CheckIcon size={15} /> {isWatched ? 'Watched' : 'Mark watched'}
        </button>
      </div>

      {/* Personal rating (independent of watched status) */}
      <div className="rating-card">
        <div className="rating-card-label">
          Your rating
          {rating != null && <span className="rating-card-value">{rating} ★</span>}
        </div>
        <StarRating value={rating} onChange={(v) => setEpisodeRating(ep.id, v)} />
        <div className="rating-card-hint">
          {rating != null ? 'Tap the same star again to remove your rating' : 'Tap a star to rate this episode'}
        </div>
      </div>

      {ep.overview && <p className="detail-overview">{ep.overview}</p>}
      <div style={{ height: 24 }} />
    </div>
  )
}
