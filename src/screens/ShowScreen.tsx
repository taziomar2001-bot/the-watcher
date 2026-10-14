import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { SmartImage } from '../components/ui'
import { SeasonCard, ActionPill } from '../ui/cards'
import { ProgressDot } from '../ui/primitives'
import { ChevronLeft, HeartIcon, BellIcon, CheckIcon } from '../components/Icons'
import { useAsync } from '../hooks/useAsync'
import { getShow } from '../data/catalog'
import { useLibrary } from '../store/useLibrary'
import { toLibraryItem } from '../utils/media'
import { useToast } from '../store/useToast'
import { classifyShow, seasonColor, showColor, DOT_COLOR, effectiveSeen } from '../logic/status'
import { showAverageLive, seasonSizesOf, fmtStars } from '../logic/ratings'
import { AddToListButton } from '../ui/AddToList'
import { useToggleFavorite } from '../logic/favorites'
import { PublicScore } from '../ui/PublicScore'
import type { Season, Show } from '../types'

const isReleased = (airDate?: string) => !airDate || new Date(airDate + 'T00:00:00') <= new Date()
const isEnded = (s: Show) => /ended|canceled|cancelled/i.test(s.status || '')

/** Enriched summary carrying released/total/ended for accurate classification. */
function enrichedItem(show: Show, existing?: import('../store/useLibrary').LibraryItem) {
  const all = show.seasons.flatMap((s) => s.episodes)
  return {
    ...(existing ?? {}),
    ...toLibraryItem(show),
    totalEpisodes: show.totalEpisodes || all.length,
    releasedEpisodes: all.filter((e) => isReleased(e.airDate)).length,
    ended: isEnded(show),
    seen: existing?.seen,
  } as import('../store/useLibrary').LibraryItem
}

export function ShowScreen() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { data: show } = useAsync(() => getShow(id), [id])
  const lib = useLibrary()
  const toast = useToast((s) => s.show)
  const toggleFavorite = useToggleFavorite()

  // Cache the enriched show summary (released/total/ended) + one-time backfill.
  useEffect(() => {
    if (!show) return
    const allEps = show.seasons.flatMap((s) => s.episodes)
    const aired = allEps.filter((e) => isReleased(e.airDate) && e.airDate).map((e) => e.airDate as string)
    lib.patchLibraryShow(show.id, {
      ...toLibraryItem(show),
      totalEpisodes: show.totalEpisodes || allEps.length,
      releasedEpisodes: allEps.filter((e) => isReleased(e.airDate)).length,
      latestReleaseDate: aired.length ? aired.sort()[aired.length - 1] : undefined,
      ended: isEnded(show),
      seasonSizes: seasonSizesOf(show),
    })
    const seen = lib.libraryShows[show.id]?.seen ?? 0
    if (seen > 0) {
      const released = show.seasons
        .flatMap((s) => s.episodes)
        .filter((e) => isReleased(e.airDate))
        .map((e) => e.id)
      lib.backfillSeen(show.id, released, seen)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show?.id])

  if (!show)
    return (
      <div className="scroll-area">
        <span className="skeleton" style={{ height: 260, display: 'block' }} />
      </div>
    )

  const item = enrichedItem(show, lib.libraryShows[show.id])
  const total = item.totalEpisodes ?? 0
  const cls = classifyShow(item, lib.watchedEpisodes)
  const following = !!lib.watchlistShows[show.id]
  const fav = !!lib.favoriteShows[show.id]
  const notify = !!lib.notifyShows[show.id]
  const stopped = !!lib.stoppedShows[show.id]
  const color = showColor(cls, stopped)

  const seen = effectiveSeen(item, lib.watchedEpisodes)
  const pct = total ? Math.min(100, Math.round((seen / total) * 100)) : 0
  const started = seen > 0
  const showAvg = showAverageLive(show, lib.episodeRatings)
  const allReleasedIds = show.seasons.flatMap((s) => s.episodes).filter((e) => isReleased(e.airDate)).map((e) => e.id)

  return (
    <div className="scroll-area route-fade">
      <div className="detail-hero">
        <SmartImage src={show.backdrop} alt={show.title} />
        <div className="detail-hero-scrim" />
        <button className="icon-btn-float" style={{ left: 14 }} onClick={() => nav(-1)} aria-label="Back">
          <ChevronLeft size={22} />
        </button>
      </div>

      <div className="detail-headrow">
        <SmartImage src={show.poster} alt={show.title} className="detail-poster" />
        <div className="detail-headinfo">
          <h1 className="detail-title">{show.title}</h1>
          <div className="detail-sub">
            {[show.firstAirYear, `${show.seasons.length} season${show.seasons.length === 1 ? '' : 's'}`, show.network]
              .filter(Boolean)
              .join('  ·  ')}
          </div>
          <div className="detail-scores">
            <PublicScore value={show.communityRating} votes={show.communityVotes} />
            {showAvg != null && <div className="detail-avg">{fmtStars(showAvg)} your average</div>}
          </div>
        </div>
      </div>

      <div className="detail-actions">
        <ActionPill
          label={following ? 'Following' : 'Follow'}
          icon={following ? 'check' : 'plus'}
          active={following}
          onClick={() => {
            lib.toggleWatchlistShow(show.id, toLibraryItem(show))
            toast(following ? 'Unfollowed' : 'Following')
          }}
        />
        <button className={`action-pill pressable ${fav ? 'active' : ''}`} onClick={() => toggleFavorite('show', show.id, toLibraryItem(show))}>
          <HeartIcon size={15} fill={fav ? '#ff5964' : 'none'} /> Favorite
        </button>
        <button className={`action-pill pressable ${notify ? 'active' : ''}`} onClick={() => lib.toggleNotify(show.id)}>
          <BellIcon size={15} /> Notify
        </button>
        <AddToListButton type="show" id={show.id} />
      </div>

      {/* Status controls */}
      <div className="detail-actions" style={{ paddingTop: 0 }}>
        {stopped ? (
          <button
            className="action-pill pressable"
            onClick={() => {
              lib.setStopped(show.id, false)
              toast('Resumed watching')
            }}
          >
            Resume Watching
          </button>
        ) : (
          started && (
            <button
              className="action-pill pressable"
              onClick={() => {
                lib.setStopped(show.id, true, toLibraryItem(show))
                toast('Marked as Stopped Watching')
              }}
            >
              Stop Watching
            </button>
          )
        )}
        {cls !== 'finished' && !stopped && (
          <button
            className="action-pill tone-green pressable"
            onClick={() => {
              lib.markAllPrevious(allReleasedIds)
              toast('Marked all released episodes watched')
            }}
          >
            <CheckIcon size={15} /> Mark Completed
          </button>
        )}
      </div>

      <div className="detail-progress">
        <ProgressDot color={color} />
        <div className="progress-track">
          <i style={{ width: `${pct}%`, background: DOT_COLOR[color] }} />
        </div>
        <span>
          {seen}/{total}
        </span>
      </div>

      {show.overview && <p className="detail-overview">{show.overview}</p>}
      {show.genres.length > 0 && (
        <div className="genre-row">
          {show.genres.map((g) => (
            <span key={g} className="genre-chip">
              {g}
            </span>
          ))}
        </div>
      )}

      <div className="section-header">
        <div className="section-header-title">Seasons</div>
      </div>
      <div className="card-list">
        {show.seasons.map((s) => (
          <SeasonCard
            key={s.season}
            artwork={show.backdrop}
            name={s.name}
            episodeCount={s.episodes.length}
            color={seasonColorOf(s, lib.watchedEpisodes)}
            onClick={() => nav(`/show/${show.id}/season/${s.season}`)}
          />
        ))}
      </div>
      <div style={{ height: 20 }} />
    </div>
  )
}

// Season colour is always independent of the parent's stopped status.
function seasonColorOf(season: Season, watched: Record<string, true>) {
  const released = season.episodes.filter((e) => isReleased(e.airDate))
  const anyWatched = released.some((e) => watched[e.id])
  const allWatched = released.length > 0 && released.every((e) => watched[e.id])
  return seasonColor(allWatched, anyWatched)
}
