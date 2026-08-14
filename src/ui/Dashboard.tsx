import { SmartImage } from '../components/ui'

/** Clean stat rows in a single card (not tiny scattered tiles). */
export function StatGrid({ stats }: { stats: { label: string; value: string | number }[] }) {
  return (
    <div className="stats-card">
      <div className="stats-rows">
        {stats.map((s) => (
          <div className="stat-row" key={s.label}>
            <span className="stat-row-label">{s.label}</span>
            <span className="stat-row-value">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Simple horizontal genre bars with percentages. */
export function GenreBars({
  title,
  genres,
  accent = 'var(--accent)',
}: {
  title: string
  genres: { name: string; pct: number }[]
  accent?: string
}) {
  if (!genres.length) return null
  const max = Math.max(...genres.map((g) => g.pct), 1)
  return (
    <div className="genre-card">
      <div className="genre-card-title">{title}</div>
      {genres.map((g) => (
        <div className="genre-bar-row" key={g.name}>
          <span className="genre-bar-name">{g.name}</span>
          <span className="genre-bar-track">
            <span className="genre-bar-fill" style={{ width: `${(g.pct / max) * 100}%`, background: accent }} />
          </span>
          <span className="genre-bar-pct">{g.pct}%</span>
        </div>
      ))}
    </div>
  )
}

/** Numbered leaderboard of personally-rated titles. */
export function Leaderboard({
  title,
  items,
  onOpen,
  emptyHint,
}: {
  title: string
  items: { id: string; title: string; label: string; poster?: string }[]
  onOpen: (id: string) => void
  emptyHint?: string
}) {
  return (
    <div className="lb-card">
      <div className="genre-card-title">{title}</div>
      {items.length === 0 ? (
        <div className="lb-empty">{emptyHint ?? 'Not enough ratings yet.'}</div>
      ) : (
        items.map((it, i) => (
          <button key={it.id} className="lb-row pressable" onClick={() => onOpen(it.id)}>
            <span className="lb-rank">{i + 1}</span>
            {it.poster && <SmartImage src={it.poster} alt={it.title} className="lb-poster" />}
            <span className="lb-title">{it.title}</span>
            <span className="lb-score">{it.label}</span>
          </button>
        ))
      )}
    </div>
  )
}
