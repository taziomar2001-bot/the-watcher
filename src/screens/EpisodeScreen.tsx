import { useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { SmartImage } from '../components/ui'
import { StarRating } from '../ui/StarRating'
import { ChevronLeft, ChevronRight, CheckIcon } from '../components/Icons'
import { useAsync } from '../hooks/useAsync'
import { getShow } from '../data/catalog'
import { useLibrary } from '../store/useLibrary'
import { useToast } from '../store/useToast'
import { useUpNavigation } from '../logic/nav'
import { PublicScore } from '../ui/PublicScore'
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
  const goUp = useUpNavigation()
  const touch = useRef<{ x: number; y: number } | null>(null)

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

  // Flatten every episode across every season into one ordered sequence so that
  // paging past the first/last episode of a season crosses into the adjacent
  // season automatically.
  const flat = show.seasons.flatMap((s) => s.episodes.map((e) => ({ season: s.season, number: e.number, title: e.title })))
  const curIdx = flat.findIndex((f) => String(f.season) === String(season) && String(f.number) === String(ep.number))
  const prev = curIdx > 0 ? flat[curIdx - 1] : undefined
  const next = curIdx >= 0 && curIdx < flat.length - 1 ? flat[curIdx + 1] : undefined
  // Moving between episodes is a LATERAL move, so it replaces the current entry
  // rather than piling up history — Back then always lands on the season, and
  // the OS back gesture agrees.
  const goTo = (t?: { season: number; number: number }) =>
    t && nav(`/show/${id}/season/${t.season}/episode/${t.number}`, { replace: true })

  // Horizontal swipe → previous / next episode (vertical scrolls are ignored).
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    touch.current = { x: t.clientX, y: t.clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current
    touch.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.4) return
    if (dx < 0) goTo(next)
    else goTo(prev)
  }

  return (
    <div className="scroll-area route-fade" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="detail-hero" style={{ height: 220 }}>
        <SmartImage src={ep.still ?? show.backdrop} alt={ep.title} />
        <div className="detail-hero-scrim" />
        {/* Deterministic hierarchical Back: always to the season that contains
            the currently-viewed episode, regardless of prior swipes. */}
        <button
          className="icon-btn-float"
          style={{ left: 14 }}
          onClick={() => goUp(`/show/${id}/season/${season}`)}
          aria-label="Back to season"
        >
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
        <div className="detail-scores">
          <PublicScore value={ep.communityRating} votes={ep.communityVotes} />
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
        <div className="rating-split">
          <div>
            <div className="rating-card-label">
              Your rating
              {rating != null && <span className="rating-card-value" style={{ marginLeft: 8 }}>{rating} ★</span>}
            </div>
            <StarRating value={rating} onChange={(v) => setEpisodeRating(ep.id, v)} />
          </div>
          {ep.communityRating ? (
            <div className="rating-public">
              <div className="rating-public-label">Everyone</div>
              <PublicScore value={ep.communityRating} votes={ep.communityVotes} compact />
            </div>
          ) : null}
        </div>
        <div className="rating-card-hint">
          {rating != null ? 'Tap the same star again to remove your rating' : 'Tap a star to rate this episode'}
        </div>
      </div>

      {ep.overview && <p className="detail-overview">{ep.overview}</p>}

      <div className="ep-nav">
        <button className="ep-nav-btn pressable" disabled={!prev} onClick={() => goTo(prev)}>
          <ChevronLeft size={18} />
          <span className="ep-nav-text">
            <span className="ep-nav-label">Previous</span>
            {prev && <span className="ep-nav-title">{prev.title}</span>}
          </span>
        </button>
        <button className="ep-nav-btn right pressable" disabled={!next} onClick={() => goTo(next)}>
          <span className="ep-nav-text">
            <span className="ep-nav-label">Next</span>
            {next && <span className="ep-nav-title">{next.title}</span>}
          </span>
          <ChevronRight size={18} />
        </button>
      </div>
      <div style={{ height: 24 }} />
    </div>
  )
}
