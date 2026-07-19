import type { ISODate } from '../lib/dates'

export type MealType = 'lunch' | 'dinner' | 'both'
export type AttendanceMeal = 'lunch' | 'dinner'
export type PaymentMode = 'cash' | 'upi' | 'other'
export type AttendanceStatus = 'present' | 'absent'
export type SubscriptionStatus = 'active' | 'expiring' | 'expired' | 'upcoming' | 'cancelled'

export interface Location {
  id: string
  name: string
  is_active: boolean
}

export interface Plan {
  id: string
  name: string
  meal_type: MealType
  duration_days: number
  price: number
  is_active: boolean
}

export interface Customer {
  id: string
  name: string
  phone: string | null
  location_id: string
  notes: string | null
  created_at: string
}

export interface Subscription {
  id: string
  customer_id: string
  location_id: string
  meal_type: MealType
  start_date: ISODate
  end_date: ISODate
  price: number
  is_cancelled: boolean
  notes: string | null
  created_at: string
}

export interface Payment {
  id: string
  subscription_id: string
  amount: number
  paid_on: ISODate
  mode: PaymentMode
  note: string | null
}

export interface SkipDay {
  id: string
  subscription_id: string
  skip_date: ISODate
  note: string | null
}

export interface AttendanceMark {
  id: string
  subscription_id: string
  att_date: ISODate
  meal: AttendanceMeal
  status: AttendanceStatus
}

/** Subscription enriched with customer info + computed fields (mirror of the SQL view). */
export interface SubscriptionDetail extends Subscription {
  customer_name: string
  phone: string | null
  skip_count: number
  effective_end_date: ISODate
  paid_total: number
  due_amount: number
  status: SubscriptionStatus
}

export interface CustomerWithHistory {
  customer: Customer
  subscriptions: SubscriptionDetail[]
  paymentsBySubscription: Record<string, Payment[]>
  skipsBySubscription: Record<string, SkipDay[]>
  attendancePresentBySubscription: Record<string, number>
}

export interface AttendanceRow {
  subscription: SubscriptionDetail
  mark: AttendanceStatus | null
  isSkipDay: boolean
}

export interface ReportRow {
  locationId: string
  locationName: string
  revenue: number
  newSubscriptions: number
  activeAtMonthEnd: number
}

export interface AppSettings {
  renewalTemplate: string
  duesTemplate: string
  upiId: string
  expiryWindowDays: number
}

export interface SubscriptionFilter {
  locationId?: string
  status?: SubscriptionStatus
  expiringWithinDays?: number
  recentlyExpiredDays?: number
  hasDues?: boolean
}

export interface NewSubscriptionInput {
  customer_id: string
  location_id: string
  meal_type: MealType
  start_date: ISODate
  end_date: ISODate
  price: number
  notes?: string | null
}
