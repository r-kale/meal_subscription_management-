// Pure business rules, shared by the demo adapter and the UI.
//
// IMPORTANT: these functions are the TypeScript twin of the SQL view
// `subscription_details` in supabase/migrations/001_init.sql. If you
// change a rule here, change it there too (and vice versa).

import { addDays, daysBetween, type ISODate } from './dates'
import type {
  AttendanceMeal,
  Subscription,
  SubscriptionDetail,
  SubscriptionStatus,
} from '../data/types'

/** end_date extended by one day per skip day. */
export function effectiveEndDate(endDate: ISODate, skipCount: number): ISODate {
  return addDays(endDate, skipCount)
}

export function dueAmount(price: number, paidTotal: number): number {
  return price - paidTotal
}

export function subscriptionStatus(
  sub: Pick<Subscription, 'start_date' | 'is_cancelled'>,
  effectiveEnd: ISODate,
  today: ISODate,
  expiryWindowDays: number,
): SubscriptionStatus {
  if (sub.is_cancelled) return 'cancelled'
  if (sub.start_date > today) return 'upcoming'
  if (effectiveEnd < today) return 'expired'
  if (daysBetween(today, effectiveEnd) <= expiryWindowDays) return 'expiring'
  return 'active'
}

/** Does a subscription of `mealType` serve the given attendance meal? */
export function servesMeal(mealType: string, meal: AttendanceMeal): boolean {
  return mealType === 'both' || mealType === meal
}

/**
 * Is the subscription live on `date` (start ≤ date ≤ effective end, not
 * cancelled)? Skip days are handled separately so the UI can show them greyed.
 */
export function isActiveOn(
  sub: Pick<Subscription, 'start_date' | 'is_cancelled'>,
  effectiveEnd: ISODate,
  date: ISODate,
): boolean {
  return !sub.is_cancelled && sub.start_date <= date && date <= effectiveEnd
}

export function isExpiringWithin(detail: SubscriptionDetail, today: ISODate, days: number): boolean {
  if (detail.is_cancelled) return false
  return detail.effective_end_date >= today && daysBetween(today, detail.effective_end_date) <= days
}

/**
 * Expired in the last `days` days. `customerHasLiveSub` lets callers exclude
 * customers who already renewed (they have another non-cancelled subscription
 * whose effective end is today or later).
 */
export function isRecentlyExpired(
  detail: SubscriptionDetail,
  today: ISODate,
  days: number,
  customerHasLiveSub: boolean,
): boolean {
  if (detail.is_cancelled || customerHasLiveSub) return false
  const end = detail.effective_end_date
  return end < today && daysBetween(end, today) <= days
}

/** Default renewal start: the day after the old subscription's effective end (never in the past). */
export function renewalStartDate(effectiveEnd: ISODate, today: ISODate): ISODate {
  const next = addDays(effectiveEnd, 1)
  return next > today ? next : today
}

export const MEAL_LABEL: Record<string, string> = {
  lunch: 'Lunch',
  dinner: 'Dinner',
  both: 'Lunch + Dinner',
}
