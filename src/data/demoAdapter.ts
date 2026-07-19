// In-browser demo adapter: same behavior as the Supabase adapter but all
// data lives in localStorage. Used when Supabase is not configured, or
// when the app is opened with #/login?demo=1.

import { addDays, todayIST, monthOf, type ISODate } from '../lib/dates'
import {
  dueAmount,
  effectiveEndDate,
  isActiveOn,
  isExpiringWithin,
  isRecentlyExpired,
  servesMeal,
  subscriptionStatus,
} from '../lib/domain'
import { DEFAULT_DUES_TEMPLATE, DEFAULT_RENEWAL_TEMPLATE } from '../lib/whatsapp'
import type { DataAdapter, Session } from './adapter'
import type {
  AppSettings,
  AttendanceMark,
  AttendanceMeal,
  AttendanceRow,
  AttendanceStatus,
  Customer,
  CustomerWithHistory,
  Location,
  NewSubscriptionInput,
  Payment,
  Plan,
  ReportRow,
  SkipDay,
  Subscription,
  SubscriptionDetail,
  SubscriptionFilter,
} from './types'

const STORAGE_KEY = 'tiffin-demo'

interface Db {
  locations: Location[]
  plans: Plan[]
  customers: Customer[]
  subscriptions: Subscription[]
  payments: Payment[]
  skipDays: SkipDay[]
  attendance: AttendanceMark[]
  settings: AppSettings
}

let idCounter = 1
function uid(): string {
  return `demo-${Date.now().toString(36)}-${idCounter++}`
}

function defaultSettings(): AppSettings {
  return {
    renewalTemplate: DEFAULT_RENEWAL_TEMPLATE,
    duesTemplate: DEFAULT_DUES_TEMPLATE,
    upiId: 'demo@upi',
    expiryWindowDays: 5,
  }
}

/** Seed data covering every subscription state, relative to today (IST). */
export function buildSeed(today: ISODate = todayIST()): Db {
  const locA: Location = { id: 'loc-a', name: 'Kothrud Branch', is_active: true }
  const locB: Location = { id: 'loc-b', name: 'Baner Branch', is_active: true }
  const plans: Plan[] = [
    { id: 'plan-l', name: 'Monthly Lunch', meal_type: 'lunch', duration_days: 30, price: 1750, is_active: true },
    { id: 'plan-d', name: 'Monthly Dinner', meal_type: 'dinner', duration_days: 30, price: 1750, is_active: true },
    { id: 'plan-b', name: 'Monthly Lunch + Dinner', meal_type: 'both', duration_days: 30, price: 3500, is_active: true },
  ]

  const customers: Customer[] = []
  const subscriptions: Subscription[] = []
  const payments: Payment[] = []
  const skipDays: SkipDay[] = []

  let n = 0
  function person(
    name: string,
    phone: string,
    loc: string,
    meal: 'lunch' | 'dinner' | 'both',
    startOffset: number,
    durationDays: number,
    price: number,
    paid: number,
    skips: number,
  ) {
    n++
    const cId = `cust-${n}`
    const sId = `sub-${n}`
    const start = addDays(today, startOffset)
    customers.push({ id: cId, name, phone, location_id: loc, notes: null, created_at: new Date().toISOString() })
    subscriptions.push({
      id: sId, customer_id: cId, location_id: loc, meal_type: meal,
      start_date: start, end_date: addDays(start, durationDays - 1),
      price, is_cancelled: false, notes: null, created_at: new Date().toISOString(),
    })
    if (paid > 0) {
      payments.push({ id: `pay-${n}`, subscription_id: sId, amount: paid, paid_on: start, mode: 'upi', note: null })
    }
    for (let i = 0; i < skips; i++) {
      skipDays.push({ id: `skip-${n}-${i}`, subscription_id: sId, skip_date: addDays(start, 3 + i), note: 'Demo leave' })
    }
  }

  // Kothrud branch
  person('Nishant Suryavanshi', '9529171367', 'loc-a', 'both', -20, 30, 3500, 3500, 0)   // active
  person('Sonali Pawar', '7757010226', 'loc-a', 'lunch', -29, 30, 1500, 1500, 0)          // expiring tomorrow
  person('Yashpal Rathod', '7499344854', 'loc-a', 'dinner', -28, 30, 1750, 1750, 0)       // expiring soon
  person('Pankaj Biller', '7620781567', 'loc-a', 'dinner', -10, 30, 1750, 200, 0)         // partial dues ₹1550
  person('Drushali Jadhav', '7841877563', 'loc-a', 'dinner', -15, 30, 1500, 1500, 2)      // skip-extended (+2)
  person('Pradeep Patil', '9766826565', 'loc-a', 'lunch', -34, 30, 1750, 1750, 0)         // expired 4 days ago
  person('Gayatri Kulkarni', '9765999299', 'loc-a', 'both', -5, 30, 3000, 3000, 0)        // active
  person('Sarthak Deshkari', '7776026696', 'loc-a', 'lunch', -8, 30, 1750, 1000, 0)       // dues ₹750
  person('Isha Hirlekar', '9421159092', 'loc-a', 'dinner', -3, 30, 1500, 1500, 0)         // active
  person('Vijay Savle', '9172910349', 'loc-a', 'lunch', -40, 8, 1200, 1200, 0)            // long expired
  // Baner branch
  person('Tanishq Mehta', '7678019471', 'loc-b', 'both', -12, 30, 3500, 3500, 0)          // active
  person('Sneha Asgekar', '8830638502', 'loc-b', 'dinner', -27, 30, 1500, 1500, 0)        // expiring
  person('Rutik Kadam', '8408080367', 'loc-b', 'both', -18, 30, 1750, 1750, 3)            // skip-extended (+3)
  person('Prakash Chavan', '9880947095', 'loc-b', 'lunch', -32, 30, 1750, 1750, 0)        // expired 2 days ago
  person('Mayank Joshi', '9168237360', 'loc-b', 'dinner', 2, 30, 1750, 0, 0)              // upcoming, unpaid

  return {
    locations: [locA, locB],
    plans,
    customers,
    subscriptions,
    payments,
    skipDays,
    attendance: [],
    settings: defaultSettings(),
  }
}

function load(): Db {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Db
  } catch {
    // corrupted storage → reseed
  }
  return buildSeed()
}

export class DemoAdapter implements DataAdapter {
  readonly isDemo = true
  private db: Db

  constructor(db?: Db) {
    this.db = db ?? load()
    this.persist()
  }

  private persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.db))
    } catch {
      // storage may be unavailable (private mode); demo still works in-memory
    }
  }

  resetDemoData() {
    this.db = buildSeed()
    this.persist()
  }

  // ── auth (demo: always signed in) ──
  async signIn(): Promise<void> {}
  async signOut(): Promise<void> {}
  async getSession(): Promise<Session | null> {
    return { email: 'demo@tiffin.local', isDemo: true }
  }

  // ── derivation ──
  private detail(sub: Subscription, today = todayIST()): SubscriptionDetail {
    const customer = this.db.customers.find((c) => c.id === sub.customer_id)
    const skips = this.db.skipDays.filter((k) => k.subscription_id === sub.id)
    const paidTotal = this.db.payments
      .filter((p) => p.subscription_id === sub.id)
      .reduce((sum, p) => sum + p.amount, 0)
    const effEnd = effectiveEndDate(sub.end_date, skips.length)
    return {
      ...sub,
      customer_name: customer?.name ?? '?',
      phone: customer?.phone ?? null,
      skip_count: skips.length,
      effective_end_date: effEnd,
      paid_total: paidTotal,
      due_amount: dueAmount(sub.price, paidTotal),
      status: subscriptionStatus(sub, effEnd, today, this.db.settings.expiryWindowDays),
    }
  }

  private allDetails(): SubscriptionDetail[] {
    return this.db.subscriptions.map((s) => this.detail(s))
  }

  private customerHasLiveSub(customerId: string, today: ISODate): boolean {
    return this.db.subscriptions.some((s) => {
      if (s.customer_id !== customerId || s.is_cancelled) return false
      const skips = this.db.skipDays.filter((k) => k.subscription_id === s.id).length
      return effectiveEndDate(s.end_date, skips) >= today
    })
  }

  // ── reads ──
  async listLocations(includeInactive = false): Promise<Location[]> {
    return this.db.locations.filter((l) => includeInactive || l.is_active)
  }

  async listPlans(includeInactive = false): Promise<Plan[]> {
    return this.db.plans.filter((p) => includeInactive || p.is_active)
  }

  async searchCustomers(query: string, locationId?: string): Promise<Customer[]> {
    const q = query.trim().toLowerCase()
    return this.db.customers
      .filter((c) => !locationId || c.location_id === locationId)
      .filter((c) => !q || c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  async getCustomer(id: string): Promise<CustomerWithHistory> {
    const customer = this.db.customers.find((c) => c.id === id)
    if (!customer) throw new Error('Customer not found')
    const subs = this.db.subscriptions
      .filter((s) => s.customer_id === id)
      .map((s) => this.detail(s))
      .sort((a, b) => b.start_date.localeCompare(a.start_date))
    const paymentsBySubscription: Record<string, Payment[]> = {}
    const skipsBySubscription: Record<string, SkipDay[]> = {}
    const attendancePresentBySubscription: Record<string, number> = {}
    for (const s of subs) {
      paymentsBySubscription[s.id] = this.db.payments
        .filter((p) => p.subscription_id === s.id)
        .sort((a, b) => b.paid_on.localeCompare(a.paid_on))
      skipsBySubscription[s.id] = this.db.skipDays
        .filter((k) => k.subscription_id === s.id)
        .sort((a, b) => a.skip_date.localeCompare(b.skip_date))
      attendancePresentBySubscription[s.id] = this.db.attendance.filter(
        (a) => a.subscription_id === s.id && a.status === 'present',
      ).length
    }
    return { customer, subscriptions: subs, paymentsBySubscription, skipsBySubscription, attendancePresentBySubscription }
  }

  async listSubscriptionDetails(filter: SubscriptionFilter = {}): Promise<SubscriptionDetail[]> {
    const today = todayIST()
    let details = this.allDetails()
    if (filter.locationId) details = details.filter((d) => d.location_id === filter.locationId)
    if (filter.status) details = details.filter((d) => d.status === filter.status)
    if (filter.expiringWithinDays !== undefined) {
      details = details.filter((d) => isExpiringWithin(d, today, filter.expiringWithinDays!))
    }
    if (filter.recentlyExpiredDays !== undefined) {
      details = details.filter((d) =>
        isRecentlyExpired(d, today, filter.recentlyExpiredDays!, this.customerHasLiveSub(d.customer_id, today)),
      )
    }
    if (filter.hasDues) details = details.filter((d) => d.due_amount > 0 && !d.is_cancelled)
    return details.sort((a, b) => a.effective_end_date.localeCompare(b.effective_end_date))
  }

  async getSubscriptionDetail(id: string): Promise<SubscriptionDetail> {
    const sub = this.db.subscriptions.find((s) => s.id === id)
    if (!sub) throw new Error('Subscription not found')
    return this.detail(sub)
  }

  async listAttendanceSheet(
    locationId: string | undefined,
    date: ISODate,
    meal: AttendanceMeal,
  ): Promise<AttendanceRow[]> {
    const rows: AttendanceRow[] = []
    for (const sub of this.db.subscriptions) {
      if (locationId && sub.location_id !== locationId) continue
      if (!servesMeal(sub.meal_type, meal)) continue
      const d = this.detail(sub)
      if (!isActiveOn(sub, d.effective_end_date, date)) continue
      const isSkipDay = this.db.skipDays.some((k) => k.subscription_id === sub.id && k.skip_date === date)
      const mark = this.db.attendance.find(
        (a) => a.subscription_id === sub.id && a.att_date === date && a.meal === meal,
      )
      rows.push({ subscription: d, mark: mark?.status ?? null, isSkipDay })
    }
    return rows.sort((a, b) => a.subscription.customer_name.localeCompare(b.subscription.customer_name))
  }

  async getMonthlyReport(month: string): Promise<ReportRow[]> {
    const monthEnd = `${month}-31`
    return this.db.locations.map((loc) => {
      const subIdsAtLoc = new Set(
        this.db.subscriptions.filter((s) => s.location_id === loc.id).map((s) => s.id),
      )
      const revenue = this.db.payments
        .filter((p) => subIdsAtLoc.has(p.subscription_id) && monthOf(p.paid_on) === month)
        .reduce((sum, p) => sum + p.amount, 0)
      const newSubscriptions = this.db.subscriptions.filter(
        (s) => s.location_id === loc.id && monthOf(s.start_date) === month,
      ).length
      const activeAtMonthEnd = this.db.subscriptions.filter((s) => {
        if (s.location_id !== loc.id) return false
        const skips = this.db.skipDays.filter((k) => k.subscription_id === s.id).length
        return isActiveOn(s, effectiveEndDate(s.end_date, skips), monthEnd > todayIST() ? todayIST() : monthEnd)
      }).length
      return { locationId: loc.id, locationName: loc.name, revenue, newSubscriptions, activeAtMonthEnd }
    })
  }

  async getSettings(): Promise<AppSettings> {
    return { ...this.db.settings }
  }

  // ── writes ──
  async createCustomer(input: { name: string; phone: string | null; location_id: string; notes?: string | null }): Promise<Customer> {
    const customer: Customer = {
      id: uid(),
      name: input.name.trim(),
      phone: input.phone,
      location_id: input.location_id,
      notes: input.notes ?? null,
      created_at: new Date().toISOString(),
    }
    this.db.customers.push(customer)
    this.persist()
    return customer
  }

  async updateCustomer(id: string, patch: Partial<Pick<Customer, 'name' | 'phone' | 'location_id' | 'notes'>>): Promise<void> {
    const c = this.db.customers.find((x) => x.id === id)
    if (!c) throw new Error('Customer not found')
    Object.assign(c, patch)
    this.persist()
  }

  async createSubscription(
    input: NewSubscriptionInput,
    initialPayment?: { amount: number; mode: 'cash' | 'upi' | 'other' },
  ): Promise<string> {
    const sub: Subscription = {
      id: uid(),
      customer_id: input.customer_id,
      location_id: input.location_id,
      meal_type: input.meal_type,
      start_date: input.start_date,
      end_date: input.end_date,
      price: input.price,
      is_cancelled: false,
      notes: input.notes ?? null,
      created_at: new Date().toISOString(),
    }
    this.db.subscriptions.push(sub)
    if (initialPayment && initialPayment.amount > 0) {
      this.db.payments.push({
        id: uid(),
        subscription_id: sub.id,
        amount: initialPayment.amount,
        paid_on: todayIST(),
        mode: initialPayment.mode,
        note: null,
      })
    }
    this.persist()
    return sub.id
  }

  async cancelSubscription(id: string): Promise<void> {
    const s = this.db.subscriptions.find((x) => x.id === id)
    if (!s) throw new Error('Subscription not found')
    s.is_cancelled = true
    this.persist()
  }

  async addPayment(
    subscriptionId: string,
    input: { amount: number; paid_on: ISODate; mode: 'cash' | 'upi' | 'other'; note?: string | null },
  ): Promise<void> {
    this.db.payments.push({
      id: uid(),
      subscription_id: subscriptionId,
      amount: input.amount,
      paid_on: input.paid_on,
      mode: input.mode,
      note: input.note ?? null,
    })
    this.persist()
  }

  async deletePayment(id: string): Promise<void> {
    this.db.payments = this.db.payments.filter((p) => p.id !== id)
    this.persist()
  }

  async addSkipDay(subscriptionId: string, date: ISODate, note?: string | null): Promise<void> {
    const dup = this.db.skipDays.some((k) => k.subscription_id === subscriptionId && k.skip_date === date)
    if (dup) throw new Error('This date is already a skip day')
    this.db.skipDays.push({ id: uid(), subscription_id: subscriptionId, skip_date: date, note: note ?? null })
    this.persist()
  }

  async removeSkipDay(id: string): Promise<void> {
    this.db.skipDays = this.db.skipDays.filter((k) => k.id !== id)
    this.persist()
  }

  async setAttendance(
    subscriptionId: string,
    date: ISODate,
    meal: AttendanceMeal,
    status: AttendanceStatus | null,
  ): Promise<void> {
    this.db.attendance = this.db.attendance.filter(
      (a) => !(a.subscription_id === subscriptionId && a.att_date === date && a.meal === meal),
    )
    if (status) {
      this.db.attendance.push({ id: uid(), subscription_id: subscriptionId, att_date: date, meal, status })
    }
    this.persist()
  }

  async upsertLocation(input: { id?: string; name: string; is_active?: boolean }): Promise<void> {
    if (input.id) {
      const l = this.db.locations.find((x) => x.id === input.id)
      if (!l) throw new Error('Location not found')
      l.name = input.name
      if (input.is_active !== undefined) l.is_active = input.is_active
    } else {
      this.db.locations.push({ id: uid(), name: input.name, is_active: input.is_active ?? true })
    }
    this.persist()
  }

  async upsertPlan(input: { id?: string; name: string; meal_type: 'lunch' | 'dinner' | 'both'; duration_days: number; price: number; is_active?: boolean }): Promise<void> {
    if (input.id) {
      const p = this.db.plans.find((x) => x.id === input.id)
      if (!p) throw new Error('Plan not found')
      Object.assign(p, input)
    } else {
      this.db.plans.push({
        id: uid(),
        name: input.name,
        meal_type: input.meal_type,
        duration_days: input.duration_days,
        price: input.price,
        is_active: input.is_active ?? true,
      })
    }
    this.persist()
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    this.db.settings = { ...settings }
    this.persist()
  }
}
