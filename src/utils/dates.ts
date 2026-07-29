const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

function midnight(d: Date): Date {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c
}

export function dayDelta(iso: string): number {
  const target = midnight(new Date(iso + 'T00:00:00'))
  const now = midnight(new Date())
  return Math.round((target.getTime() - now.getTime()) / 86400000)
}

/** Human date-group label for the release calendar. */
export function groupLabel(iso: string): string {
  const delta = dayDelta(iso)
  if (delta === 0) return 'TODAY'
  if (delta === 1) return 'TOMORROW'
  if (delta === -1) return 'YESTERDAY'
  const d = new Date(iso + 'T00:00:00')
  if (delta > 1 && delta < 7) return WEEKDAYS[d.getDay()]
  if (delta < -1 && delta > -7) return WEEKDAYS[d.getDay()]
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

/** "JUL 10, 2026" pill for the top of the Upcoming screen. */
export function datePill(d = new Date()): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

export function shortDate(iso?: string): string {
  if (!iso) return 'TBA'
  const d = new Date(iso + 'T00:00:00')
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}
