// Date-only helpers. All dates in the app are ISO strings 'YYYY-MM-DD'.
// "Today" is always computed in Asia/Kolkata so behavior does not depend
// on the phone/browser timezone.

export type ISODate = string

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

export function todayIST(now: Date = new Date()): ISODate {
  const ist = new Date(now.getTime() + IST_OFFSET_MS)
  return ist.toISOString().slice(0, 10)
}

/** Current hour of day (0-23) in IST, used to default the attendance meal. */
export function hourIST(now: Date = new Date()): number {
  const ist = new Date(now.getTime() + IST_OFFSET_MS)
  return ist.getUTCHours()
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Whole days from `a` to `b` (positive when b is after a). */
export function daysBetween(a: ISODate, b: ISODate): number {
  const ms = new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()
  return Math.round(ms / 86400000)
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' for display. */
export function formatDMY(date: ISODate): string {
  const [y, m, d] = date.split('-')
  return `${d}/${m}/${y}`
}

/** 'YYYY-MM' of an ISO date. */
export function monthOf(date: ISODate): string {
  return date.slice(0, 7)
}

/** Human month label, e.g. '2026-07' → 'July 2026'. */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const names = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']
  return `${names[m - 1]} ${y}`
}
