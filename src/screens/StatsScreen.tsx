import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from '../components/Icons'
import { Segmented } from '../ui/primitives'
import { useLibrary } from '../store/useLibrary'
import { useShowEntries, useMovieEntries } from '../logic/useLibraryData'
import { effectiveSeen } from '../logic/status'
import { computeInsights, type Share, type WatchedTitle } from '../logic/insights'
import { enrichTitles, useTitleMeta } from '../store/useTitleMeta'
import { USE_TMDB } from '../data/catalog'

type Kind = 'movie' | 'show'
const mem = { kind: 'movie' as Kind }

/**
 * Your stats: genres, decades, languages, when you watch and how you rate —
 * computed on this device from your library plus TMDB facts about each title.
 */
export function StatsScreen() {
  const nav = useNavigate()
  const [kind, setKindState] = useState<Kind>(mem.kind)
  const setKind = (k: Kind) => ((mem.kind = k), setKindState(k))
  const lib = useLibrary()
  const shows = useShowEntries()
  const movies = useMovieEntries()
  const meta = useTitleMeta((s) => s.meta)
  const running = useTitleMeta((s) => s.running)
  const done = useTitleMeta((s) => s.done)
  const total = useTitleMeta((s) => s.total)

  const watchedMovies: WatchedTitle[] = useMemo(
    () =>
      movies
        .filter((e) => lib.watchedMovies[e.item.id])
        .map((e) => ({ key: `movie:${e.item.id}`, item: e.item, when: lib.lastWatched[e.item.id], mine: lib.movieRatings[e.item.id] })),
    [movies, lib.watchedMovies, lib.lastWatched, lib.movieRatings],
  )
  const watchedShows: WatchedTitle[] = useMemo(
    () =>
      shows
        .map((e) => ({ e, seen: effectiveSeen(e.item, lib.watchedEpisodes) }))
        .filter((x) => x.seen >= 1)
        .map(({ e, seen }) => {
          const prefix = `${e.item.id}_`
          const rs = Object.entries(lib.episodeRatings).filter(([k]) => k.startsWith(prefix)).map(([, v]) => v)
          return { key: `show:${e.item.id}`, item: e.item, when: lib.lastWatched[e.item.id], episodes: seen, mine: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : undefined }
        }),
    [shows, lib.watchedEpisodes, lib.lastWatched, lib.episodeRatings],
  )

  // Learn genres / years / languages for everything you've watched (cached).
  useEffect(() => {
    void enrichTitles([...watchedMovies, ...watchedShows].map((t) => t.key))
  }, [watchedMovies, watchedShows])

  const titles = kind === 'movie' ? watchedMovies : watchedShows
  const ins = useMemo(() => computeInsights(kind, titles, meta), [kind, titles, meta])
  const noun = kind === 'movie' ? 'movies' : 'shows'

  return (
    <div className="scroll-area route-fade">
      <div className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="pressable" onClick={() => nav(-1)} aria-label="Back" style={{ color: 'var(--text-dim)' }}>
            <ChevronLeft size={26} />
          </button>
          <div>
            <h1 style={{ fontSize: 24 }}>Your stats</h1>
            <div className="sub">
              {ins.total.toLocaleString()} {noun} watched
            </div>
          </div>
        </div>
      </div>

      <div className="page-pad" style={{ paddingBottom: 12 }}>
        <Segmented
          options={[
            { key: 'movie', label: 'Movies' },
            { key: 'show', label: 'TV Shows' },
          ]}
          value={kind}
          onChange={setKind}
        />
      </div>

      {running && total > 0 && (
        <div className="page-pad" style={{ paddingBottom: 12 }}>
          <div className="learn-meter" role="status">
            <span>Learning about your library…</span>
            <span>
              {done.toLocaleString()} / {total.toLocaleString()}
            </span>
          </div>
          <div className="meter-track">
            <span className="meter-fill" style={{ width: `${Math.round((done / total) * 100)}%` }} />
          </div>
        </div>
      )}

      {ins.total === 0 ? (
        <div className="empty">
          <div className="empty-title">No {noun} watched yet</div>
          <div className="empty-sub">Your stats appear here as you mark {noun} watched.</div>
        </div>
      ) : (
        <>
          {ins.highlights.length > 0 && (
            <div className="kpi-grid">
              {ins.highlights.map((h) => (
                <div key={h.label} className="kpi-tile">
                  <div className="kpi-label">{h.label}</div>
                  <div className="kpi-value">{h.value}</div>
                  {h.sub && <div className="kpi-sub">{h.sub}</div>}
                </div>
              ))}
            </div>
          )}

          <ShareBars title="Genres" note={`Share of your ${noun} in each genre (a title can have several)`} rows={ins.genres} noun={noun} />
          <Columns
            title="Decades"
            note={`When the ${noun} you watched came out`}
            data={ins.decades.map((d) => ({ label: d.name.replace(/^(\d\d)(\d\d)s$/, "'$2s"), value: d.count, detail: `${d.name} · ${d.count.toLocaleString()} ${noun} · ${d.pct}%` }))}
          />
          {kind === 'movie' && ins.byYear.length > 1 && (
            <Columns
              title="Movies watched per year"
              note="Based on the date you marked each movie watched"
              data={ins.byYear.map((y) => ({ label: `'${String(y.year).slice(2)}`, value: y.count, detail: `${y.year} · ${y.count.toLocaleString()} movies` }))}
            />
          )}
          <ShareBars title="Languages" note="Original language" rows={ins.languages} noun={noun} />
          {kind === 'movie' && <ShareBars title="Countries" note="Main production country" rows={ins.countries} noun={noun} />}
          <RatingsCard ratings={ins.ratings} avgMine={ins.avgMine} mine10={ins.avgMineOfRated10} pub={ins.avgPublicOfRated} kind={kind} />

          {USE_TMDB && ins.known < ins.total && !running && (
            <div className="vis-hint page-pad">
              Facts are missing for {(ins.total - ins.known).toLocaleString()} {noun}; they’ll be added next time you open this page.
            </div>
          )}
        </>
      )}
      <div style={{ height: 28 }} />
    </div>
  )
}

/** Ranked horizontal bars, one hue; the value is printed, so the list doubles as the table. */
function ShareBars({ title, note, rows, noun }: { title: string; note: string; rows: Share[]; noun: string }) {
  const [open, setOpen] = useState<string | null>(null)
  if (!rows.length) return null
  const max = Math.max(...rows.map((r) => r.pct), 1)
  return (
    <section className="chart-card" aria-label={title}>
      <div className="chart-title">{title}</div>
      <div className="chart-note">{note}</div>
      {rows.map((r) => (
        <button key={r.name} className="share-row" onClick={() => setOpen(open === r.name ? null : r.name)} aria-label={`${r.name}: ${r.pct}%, ${r.count} ${noun}`}>
          <span className="share-name">{r.name}</span>
          <span className="share-track">
            <span className="share-fill" style={{ width: `${Math.max(2, (r.pct / max) * 100)}%` }} />
          </span>
          <span className="share-pct">{open === r.name ? r.count.toLocaleString() : `${r.pct}%`}</span>
        </button>
      ))}
    </section>
  )
}

/** Column chart with a tap/hover tooltip; the tallest column is labelled. */
function Columns({ title, note, data }: { title: string; note: string; data: { label: string; value: number; detail: string }[] }) {
  const [sel, setSel] = useState<number | null>(null)
  if (data.length === 0) return null
  const max = Math.max(...data.map((d) => d.value), 1)
  const peak = data.findIndex((d) => d.value === max)
  const shown = sel ?? peak
  return (
    <section className="chart-card" aria-label={title}>
      <div className="chart-title">{title}</div>
      <div className="chart-note">{note}</div>
      <div className="col-tip" aria-live="polite">
        {data[shown]?.detail}
      </div>
      <div className="col-chart" onMouseLeave={() => setSel(null)}>
        {data.map((d, i) => (
          <button
            key={d.label + i}
            className={`col ${i === shown ? 'on' : ''}`}
            onMouseEnter={() => setSel(i)}
            onClick={() => setSel(i)}
            aria-label={d.detail}
          >
            <span className="col-bar-wrap">
              <span className="col-bar" style={{ height: `${d.value ? Math.max(3, (d.value / max) * 100) : 0}%` }} />
            </span>
            <span className="col-label">{d.label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function RatingsCard({ ratings, avgMine, mine10, pub, kind }: { ratings: number[]; avgMine?: number; mine10?: number; pub?: number; kind: Kind }) {
  const total = ratings.reduce((a, b) => a + b, 0)
  if (!total) return null
  const max = Math.max(...ratings, 1)
  const diff = mine10 != null && pub != null ? mine10 - pub : null
  const verdict =
    diff == null
      ? null
      : Math.abs(diff) < 0.4
        ? 'You rate about the same as everyone else.'
        : diff > 0
          ? `You rate ${diff >= 1.2 ? 'much ' : ''}higher than most people.`
          : `You’re ${diff <= -1.2 ? 'much ' : ''}tougher than most people.`
  return (
    <section className="chart-card" aria-label="Your ratings">
      <div className="chart-title">Your ratings</div>
      <div className="chart-note">
        {total.toLocaleString()} {kind === 'movie' ? 'movies' : 'shows'} rated{kind === 'show' ? ' (average of your episode ratings)' : ''}
      </div>
      <div className="rating-compare">
        <div>
          <div className="kpi-label">You</div>
          <div className="kpi-value">{avgMine?.toFixed(1)} ★</div>
          {mine10 != null && <div className="kpi-sub">{mine10.toFixed(1)}/10</div>}
        </div>
        {pub != null && (
          <div>
            <div className="kpi-label">Everyone (TMDB)</div>
            <div className="kpi-value">{pub.toFixed(1)}/10</div>
            <div className="kpi-sub">same titles</div>
          </div>
        )}
      </div>
      {verdict && <div className="rating-verdict">{verdict}</div>}
      {[5, 4, 3, 2, 1].map((star) => (
        <div key={star} className="share-row static" aria-label={`${star} stars: ${ratings[star - 1]}`}>
          <span className="share-name">{'★'.repeat(star)}</span>
          <span className="share-track">
            <span className="share-fill" style={{ width: `${ratings[star - 1] ? Math.max(2, (ratings[star - 1] / max) * 100) : 0}%` }} />
          </span>
          <span className="share-pct">{ratings[star - 1].toLocaleString()}</span>
        </div>
      ))}
    </section>
  )
}
