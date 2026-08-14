import { StarIcon } from '../components/Icons'

/**
 * Whole-star (1–5) personal rating. Clicking a star sets that value; clicking the
 * currently-selected value again clears the rating (handled by the store setter).
 * `value` undefined = unrated.
 */
export function StarRating({
  value,
  onChange,
  size = 32,
}: {
  value?: number
  onChange: (v: number) => void
  size?: number
}) {
  return (
    <div className="star-rating" role="radiogroup" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = value != null && n <= value
        return (
          <button
            key={n}
            type="button"
            className="star-btn pressable"
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            aria-pressed={value === n}
            onClick={() => onChange(n)}
          >
            <StarIcon
              size={size}
              strokeWidth={1.5}
              fill={filled ? 'var(--yellow)' : 'none'}
              style={{ color: filled ? 'var(--yellow)' : 'var(--text-mute)' }}
            />
          </button>
        )
      })}
    </div>
  )
}

/** Compact read-only stars + numeric label (e.g. for cards / leaderboards). */
export function StarValue({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="star-value">
      <StarIcon size={size} fill="var(--yellow)" style={{ color: 'var(--yellow)' }} strokeWidth={1.5} />
      {(Math.round(value * 10) / 10).toFixed(1)}
    </span>
  )
}
