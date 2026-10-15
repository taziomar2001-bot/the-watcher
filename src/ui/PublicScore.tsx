/**
 * Public opinion, out of 10, from TMDB's community votes. Shown next to the
 * person's own 5★ rating; never mixed with it. Hidden when nobody has voted.
 */
export function formatVotes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '')}K`
  return String(n)
}

export function PublicScore({ value, votes, compact, source = 'TMDB' }: { value?: number; votes?: number; compact?: boolean; source?: string }) {
  if (value == null || !(value > 0) || votes === 0) return null
  const tone = value >= 7.5 ? 'high' : value >= 6 ? 'mid' : 'low'
  return (
    <span className={`public-score ${tone} ${compact ? 'compact' : ''}`} title={`Average rating from ${source} users, out of 10`}>
      <b>{value.toFixed(1)}</b>
      <span className="public-score-of">/10</span>
      {!compact && (
        <span className="public-score-src">
          {source}{votes ? ` · ${formatVotes(votes)} votes` : ''}
        </span>
      )}
    </span>
  )
}
