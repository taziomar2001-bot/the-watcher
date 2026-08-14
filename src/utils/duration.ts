// One reusable adaptive duration formatter for every watch-time stat.
// Picks the unit that keeps the value intuitive rather than always collapsing
// to the largest unit (e.g. 27h stays "27h", but 240h becomes "10d").
//
//   48       -> "48 min"
//   444      -> "7h 24m"
//   4800     -> "3d 8h"
//   63360    -> "6w 2d"
//   190080   -> "4mo 12d"
//   655200   -> "1y 3mo"

const HOUR = 60
const DAY = 60 * 24
const WEEK = DAY * 7
const MONTH = DAY * 30
const YEAR = DAY * 365

/** Format a minute total into a human-readable, adaptive duration string. */
export function formatDuration(mins: number): string {
  const t = Math.max(0, Math.round(mins))

  // Minutes only.
  if (t < HOUR) return `${t} min`

  // Hours (+minutes) — kept up to 2 full days so totals like "27h" stay in hours.
  if (t < 2 * DAY) {
    const h = Math.floor(t / HOUR)
    const m = t % HOUR
    return m ? `${h}h ${m}m` : `${h}h`
  }

  // Days (+hours).
  if (t < 2 * WEEK) {
    const d = Math.floor(t / DAY)
    const h = Math.floor((t % DAY) / HOUR)
    return h ? `${d}d ${h}h` : `${d}d`
  }

  // Weeks (+days).
  if (t < 2 * MONTH) {
    const w = Math.floor(t / WEEK)
    const d = Math.floor((t % WEEK) / DAY)
    return d ? `${w}w ${d}d` : `${w}w`
  }

  // Months (+days).
  if (t < YEAR) {
    const mo = Math.floor(t / MONTH)
    const d = Math.floor((t % MONTH) / DAY)
    return d ? `${mo}mo ${d}d` : `${mo}mo`
  }

  // Years (+months).
  const y = Math.floor(t / YEAR)
  const mo = Math.floor((t % YEAR) / MONTH)
  return mo ? `${y}y ${mo}mo` : `${y}y`
}
