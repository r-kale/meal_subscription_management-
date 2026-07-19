/** Format a rupee amount: 1750 → '₹1,750'. */
export function inr(amount: number): string {
  const sign = amount < 0 ? '-' : ''
  const n = Math.abs(Math.round(amount))
  // Indian digit grouping: last 3, then groups of 2.
  const s = String(n)
  if (s.length <= 3) return `${sign}₹${s}`
  const last3 = s.slice(-3)
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')
  return `${sign}₹${rest},${last3}`
}
