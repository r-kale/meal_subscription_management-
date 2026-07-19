import type { ISODate } from '../lib/dates'
import type {
  AppSettings,
  AttendanceMeal,
  AttendanceRow,
  AttendanceStatus,
  Customer,
  CustomerWithHistory,
  Location,
  NewSubscriptionInput,
  Plan,
  ReportRow,
  SubscriptionDetail,
  SubscriptionFilter,
} from './types'

export interface Session {
  email: string | null
  isDemo: boolean
}

export interface DataAdapter {
  readonly isDemo: boolean

  // ── auth ──
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>
  getSession(): Promise<Session | null>

  // ── reads ──
  listLocations(includeInactive?: boolean): Promise<Location[]>
  listPlans(includeInactive?: boolean): Promise<Plan[]>
  searchCustomers(query: string, locationId?: string): Promise<Customer[]>
  getCustomer(id: string): Promise<CustomerWithHistory>
  listSubscriptionDetails(filter?: SubscriptionFilter): Promise<SubscriptionDetail[]>
  getSubscriptionDetail(id: string): Promise<SubscriptionDetail>
  listAttendanceSheet(locationId: string | undefined, date: ISODate, meal: AttendanceMeal): Promise<AttendanceRow[]>
  getMonthlyReport(month: string): Promise<ReportRow[]>
  getSettings(): Promise<AppSettings>

  // ── writes ──
  createCustomer(input: { name: string; phone: string | null; location_id: string; notes?: string | null }): Promise<Customer>
  updateCustomer(id: string, patch: Partial<Pick<Customer, 'name' | 'phone' | 'location_id' | 'notes'>>): Promise<void>
  createSubscription(input: NewSubscriptionInput, initialPayment?: { amount: number; mode: 'cash' | 'upi' | 'other' }): Promise<string>
  cancelSubscription(id: string): Promise<void>
  addPayment(subscriptionId: string, input: { amount: number; paid_on: ISODate; mode: 'cash' | 'upi' | 'other'; note?: string | null }): Promise<void>
  deletePayment(id: string): Promise<void>
  addSkipDay(subscriptionId: string, date: ISODate, note?: string | null): Promise<void>
  removeSkipDay(id: string): Promise<void>
  setAttendance(subscriptionId: string, date: ISODate, meal: AttendanceMeal, status: AttendanceStatus | null): Promise<void>
  upsertLocation(input: { id?: string; name: string; is_active?: boolean }): Promise<void>
  upsertPlan(input: { id?: string; name: string; meal_type: 'lunch' | 'dinner' | 'both'; duration_days: number; price: number; is_active?: boolean }): Promise<void>
  saveSettings(settings: AppSettings): Promise<void>
}
