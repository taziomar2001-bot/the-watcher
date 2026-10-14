import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft } from '../components/Icons'
import { SmartImage } from '../components/ui'
import { Segmented } from '../ui/primitives'
import { PublicScore } from '../ui/PublicScore'
import { nameOf } from '../ui/social'
import { useSync } from '../logic/sync'
import { useLibrary } from '../store/useLibrary'
import { useToast } from '../store/useToast'
import { discoverPage, genreList } from '../data/catalog'
import { profilesByIds } from '../data/communities'
import type { SocialProfile } from '../data/social'
import {
  createSession,
  endSession,
  getSession,
  joinSession,
  latestOpenSession,
  listSwipes,
  seeded,
  swipe,
  watchSession,
  type MatchSession,
  type Swipe,
} from '../data/match'
import type { Media, Movie, Show } from '../types'

interface Card {
  id: string
  title: string
  poster?: string
  year?: number
  score?: number
  votes?: number
  genres: string[]
  overview?: string
}
const toCard = (m: Media): Card => ({
  id: m.id,
  title: m.title,
  poster: m.poster,
  year: m.type === 'movie' ? (m as Movie).year : (m as Show).firstAirYear,
  score: m.communityRating,
  votes: m.communityVotes,
  genres: m.genres,
  overview: m.overview,
})

const ERRORS: Record<string, string> = {
  code_not_found: 'No open session with that code',
  session_full: 'That session already has two people',
  too_many_sessions: 'Too many sessions started — try again later',
  not_set_up: 'Watch together isn’t switched on yet (run 008_watch_together.sql)',
}

function Header({ title, sub }: { title: string; sub?: string }) {
  const nav = useNavigate()
  return (
    <div className="app-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <button className="pressable" onClick={() => nav(-1)} aria-label="Back" style={{ color: 'var(--text-dim)' }}>
          <ChevronLeft size={26} />
        </button>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 24 }}>{title}</h1>
          {sub && <div className="sub">{sub}</div>}
        </div>
      </div>
    </div>
  )
}

/** Start or join a Watch together session. */
export function MatchHomeScreen() {
  const nav = useNavigate()
  const toast = useToast((s) => s.show)
  const signedIn = useSync((s) => s.status === 'signedIn')
  const [mode, setMode] = useState<'home' | 'setup'>('home')
  const [code, setCode] = useState('')
  const [kind, setKind] = useState<'movie' | 'show'>('movie')
  const [genres, setGenres] = useState<{ id: number; name: string }[]>([])
  const [genre, setGenre] = useState<{ id: number; name: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [resume, setResume] = useState<MatchSession | null>(null)

  useEffect(() => {
    if (signedIn) latestOpenSession().then(setResume)
  }, [signedIn])
  useEffect(() => {
    let alive = true
    setGenre(null)
    genreList(kind)
      .then((g) => alive && setGenres(g))
      .catch(() => alive && setGenres([]))
    return () => {
      alive = false
    }
  }, [kind])

  if (!signedIn)
    return (
      <div className="scroll-area route-fade">
        <Header title="Watch together" />
        <div className="empty">
          <div className="empty-title">Sign in to watch together</div>
          <div className="empty-sub">Both of you need a Watcher account.</div>
        </div>
      </div>
    )

  const start = async () => {
    setBusy(true)
    const r = await createSession(kind, genre ?? undefined)
    setBusy(false)
    if (!r.ok) return toast(ERRORS[r.code] ?? 'Couldn’t start a session')
    nav(`/discover/match/${r.id}`, { replace: true })
  }
  const join = async () => {
    const c = code.trim().toUpperCase()
    if (c.length !== 6) return
    setBusy(true)
    const r = await joinSession(c)
    setBusy(false)
    if (!r.ok) return toast(ERRORS[r.code] ?? 'Couldn’t join that session')
    nav(`/discover/match/${r.id}`, { replace: true })
  }

  return (
    <div className="scroll-area route-fade">
      <Header title="Watch together" sub="Swipe with a friend until you both like the same thing" />
      {mode === 'home' ? (
        <div className="page-pad match-home">
          {resume && (
            <button className="community-link pressable" style={{ margin: '0 0 12px', width: '100%' }} onClick={() => nav(`/discover/match/${resume.id}`)}>
              Resume your session · {resume.code}
            </button>
          )}
          <div className="match-option">
            <div className="match-option-title">Start a session</div>
            <div className="vis-hint">Pick movies or shows and a genre, then share the code with your friend.</div>
            <button className="welcome-primary pressable" onClick={() => setMode('setup')}>
              Start
            </button>
          </div>
          <div className="match-option">
            <div className="match-option-title">Join with a code</div>
            <form
              className="code-row"
              onSubmit={(e) => {
                e.preventDefault()
                void join()
              }}
            >
              <input
                className="sync-input code-input"
                inputMode="text"
                autoCapitalize="characters"
                autoCorrect="off"
                maxLength={6}
                placeholder="ABC123"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              />
              <button type="submit" className="follow-btn primary pressable" disabled={code.length !== 6 || busy}>
                Join
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="page-pad picker-controls">
          <Segmented
            options={[
              { key: 'movie', label: 'Movies' },
              { key: 'show', label: 'TV shows' },
            ]}
            value={kind}
            onChange={setKind}
          />
          {genres.length > 0 && (
            <div className="genre-chips">
              <button className={`toggle-pill pressable ${!genre ? 'active' : ''}`} onClick={() => setGenre(null)}>
                Any genre
              </button>
              {genres.map((g) => (
                <button key={g.id} className={`toggle-pill pressable ${genre?.id === g.id ? 'active' : ''}`} onClick={() => setGenre(g)}>
                  {g.name}
                </button>
              ))}
            </div>
          )}
          <button className="welcome-primary pressable" disabled={busy} onClick={() => void start()}>
            {busy ? 'Starting…' : 'Create session'}
          </button>
          <button className="welcome-switch pressable" onClick={() => setMode('home')}>
            Back
          </button>
        </div>
      )}
    </div>
  )
}

/** A live session: waiting room, then the shared swipe deck. */
export function MatchSessionScreen() {
  const nav = useNavigate()
  const { id = '' } = useParams()
  const me = useSync((s) => s.userId)
  const toast = useToast((s) => s.show)
  const watchedMovies = useLibrary((s) => s.watchedMovies)
  const lastWatched = useLibrary((s) => s.lastWatched)
  const [session, setSession] = useState<MatchSession | null | undefined>()
  const [swipes, setSwipes] = useState<Swipe[]>([])
  const [partner, setPartner] = useState<SocialProfile | null>(null)
  const [deck, setDeck] = useState<Card[]>([])
  const [pagesLoaded, setPagesLoaded] = useState(0)
  const [pageOrder, setPageOrder] = useState<number[] | null>(null)
  const [overlay, setOverlay] = useState<Card | null>(null)
  const [showMatches, setShowMatches] = useState(false)
  const seenMatches = useRef<Set<string> | null>(null)
  const loadingPage = useRef(false)

  const refresh = useCallback(async () => {
    const [s, sw] = await Promise.all([getSession(id), listSwipes(id)])
    setSession(s)
    setSwipes(sw)
  }, [id])
  useEffect(() => {
    void refresh()
    return watchSession(id, () => void refresh())
  }, [id, refresh])

  const otherId = session ? (session.host_id === me ? session.guest_id : session.host_id) : null
  useEffect(() => {
    if (otherId) profilesByIds([otherId]).then((m) => setPartner(m.get(otherId) ?? null))
  }, [otherId])

  // Same deck on both phones: page order shuffled by the session's seed.
  useEffect(() => {
    if (!session || pageOrder) return
    const genre = session.genre_id ? { id: session.genre_id, name: session.genre_name ?? '' } : undefined
    discoverPage(session.kind, 1, genre)
      .then((first) => {
        const n = Math.min(first.totalPages, 12)
        const rng = seeded(session.seed)
        const order = Array.from({ length: n }, (_, i) => i + 1)
        for (let i = order.length - 1; i > 0; i--) {
          const j = Math.floor(rng() * (i + 1))
          ;[order[i], order[j]] = [order[j], order[i]]
        }
        setPageOrder(order)
      })
      .catch(() => toast('Couldn’t load titles — check your connection'))
  }, [session, pageOrder, toast])

  const mySwiped = useMemo(() => new Set(swipes.filter((s) => s.user_id === me).map((s) => s.item_id)), [swipes, me])
  const myLikes = useMemo(() => new Set(swipes.filter((s) => s.user_id === me && s.liked).map((s) => s.item_id)), [swipes, me])
  const theirLikes = useMemo(() => new Set(swipes.filter((s) => s.user_id !== me && s.liked).map((s) => s.item_id)), [swipes, me])
  const remaining = deck.filter((c) => !mySwiped.has(c.id))

  const loadMore = useCallback(async () => {
    if (!session || !pageOrder || loadingPage.current || pagesLoaded >= pageOrder.length) return
    loadingPage.current = true
    try {
      const genre = session.genre_id ? { id: session.genre_id, name: session.genre_name ?? '' } : undefined
      const res = await discoverPage(session.kind, pageOrder[pagesLoaded], genre)
      setDeck((d) => {
        const have = new Set(d.map((c) => c.id))
        return [...d, ...res.items.map(toCard).filter((c) => !have.has(c.id))]
      })
      setPagesLoaded((n) => n + 1)
    } catch {
      /* retried on next render */
    } finally {
      loadingPage.current = false
    }
  }, [session, pageOrder, pagesLoaded])
  useEffect(() => {
    if (session?.status === 'active' && remaining.length < 6) void loadMore()
  }, [session?.status, remaining.length, loadMore])

  // Matches: liked by both. Celebrate each new one once.
  const matches = useMemo(() => {
    const all = [...myLikes].filter((x) => theirLikes.has(x))
    const byId = new Map(deck.map((c) => [c.id, c]))
    const info = new Map(swipes.map((s) => [s.item_id, s]))
    return all.map((x) => byId.get(x) ?? { id: x, title: info.get(x)?.title ?? 'Title', poster: info.get(x)?.poster ?? undefined, genres: [] })
  }, [myLikes, theirLikes, deck, swipes])
  useEffect(() => {
    if (seenMatches.current === null) {
      // Don't replay matches from before you opened the screen.
      if (swipes.length || session) seenMatches.current = new Set(matches.map((m) => m.id))
      return
    }
    const fresh = matches.find((m) => !seenMatches.current!.has(m.id))
    if (fresh) {
      matches.forEach((m) => seenMatches.current!.add(m.id))
      setOverlay(fresh)
      navigator.vibrate?.([30, 40, 60])
    }
  }, [matches, swipes.length, session])

  const decide = async (card: Card, liked: boolean) => {
    if (!me || !session) return
    setSwipes((s) => [...s, { session_id: id, user_id: me, item_id: card.id, liked, title: card.title, poster: card.poster ?? null }])
    const ok = await swipe({ session_id: id, item_id: card.id, liked, title: card.title, poster: card.poster ?? null }, me)
    if (!ok) toast('Swipe not saved — check your connection')
  }

  if (session === undefined)
    return (
      <div className="scroll-area route-fade">
        <Header title="Watch together" />
        <div className="empty">
          <div className="empty-sub">Loading…</div>
        </div>
      </div>
    )
  if (session === null || session.status === 'closed')
    return (
      <div className="scroll-area route-fade">
        <Header title="Watch together" />
        <div className="empty">
          <div className="empty-title">{session ? 'This session has ended' : 'Session not found'}</div>
          {matches.length > 0 && <div className="empty-sub">You matched on {matches.map((m) => m.title).join(', ')}.</div>}
          <button className="sync-btn primary pressable" style={{ marginTop: 14 }} onClick={() => nav('/discover/match', { replace: true })}>
            Start a new one
          </button>
        </div>
      </div>
    )

  const what = `${session.genre_name ? session.genre_name + ' ' : ''}${session.kind === 'movie' ? 'movies' : 'TV shows'}`

  if (session.status === 'waiting' || !session.guest_id) {
    const share = async () => {
      const text = `Join me on The Watcher to pick something to watch — code ${session.code}`
      try {
        if (navigator.share) await navigator.share({ text })
        else {
          await navigator.clipboard.writeText(session.code)
          toast('Code copied')
        }
      } catch {
        /* cancelled */
      }
    }
    return (
      <div className="scroll-area route-fade">
        <Header title="Watch together" sub={what} />
        <div className="page-pad waiting-room">
          <div className="vis-hint">Ask your friend to open Discover → Watch together → Join, and enter:</div>
          <div className="big-code" aria-label={`Code ${session.code.split('').join(' ')}`}>
            {session.code}
          </div>
          <button className="follow-btn primary pressable" onClick={() => void share()}>
            Share code
          </button>
          <div className="waiting-dots" role="status">
            Waiting for your friend to join<span>.</span>
            <span>.</span>
            <span>.</span>
          </div>
          <button className="welcome-switch pressable" onClick={() => void endSession(session.id).then(() => nav('/discover/match', { replace: true }))}>
            Cancel session
          </button>
        </div>
      </div>
    )
  }

  const top = remaining[0]
  const next = remaining[1]
  const watched = (cid: string) => (session.kind === 'movie' ? !!watchedMovies[cid] : !!lastWatched[cid])

  return (
    <div className="scroll-area route-fade">
      <Header title="Watch together" sub={`With ${partner ? nameOf(partner) : 'your friend'} · ${what}`} />
      <div className="page-pad match-bar">
        <button className="follow-btn pressable" onClick={() => setShowMatches((v) => !v)}>
          {matches.length} match{matches.length === 1 ? '' : 'es'}
        </button>
        <button className="auth-link danger" onClick={() => void endSession(session.id).then(refresh)}>
          End session
        </button>
      </div>
      {showMatches && (
        <div className="page-pad match-list">
          {matches.length === 0 ? (
            <div className="vis-hint">No matches yet — keep swiping.</div>
          ) : (
            matches.map((m) => (
              <button key={m.id} className="match-row pressable" onClick={() => nav(`/${session.kind}/${m.id}`)}>
                <SmartImage src={m.poster} alt="" className="match-row-poster" />
                <span>{m.title}</span>
              </button>
            ))
          )}
        </div>
      )}

      <div className="deck">
        {next && <SwipeCard key={next.id + '-under'} card={next} under watched={watched(next.id)} />}
        {top ? (
          <SwipeCard key={top.id} card={top} watched={watched(top.id)} onDecide={(liked) => void decide(top, liked)} />
        ) : (
          <div className="empty">
            <div className="empty-title">{pageOrder && pagesLoaded >= pageOrder.length ? 'You’ve seen everything' : 'Loading titles…'}</div>
            {pageOrder && pagesLoaded >= pageOrder.length && <div className="empty-sub">Start a new session with a different genre for more.</div>}
          </div>
        )}
      </div>
      {top && (
        <div className="swipe-buttons">
          <button className="swipe-btn no pressable" aria-label="Not for me" onClick={() => void decide(top, false)}>
            ✕
          </button>
          <button className="swipe-btn yes pressable" aria-label="I’d watch this" onClick={() => void decide(top, true)}>
            ♥
          </button>
        </div>
      )}

      {overlay && (
        <div className="match-overlay" role="dialog" aria-label="It's a match" onClick={() => setOverlay(null)}>
          <div className="match-burst" aria-hidden="true">
            {Array.from({ length: 14 }, (_, i) => (
              <span key={i} style={{ ['--i' as string]: i }} />
            ))}
          </div>
          <div className="match-card" onClick={(e) => e.stopPropagation()}>
            <div className="match-title">It’s a match!</div>
            <div className="vis-hint">You and {partner ? nameOf(partner) : 'your friend'} both want to watch</div>
            <SmartImage src={overlay.poster} alt={overlay.title} className="match-poster" />
            <div className="pick-title">{overlay.title}</div>
            <div className="pick-actions">
              <button className="follow-btn primary pressable" onClick={() => nav(`/${session.kind}/${overlay.id}`)}>
                Open
              </button>
              <button className="follow-btn pressable" onClick={() => setOverlay(null)}>
                Keep swiping
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Drag left (no) or right (yes); also works with the buttons below. */
function SwipeCard({ card, under, watched, onDecide }: { card: Card; under?: boolean; watched?: boolean; onDecide?: (liked: boolean) => void }) {
  const [dx, setDx] = useState(0)
  const [leaving, setLeaving] = useState<0 | 1 | -1>(0)
  const start = useRef<{ x: number; y: number; id: number } | null>(null)
  const done = (liked: boolean) => {
    setLeaving(liked ? 1 : -1)
    setTimeout(() => onDecide?.(liked), 180)
  }
  const style = under
    ? undefined
    : {
        transform: leaving ? `translateX(${leaving * 140}%) rotate(${leaving * 18}deg)` : `translateX(${dx}px) rotate(${dx / 18}deg)`,
        transition: start.current ? 'none' : 'transform .2s ease',
      }
  return (
    <div
      className={`swipe-card ${under ? 'under' : ''}`}
      style={style}
      onPointerDown={(e) => {
        if (under) return
        start.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (!start.current || start.current.id !== e.pointerId) return
        setDx(e.clientX - start.current.x)
      }}
      onPointerUp={() => {
        if (!start.current) return
        start.current = null
        if (Math.abs(dx) > 90) done(dx > 0)
        else setDx(0)
      }}
      onPointerCancel={() => {
        start.current = null
        setDx(0)
      }}
    >
      <SmartImage src={card.poster} alt={card.title} className="swipe-poster" />
      {!under && dx > 30 && <span className="swipe-stamp yes">WATCH</span>}
      {!under && dx < -30 && <span className="swipe-stamp no">PASS</span>}
      <div className="swipe-info">
        <div className="pick-title">
          {card.title}
          {watched && <span className="lock-chip">Watched</span>}
        </div>
        <div className="pick-meta">{[card.year, card.genres.slice(0, 2).join(', ')].filter(Boolean).join(' · ')}</div>
        <PublicScore value={card.score} votes={card.votes} compact />
      </div>
    </div>
  )
}
