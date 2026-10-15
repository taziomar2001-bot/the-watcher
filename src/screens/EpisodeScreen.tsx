import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, CheckIcon, ListIcon, PeopleIcon } from '../components/Icons'
import { DetailHero, ActionBar, ActionBtn, DetailTabs, useDetailTab } from '../ui/Detail'
import { TitleComments, commentsLabel, useCommentCount } from '../ui/TitleComments'
import { AddToListSheet, useListMembership } from '../ui/AddToList'
import { RatingCard } from './MovieScreen'
import { episodeRef } from '../logic/lists'
import { useAsync } from '../hooks/useAsync'
import { getShow } from '../data/catalog'
import { useLibrary } from '../store/useLibrary'
import { useToast } from '../store/useToast'
import { useUpNavigation } from '../logic/nav'
import { PublicScore } from '../ui/PublicScore'
import { ErrorState } from '../ui/ErrorState'
import { shortDate } from '../utils/dates'

const pad = (n: number) => String(n).padStart(2, '0')

export function EpisodeScreen() {
  const { id = '', season = '1', number = '1' } = useParams()
  const nav = useNavigate()
  const { data: show, error: loadError, reload } = useAsync(() => getShow(id), [id])
  const watched = useLibrary((s) => s.watchedEpisodes)
  const mark = useLibrary((s) => s.markEpisodeWatched)
  const epRatings = useLibrary((s) => s.episodeRatings)
  const setEpisodeRating = useLibrary((s) => s.setEpisodeRating)
  const toast = useToast((s) => s.show)
  const goUp = useUpNavigation()
  const touch = useRef<{ x: number; y: number } | null>(null)
  const epKey = episodeRef(id, Number(season), Number(number))
  const [tab, setTab] = useDetailTab<'about' | 'comments'>(epKey, 'about')
  const [listSheet, setListSheet] = useState(false)
  const membership = useListMembership(epKey)
  const commentCount = useCommentCount(epKey)

  if (!show && loadError) return <ErrorState page onRetry={reload} />
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
    // From the very edge it's the back swipe, not "previous episode".
    touch.current = t.clientX < 24 ? null : { x: t.clientX, y: t.clientY }
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

  const ref = episodeRef(id, Number(season), ep.number)

  return (
    <div className="scroll-area route-fade" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* Deterministic hierarchical Back: always to the season that contains
          the currently-viewed episode, regardless of prior swipes. */}
      <DetailHero
        still
        backdrop={ep.still ?? show.backdrop}
        title={ep.title}
        onBack={() => goUp(`/show/${id}/season/${season}`)}
        backLabel="Back to season"
        eyebrow={
          <button className="dh-up" onClick={() => goUp(`/show/${id}/season/${season}`)}>
            {show.title} · S{pad(Number(season))} E{pad(ep.number)}
          </button>
        }
        meta={[ep.airDate ? shortDate(ep.airDate) : null, ep.runtime ? `${ep.runtime} min` : null].filter(Boolean).join(' · ')}
      >
        <div className="dh-scores">
          <PublicScore value={ep.communityRating} votes={ep.communityVotes} />
          {rating != null && <span className="dh-mine">{rating} ★ you</span>}
        </div>
      </DetailHero>

      <ActionBar>
        <ActionBtn
          icon={<CheckIcon size={22} />}
          label={isWatched ? 'Watched' : 'Mark watched'}
          on={isWatched}
          tone="green"
          onClick={() => {
            mark(ep.id, !isWatched)
            if (!isWatched) toast('Marked watched')
          }}
        />
        <ActionBtn icon={<ListIcon size={22} />} label={membership ? `${membership} list${membership > 1 ? 's' : ''}` : 'Add to list'} on={membership > 0} onClick={() => setListSheet(true)} />
        <ActionBtn
          icon={<PeopleIcon size={22} />}
          label="Community"
          onClick={() => nav(`/communities?topic=show:${show.id}`, { state: { topic: { type: 'show', id: show.id, title: show.title, poster: show.poster } } })}
        />
      </ActionBar>

      <DetailTabs
        tabs={[
          { key: 'about', label: 'About' },
          { key: 'comments', label: commentsLabel(commentCount) },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'about' && (
        <div className="about">
          <RatingCard
            value={rating}
            onChange={(v) => setEpisodeRating(ep.id, v)}
            publicValue={ep.communityRating}
            publicVotes={ep.communityVotes}
            hint="Tap a star to rate this episode"
          />
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
        </div>
      )}
      {tab === 'comments' && <TitleComments target={ref} what={`${show.title} S${pad(Number(season))}E${pad(ep.number)}`} />}
      <div style={{ height: 24 }} />
      {listSheet && (
        <AddToListSheet
          itemRef={ref}
          meta={{ t: ep.title, s: show.title, p: ep.still ?? show.backdrop ?? show.poster, y: ep.airDate ? Number(ep.airDate.slice(0, 4)) : undefined }}
          onClose={() => setListSheet(false)}
        />
      )}
    </div>
  )
}
