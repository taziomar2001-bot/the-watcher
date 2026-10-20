import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ConfirmSheet } from '../ui/Sheet'
import { useNavigate, useParams } from 'react-router-dom'
import { SeasonCard } from '../ui/cards'
import { DetailHero, ActionBar, ActionBtn, DetailTabs, useDetailTab } from '../ui/Detail'
import { TitleComments, commentsLabel, useCommentCount } from '../ui/TitleComments'
import { ProgressDot } from '../ui/primitives'
import { HeartIcon, CheckIcon, PeopleIcon, PlusIcon, ListIcon } from '../components/Icons'
import { useAsync } from '../hooks/useAsync'
import { getShow } from '../data/catalog'
import { useLibrary } from '../store/useLibrary'
import { toLibraryItem } from '../utils/media'
import { useToast } from '../store/useToast'
import { classifyShow, seasonColor, showColor, DOT_COLOR, effectiveSeen, latestAired } from '../logic/status'
import { showAverageLive, seasonSizesOf, fmtStars } from '../logic/ratings'
import { AddToListSheet, useListMembership } from '../ui/AddToList'
import { useToggleFavorite } from '../logic/favorites'
import { PublicScore } from '../ui/PublicScore'
import { ErrorState } from '../ui/ErrorState'
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
    latestEpisodeId: latestAired(all)?.id ?? '',
    ended: isEnded(show),
    seen: existing?.seen,
  } as import('../store/useLibrary').LibraryItem
}

export function ShowScreen() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { data: show, error: loadError, reload } = useAsync(() => getShow(id), [id])
  const lib = useLibrary()
  const toast = useToast((s) => s.show)
  const toggleFavorite = useToggleFavorite()
  const [tab, setTab] = useDetailTab<'episodes' | 'about' | 'comments'>(`show:${id}`, 'about')
  const [listSheet, setListSheet] = useState(false)
  const [statusSheet, setStatusSheet] = useState(false)
  const [confirmComplete, setConfirmComplete] = useState(false)
  const membership = useListMembership(`show:${id}`)
  const commentCount = useCommentCount(`show:${id}`)

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
      latestEpisodeId: latestAired(allEps)?.id ?? '',
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

  if (!show && loadError) return <ErrorState page onRetry={reload} />
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
  const stopped = !!lib.stoppedShows[show.id]
  const color = showColor(cls, stopped)

  const seen = effectiveSeen(item, lib.watchedEpisodes)
  const pct = total ? Math.min(100, Math.round((seen / total) * 100)) : 0
  const started = seen > 0
  const showAvg = showAverageLive(show, lib.episodeRatings)
  const allReleasedIds = show.seasons.flatMap((s) => s.episodes).filter((e) => isReleased(e.airDate)).map((e) => e.id)

  const listCount = membership
  const ref = `show:${show.id}`

  return (
    <div className="scroll-area route-fade">
      <DetailHero
        backdrop={show.backdrop}
        poster={show.poster}
        title={show.title}
        onBack={() => nav(-1)}
        meta={[show.firstAirYear, `${show.seasons.length} season${show.seasons.length === 1 ? '' : 's'}`, show.network].filter(Boolean).join(' · ')}
      >
        <div className="dh-scores">
          <PublicScore value={show.communityRating} votes={show.communityVotes} />
          {showAvg != null && <span className="dh-mine">{fmtStars(showAvg)} you</span>}
        </div>
      </DetailHero>

      <ActionBar>
        <ActionBtn
          icon={following ? <CheckIcon size={22} /> : <PlusIcon size={22} />}
          label={following ? 'Following' : 'Follow'}
          on={following}
          tone="gold"
          onClick={() => {
            lib.toggleWatchlistShow(show.id, toLibraryItem(show))
            toast(following ? 'Unfollowed' : 'Following')
          }}
        />
        <ActionBtn icon={<HeartIcon size={22} fill={fav ? 'currentColor' : 'none'} />} label="Favorite" on={fav} tone="red" onClick={() => toggleFavorite('show', show.id, toLibraryItem(show))} />
        <ActionBtn icon={<ListIcon size={22} />} label={listCount ? `${listCount} list${listCount > 1 ? 's' : ''}` : 'Add to list'} on={listCount > 0} onClick={() => setListSheet(true)} />
        <ActionBtn
          icon={<PeopleIcon size={22} />}
          label="Community"
          onClick={() => nav(`/communities?topic=show:${show.id}`, { state: { topic: { type: 'show', id: show.id, title: show.title, poster: show.poster } } })}
        />
        <ActionBtn
          icon={stopped ? <PauseIcon /> : <FlagIcon />}
          label={stopped ? 'Stopped' : cls === 'finished' ? 'Completed' : 'Status'}
          on={stopped || cls === 'finished'}
          tone={cls === 'finished' && !stopped ? 'green' : undefined}
          onClick={() => setStatusSheet(true)}
        />
      </ActionBar>

      <div className="detail-progress">
        <ProgressDot color={color} />
        <div className="progress-track">
          <i style={{ width: `${pct}%`, background: DOT_COLOR[color] }} />
        </div>
        <span>
          {seen}/{total}
        </span>
      </div>

      <DetailTabs
        tabs={[
          { key: 'about', label: 'About' },
          { key: 'episodes', label: 'Episodes' },
          { key: 'comments', label: commentsLabel(commentCount) },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'episodes' && (
        <>
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
        </>
      )}

      {tab === 'about' && (
        <div className="about">
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
          <dl className="facts">
            {show.network && <Fact k="Network" v={show.network} />}
            {show.status && <Fact k="Status" v={show.status} />}
            {show.firstAirYear && <Fact k="First aired" v={String(show.firstAirYear)} />}
            <Fact k="Episodes" v={`${total} across ${show.seasons.length} season${show.seasons.length === 1 ? '' : 's'}`} />
            {show.platforms.length > 0 && <Fact k="Where to watch" v={show.platforms.join(', ')} />}
            {showAvg != null && <Fact k="Your average" v={fmtStars(showAvg)} />}
          </dl>
        </div>
      )}

      {tab === 'comments' && <TitleComments target={ref} what={show.title} />}

      <div style={{ height: 20 }} />
      {statusSheet &&
        createPortal(
          <div className="sheet-backdrop" onClick={() => setStatusSheet(false)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-handle" />
              <div className="sheet-title">{show.title}</div>
              {cls !== 'finished' && !stopped && (
                <button
                  className="sheet-row"
                  onClick={() => {
                    setStatusSheet(false)
                    setConfirmComplete(true)
                  }}
                >
                  <span>
                    <CheckIcon size={16} /> Mark completed
                  </span>
                </button>
              )}
              {stopped ? (
                <button
                  className="sheet-row"
                  onClick={() => {
                    lib.setStopped(show.id, false)
                    setStatusSheet(false)
                    toast('Resumed watching')
                  }}
                >
                  <span>
                    <FlagIcon size={16} /> Resume watching
                  </span>
                </button>
              ) : (
                <button
                  className="sheet-row"
                  disabled={!started}
                  style={!started ? { opacity: 0.45 } : undefined}
                  onClick={() => {
                    lib.setStopped(show.id, true, toLibraryItem(show))
                    setStatusSheet(false)
                    toast('Marked as Stopped Watching')
                  }}
                >
                  <span>
                    <PauseIcon size={16} /> Stopped watching{!started ? ' (start watching first)' : ''}
                  </span>
                </button>
              )}
              {cls === 'finished' && !stopped && <div className="vis-hint" style={{ padding: '8px 4px' }}>You’ve watched every released episode.</div>}
            </div>
          </div>,
          document.body,
        )}
      {confirmComplete && (
        <ConfirmSheet
          title="Mark as completed?"
          body={`Every released episode of ${show.title} (${allReleasedIds.length}) will be marked as watched.`}
          confirmLabel="Mark completed"
          onCancel={() => setConfirmComplete(false)}
          onConfirm={() => {
            setConfirmComplete(false)
            lib.markAllPrevious(allReleasedIds)
            toast('Marked all released episodes watched')
          }}
        />
      )}
      {listSheet && <AddToListSheet itemRef={ref} meta={{ t: show.title, p: show.poster, y: show.firstAirYear }} onClose={() => setListSheet(false)} />}
    </div>
  )
}

export function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="fact">
      <dt>{k}</dt>
      <dd>{v}</dd>
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

function FlagIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 21V4" />
      <path d="M5 4h11l-2 4 2 4H5" />
    </svg>
  )
}

function PauseIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M10 9v6M14 9v6" />
    </svg>
  )
}
