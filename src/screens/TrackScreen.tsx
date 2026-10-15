import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DetailHero, ActionBar, ActionBtn, DetailTabs, useDetailTab } from '../ui/Detail'
import { TitleComments, commentsLabel, useCommentCount } from '../ui/TitleComments'
import { Fact } from './ShowScreen'
import { RatingCard } from './MovieScreen'
import { ProgressDot } from '../ui/primitives'
import { AddToListSheet, useListMembership } from '../ui/AddToList'
import { Sheet } from '../ui/Sheet'
import { HeartIcon, PeopleIcon, PlusIcon, CheckIcon, ListIcon, BookIcon, GamepadIcon } from '../components/Icons'
import { useAsync } from '../hooks/useAsync'
import { getBook } from '../data/books'
import { getGame } from '../data/games'
import { useLibrary, type TrackKind, type TrackState } from '../store/useLibrary'
import { useToast } from '../store/useToast'
import { WORDS, mapKey, notOutYet, toTrackItem, trackColor, trackStatusText } from '../logic/tracks'
import { FAV_LIMIT } from '../logic/stats'
import { PublicScore } from '../ui/PublicScore'
import { ErrorState } from '../ui/ErrorState'
import { shortDate } from '../utils/dates'
import { DOT_COLOR } from '../logic/status'
import { KIND } from '../ui/kinds'
import type { Book, Game, TrackMedia } from '../types'

export const BookScreen = () => <TrackScreen kind="book" />
export const GameScreen = () => <TrackScreen kind="game" />

const daysTo = (iso?: string) => {
  if (!iso) return 0
  const d = new Date(iso + 'T00:00:00').getTime() - new Date(new Date().toDateString()).getTime()
  return Math.max(0, Math.round(d / 86400000))
}
const hrs = (h?: number) => (h ? `${h % 1 ? h.toFixed(1) : h} h` : null)

/** A book or game page: same layout as a movie, with a status instead of "watched". */
function TrackScreen({ kind }: { kind: TrackKind }) {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const w = WORDS[kind]
  const t = useLibrary((s) => s[mapKey(kind)][id])
  const { data: media, error: loadError, loading, reload } = useAsync<TrackMedia | undefined>(
    () => (kind === 'book' ? getBook(id, t?.item) : getGame(id)),
    [id, kind],
  )
  const follow = useLibrary((s) => s.trackFollow)
  const setState = useLibrary((s) => s.trackSetState)
  const setFav = useLibrary((s) => s.trackFavorite)
  const rate = useLibrary((s) => s.trackRate)
  const patch = useLibrary((s) => s.trackPatchItem)
  const setPlatform = useLibrary((s) => s.trackSetPlatform)
  const [platformSheet, setPlatformSheet] = useState(false)
  const favCount = useLibrary((s) => Object.values(s[mapKey(kind)]).filter((x) => x.favorite).length)
  const toast = useToast((s) => s.show)
  const [tab, setTab] = useDetailTab<'about' | 'comments'>(`${kind}:${id}`, 'about')
  const [listSheet, setListSheet] = useState(false)
  const [statusSheet, setStatusSheet] = useState(false)
  const ref = `${kind}:${id}`
  const membership = useListMembership(ref)
  const commentCount = useCommentCount(ref)

  // Keep the saved summary current (release dates and covers change).
  useEffect(() => {
    if (media) patch(kind, id, toTrackItem(media))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media?.id])

  if (!media && (loadError || !loading)) return <ErrorState page onRetry={reload} />
  if (!media)
    return (
      <div className="scroll-area">
        <span className="skeleton" style={{ height: 260, display: 'block' }} />
      </div>
    )

  const item = toTrackItem(media)
  const book = kind === 'book' ? (media as Book) : undefined
  const game = kind === 'game' ? (media as Game) : undefined
  const following = !!t?.followed
  const fav = !!t?.favorite
  const color = trackColor(t)
  const days = notOutYet(media.releaseDate) ? daysTo(media.releaseDate) : 0
  const statusText = days > 0 ? `Out in ${days} day${days === 1 ? '' : 's'}` : trackStatusText(kind, t)
  const state = t?.state
  const played = kind === 'game' && !!state

  const toggleFav = () => {
    if (!fav && favCount >= FAV_LIMIT) return toast(`You can have up to ${FAV_LIMIT} favorite ${w.many} — remove one first.`, { duration: 4200 })
    setFav(kind, id, item, !fav)
  }
  const choose = (s: TrackState | null) => {
    setStatusSheet(false)
    if ((state ?? null) === s) return
    setState(kind, id, s, item)
    toast(s === 'active' ? `${w.active} ${media.title}` : s === 'done' ? `Marked finished` : s === 'stopped' ? `Marked as ${w.stopped}` : 'Marked not started')
  }

  const StatusIcon = kind === 'book' ? BookIcon : GamepadIcon
  const statusLabel = state === 'active' ? w.active : state === 'done' ? w.done : state === 'stopped' ? 'Stopped' : kind === 'book' ? 'Read' : 'Play'

  const meta =
    kind === 'book'
      ? [book!.authors.slice(0, 2).join(', '), book!.year, book!.pageCount ? `${book!.pageCount} pages` : null].filter(Boolean).join(' · ')
      : [game!.year, game!.developer, game!.platforms.slice(0, 3).join(', ')].filter(Boolean).join(' · ')

  return (
    <div className="scroll-area route-fade">
      <DetailHero backdrop={game?.backdrop ?? media.poster} blurBackdrop={!game?.backdrop} poster={media.poster} title={media.title} onBack={() => nav(-1)} meta={meta}>
        <div className="dh-scores">
          <PublicScore value={media.communityRating} votes={media.communityVotes} source={KIND[kind].source} />
          {t?.rating != null && <span className="dh-mine">{t.rating} ★ you</span>}
        </div>
        {statusText && color && (
          <div className="dh-status">
            <ProgressDot color={color} /> {statusText}
          </div>
        )}
      </DetailHero>

      <ActionBar>
        {kind === 'game' ? (
          <>
            <ActionBtn
              icon={following || played ? <CheckIcon size={22} /> : <PlusIcon size={22} />}
              label={played ? 'In library' : following ? (notOutYet(media.releaseDate) ? 'Following' : 'On shelf') : 'Shelf'}
              on={following || played}
              tone="gold"
              onClick={() => {
                follow(kind, id, item, !following)
                toast(following ? `Removed from your shelf` : notOutYet(media.releaseDate) ? `Following ${media.title}` : `On your shelf`)
              }}
            />
            <ActionBtn
              icon={<GamepadIcon size={22} />}
              label="Played"
              on={played}
              tone="green"
              onClick={() => {
                if (played) return setPlatformSheet(true)
                if (notOutYet(media.releaseDate)) return toast('Not out yet — mark it played once it’s released')
                setState(kind, id, 'done', item)
                if (game!.platforms.length === 1) setPlatform(kind, id, game!.platforms[0])
                if (game!.platforms.length > 1) setPlatformSheet(true)
                else toast('Marked played')
              }}
            />
          </>
        ) : (
          <>
            <ActionBtn
              icon={following ? <CheckIcon size={22} /> : <PlusIcon size={22} />}
              label={following ? 'Following' : 'Follow'}
              on={following}
              tone="gold"
              onClick={() => {
                follow(kind, id, item, !following)
                toast(following ? `Unfollowed ${media.title}` : `Following ${media.title}`)
              }}
            />
            <ActionBtn
              icon={<StatusIcon size={22} />}
              label={statusLabel}
              on={!!state}
              tone={state === 'done' ? 'green' : state === 'stopped' ? 'red' : state === 'active' ? 'orange' : undefined}
              onClick={() => setStatusSheet(true)}
            />
          </>
        )}
        <ActionBtn icon={<HeartIcon size={22} fill={fav ? 'currentColor' : 'none'} />} label="Favorite" on={fav} tone="red" onClick={toggleFav} />
        <ActionBtn icon={<ListIcon size={22} />} label={membership ? `${membership} list${membership > 1 ? 's' : ''}` : 'Add to list'} on={membership > 0} onClick={() => setListSheet(true)} />
        <ActionBtn
          icon={<PeopleIcon size={22} />}
          label="Community"
          onClick={() => nav(`/communities?topic=${kind}:${id}`, { state: { topic: { type: kind, id, title: media.title, poster: media.poster, year: media.year } } })}
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
            value={t?.rating}
            onChange={(v) => rate(kind, id, v, item)}
            publicValue={media.communityRating}
            publicVotes={media.communityVotes}
            hint={`Tap a star to rate — rating is separate from ${kind === 'book' ? 'reading' : 'playing'}`}
          />
          {media.overview && <p className="detail-overview">{media.overview}</p>}
          {media.genres.length > 0 && (
            <div className="genre-row">
              {media.genres.map((g) => (
                <span key={g} className="genre-chip">
                  {g}
                </span>
              ))}
            </div>
          )}
          <dl className="facts">
            {book && (
              <>
                {book.authors.length > 0 && <Fact k={book.authors.length > 1 ? 'Authors' : 'Author'} v={book.authors.join(', ')} />}
                {book.releaseDate ? <Fact k="Published" v={shortDate(book.releaseDate)} /> : book.year ? <Fact k="Published" v={String(book.year)} /> : null}
                {book.pageCount ? <Fact k="Pages" v={book.pageCount.toLocaleString()} /> : null}
                {book.publisher && <Fact k="Publisher" v={book.publisher} />}
                {book.isbn && <Fact k="ISBN" v={book.isbn} />}
              </>
            )}
            {game && (
              <>
                {game.developer && <Fact k="Developer" v={game.developer} />}
                {game.publisher && game.publisher !== game.developer && <Fact k="Publisher" v={game.publisher} />}
                {game.releaseDate && <Fact k="Release date" v={shortDate(game.releaseDate)} />}
                {game.platforms.length > 0 && <Fact k="Platforms" v={game.platforms.join(', ')} />}
                {game.modes && game.modes.length > 0 && <Fact k="Modes" v={game.modes.join(', ')} />}
                {game.timeToBeat && (
                  <Fact
                    k="Time to beat"
                    v={[
                      hrs(game.timeToBeat.normally) && `Main story ~${hrs(game.timeToBeat.normally)}`,
                      hrs(game.timeToBeat.completely) && `100% ~${hrs(game.timeToBeat.completely)}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  />
                )}
              </>
            )}
          </dl>
          <div className="data-credit">Data from {KIND[kind].source}</div>
        </div>
      )}
      {tab === 'comments' && <TitleComments target={ref} what={media.title} />}

      <div style={{ height: 20 }} />
      {listSheet && <AddToListSheet itemRef={ref} meta={{ t: media.title, p: media.poster, y: media.year }} onClose={() => setListSheet(false)} />}
      {platformSheet && game && (
        <Sheet onClose={() => setPlatformSheet(false)} label="Where did you play it?">
          <div className="sheet-title">Where did you play it?</div>
          <div className="vis-hint" style={{ padding: '0 6px 6px' }}>Optional — it feeds your “Played on” stats.</div>
          {game.platforms.map((p) => (
            <button
              key={p}
              className={`status-row pressable ${t?.platform === p ? 'on' : ''}`}
              role="radio"
              aria-checked={t?.platform === p}
              onClick={() => {
                setPlatform(kind, id, t?.platform === p ? null : p)
                setPlatformSheet(false)
                toast(t?.platform === p ? 'Marked played' : `Played on ${p}`)
              }}
            >
              <span className="status-row-text">
                <span className="status-row-label">{p}</span>
              </span>
              {t?.platform === p && <CheckIcon size={18} />}
            </button>
          ))}
          <button className="status-row pressable" onClick={() => setPlatformSheet(false)}>
            <span className="status-row-text">
              <span className="status-row-label">{t?.platform ? 'Done' : 'Skip'}</span>
            </span>
          </button>
          <button
            className="status-row pressable"
            onClick={() => {
              setPlatformSheet(false)
              setState(kind, id, null, item)
              toast(following ? 'Back on your shelf' : 'Marked not played')
            }}
          >
            <span className="status-row-dot" style={{ background: DOT_COLOR.yellow }} />
            <span className="status-row-text">
              <span className="status-row-label">Not played yet</span>
              <span className="status-row-hint">Put it back on your shelf</span>
            </span>
          </button>
        </Sheet>
      )}
      {statusSheet && (
        <Sheet onClose={() => setStatusSheet(false)} label={`${media.title} status`}>
          <div className="sheet-title">{media.title}</div>
          <StatusRow color="yellow" label={w.active} hint={kind === 'book' ? 'You’re reading it now' : 'You’re playing it now'} on={state === 'active'} onClick={() => choose('active')} />
          <StatusRow color="green" label={w.done} hint={kind === 'book' ? 'You read it to the end' : 'You beat it or are done with it'} on={state === 'done'} onClick={() => choose('done')} />
          <StatusRow
            color="red"
            label={w.stopped}
            hint={state ? 'You put it down midway' : `Start ${kind === 'book' ? 'reading' : 'playing'} first`}
            on={state === 'stopped'}
            disabled={!state}
            onClick={() => choose('stopped')}
          />
          {state && <StatusRow color="orange" label={w.notStarted} hint="Clear the status (your rating stays)" on={false} onClick={() => choose(null)} />}
        </Sheet>
      )}
    </div>
  )
}

function StatusRow({ color, label, hint, on, disabled, onClick }: { color: keyof typeof DOT_COLOR; label: string; hint: string; on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button className={`status-row pressable ${on ? 'on' : ''}`} role="radio" aria-checked={on} disabled={disabled} onClick={onClick}>
      <span className="status-row-dot" style={{ background: DOT_COLOR[color] }} />
      <span className="status-row-text">
        <span className="status-row-label">{label}</span>
        <span className="status-row-hint">{hint}</span>
      </span>
      {on && <CheckIcon size={18} />}
    </button>
  )
}
