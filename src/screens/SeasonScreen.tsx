import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { EpisodeRow } from '../ui/cards'
import { CheckIcon, ListIcon, PeopleIcon } from '../components/Icons'
import { DetailHero, ActionBar, ActionBtn, DetailTabs, useDetailTab } from '../ui/Detail'
import { TitleComments, commentsLabel, useCommentCount } from '../ui/TitleComments'
import { AddToListSheet, useListMembership } from '../ui/AddToList'
import { seasonRef } from '../logic/lists'
import { useAsync } from '../hooks/useAsync'
import { getShow } from '../data/catalog'
import { useLibrary } from '../store/useLibrary'
import { toLibraryItem } from '../utils/media'
import { useToast } from '../store/useToast'
import { useUpNavigation } from '../logic/nav'
import { shortDate } from '../utils/dates'
import { PublicScore } from '../ui/PublicScore'
import { ErrorState } from '../ui/ErrorState'
import { seasonAverageLive, seasonRatedCount, seasonSizesOf, fmtStars } from '../logic/ratings'

const isReleased = (airDate?: string) => !airDate || new Date(airDate + 'T00:00:00') <= new Date()

export function SeasonScreen() {
  const { id = '', season = '1' } = useParams()
  const nav = useNavigate()
  const { data: show, error: loadError, reload } = useAsync(() => getShow(id), [id])
  const watched = useLibrary((s) => s.watchedEpisodes)
  const epRatings = useLibrary((s) => s.episodeRatings)
  const mark = useLibrary((s) => s.markEpisodeWatched)
  const markAll = useLibrary((s) => s.markAllPrevious)
  const markAllUnwatched = useLibrary((s) => s.markAllUnwatched)
  const patchLibraryShow = useLibrary((s) => s.patchLibraryShow)
  const toast = useToast((s) => s.show)
  const goUp = useUpNavigation()
  const [confirmReset, setConfirmReset] = useState(false)
  const [tab, setTab] = useDetailTab<'episodes' | 'comments'>(`season:${id}:${season}`, 'episodes')
  const [listSheet, setListSheet] = useState(false)
  const membership = useListMembership(seasonRef(id, Number(season)))
  const commentCount = useCommentCount(seasonRef(id, Number(season)))

  useEffect(() => {
    if (show) patchLibraryShow(show.id, { ...toLibraryItem(show), seasonSizes: seasonSizesOf(show) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show?.id])

  if (!show && loadError) return <ErrorState page onRetry={reload} />
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
  const seasonAvg = seasonAverageLive(seasonObj, epRatings)
  const ratedCount = seasonRatedCount(seasonObj, epRatings)

  const ref = seasonRef(show.id, seasonObj.season)
  const firstAir = seasonObj.episodes.find((e) => e.airDate)?.airDate

  return (
    <div className="scroll-area route-fade">
      <DetailHero
        backdrop={show.backdrop}
        poster={show.poster}
        eyebrow={
          <button className="dh-up" onClick={() => goUp(`/show/${id}`)}>
            {show.title}
          </button>
        }
        title={seasonObj.name}
        onBack={() => goUp(`/show/${id}`)}
        backLabel="Back to show"
        meta={[`${seasonObj.episodes.length} episode${seasonObj.episodes.length === 1 ? '' : 's'}`, firstAir ? firstAir.slice(0, 4) : null].filter(Boolean).join(' · ')}
      >
        <div className="dh-scores">
          {seasonObj.communityRating ? <PublicScore value={seasonObj.communityRating} votes={seasonObj.communityVotes} /> : null}
          {seasonAvg != null && <span className="dh-mine">{fmtStars(seasonAvg)} you</span>}
        </div>
      </DetailHero>

      <ActionBar>
        <ActionBtn
          icon={<CheckIcon size={22} />}
          label={allWatched ? 'Watched' : anyWatched ? 'Watch rest' : 'Watch all'}
          on={allWatched}
          tone="green"
          onClick={() => {
            if (allWatched) return setConfirmReset(true)
            markAll(releasedIds)
            toast('Season marked watched')
          }}
        />
        {anyWatched && !allWatched && <ActionBtn icon={<UndoIcon />} label="Unwatch all" onClick={() => setConfirmReset(true)} />}
        <ActionBtn icon={<ListIcon size={22} />} label={membership ? `${membership} list${membership > 1 ? 's' : ''}` : 'Add to list'} on={membership > 0} onClick={() => setListSheet(true)} />
        <ActionBtn
          icon={<PeopleIcon size={22} />}
          label="Community"
          onClick={() => nav(`/communities?topic=show:${show.id}`, { state: { topic: { type: 'show', id: show.id, title: show.title, poster: show.poster } } })}
        />
      </ActionBar>

      <DetailTabs
        tabs={[
          { key: 'episodes', label: 'Episodes' },
          { key: 'comments', label: commentsLabel(commentCount) },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'episodes' && (
        <>
          {/* Season average — only once more than half the episodes are rated */}
          <div className="season-avg-row">
            {seasonAvg != null ? (
              <>
                <span className="season-avg-badge">{fmtStars(seasonAvg)}</span>
                <span className="season-avg-sub">your season average · {ratedCount}/{seasonObj.episodes.length} rated</span>
              </>
            ) : (
              <span className="season-avg-sub">
                Rate more than half the episodes ({ratedCount}/{seasonObj.episodes.length}) to see your season average
              </span>
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
                rating={epRatings[e.id]}
                publicRating={e.communityRating}
                onToggle={() => toggle(e.id)}
                onClick={() => nav(`/show/${id}/season/${seasonObj.season}/episode/${e.number}`)}
              />
            ))}
          </div>
        </>
      )}
      {tab === 'comments' && <TitleComments target={ref} what={`${show.title} ${seasonObj.name}`} />}
      <div style={{ height: 20 }} />
      {listSheet && (
        <AddToListSheet itemRef={ref} meta={{ t: seasonObj.name, s: show.title, p: show.poster, y: firstAir ? Number(firstAir.slice(0, 4)) : undefined }} onClose={() => setListSheet(false)} />
      )}

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
                style={{ background: 'var(--yellow)', color: '#231400', borderColor: 'var(--yellow)' }}
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

function UndoIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
    </svg>
  )
}
