import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { addDays, todayIST, type ISODate } from '../lib/dates'
import {
  effectiveEndDate,
  isActiveOn,
  isRecentlyExpired,
  servesMeal,
  subscriptionStatus,
} from '../lib/domain'
import { DEFAULT_DUES_TEMPLATE, DEFAULT_RENEWAL_TEMPLATE } from '../lib/whatsapp'
import type { DataAdapter, Session } from './adapter'
import type {
  AppSettings,
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
  SubscriptionDetail,
  SubscriptionFilter,
} from './types'

/** Row shape returned by the `subscription_details` view (before status derivation). */
type ViewRow = Omit<SubscriptionDetail, 'status' | 'paid_total' | 'due_amount' | 'price'> & {
  price: number | string
  paid_total: number | string
  due_amount: number | string
}

export class SupabaseAdapter implements DataAdapter {
  readonly isDemo = false
  private client: SupabaseClient

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey)
  }

  private static throwOn(error: { message: string } | null): void {
    if (error) throw new Error(error.message)
  }

  private toDetail(row: ViewRow, today: ISODate, expiryWindowDays: number): SubscriptionDetail {
    const detail: SubscriptionDetail = {
      ...row,
      price: Number(row.price),
      paid_total: Number(row.paid_total),
      due_amount: Number(row.due_amount),
      status: 'active',
    }
    detail.status = subscriptionStatus(detail, detail.effective_end_date, today, expiryWindowDays)
    return detail
  }

  // ── auth ──
  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.client.auth.signInWithPassword({ email, password })
    SupabaseAdapter.throwOn(error)
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut()
  }

  async getSession(): Promise<Session | null> {
    const { data } = await this.client.auth.getSession()
    if (!data.session) return null
    return { email: data.session.user.email ?? null, isDemo: false }
  }

  // ── reads ──
  async listLocations(includeInactive = false): Promise<Location[]> {
    let query = this.client.from('locations').select('*').order('name')
    if (!includeInactive) query = query.eq('is_active', true)
    const { data, error } = await query
    SupabaseAdapter.throwOn(error)
    return data ?? []
  }

  async listPlans(includeInactive = false): Promise<Plan[]> {
    let query = this.client.from('plans').select('*').order('name')
    if (!includeInactive) query = query.eq('is_active', true)
    const { data, error } = await query
    SupabaseAdapter.throwOn(error)
    return (data ?? []).map((p) => ({ ...p, price: Number(p.price) }))
  }

  async searchCustomers(query: string, locationId?: string): Promise<Customer[]> {
    let q = this.client.from('customers').select('*').order('name').limit(200)
    if (locationId) q = q.eq('location_id', locationId)
    const term = query.trim()
    if (term) q = q.or(`name.ilike.%${term}%,phone.like.%${term}%`)
    const { data, error } = await q
    SupabaseAdapter.throwOn(error)
    return data ?? []
  }

  private async fetchDetails(): Promise<SubscriptionDetail[]> {
    const settings = await this.getSettings()
    const today = todayIST()
    const { data, error } = await this.client.from('subscription_details').select('*')
    SupabaseAdapter.throwOn(error)
    return ((data ?? []) as ViewRow[]).map((r) => this.toDetail(r, today, settings.expiryWindowDays))
  }

  async getCustomer(id: string): Promise<CustomerWithHistory> {
    const { data: customer, error } = await this.client.from('customers').select('*').eq('id', id).single()
    SupabaseAdapter.throwOn(error)
    const settings = await this.getSettings()
    const today = todayIST()

    const { data: subRows, error: subErr } = await this.client
      .from('subscription_details')
      .select('*')
      .eq('customer_id', id)
      .order('start_date', { ascending: false })
    SupabaseAdapter.throwOn(subErr)
    const subs = ((subRows ?? []) as ViewRow[]).map((r) => this.toDetail(r, today, settings.expiryWindowDays))
    const subIds = subs.map((s) => s.id)

    const paymentsBySubscription: Record<string, Payment[]> = {}
    const skipsBySubscription: Record<string, SkipDay[]> = {}
    const attendancePresentBySubscription: Record<string, number> = {}
    if (subIds.length > 0) {
      const [payRes, skipRes, attRes] = await Promise.all([
        this.client.from('payments').select('*').in('subscription_id', subIds).order('paid_on', { ascending: false }),
        this.client.from('skip_days').select('*').in('subscription_id', subIds).order('skip_date'),
        this.client.from('attendance').select('subscription_id').in('subscription_id', subIds).eq('status', 'present'),
      ])
      SupabaseAdapter.throwOn(payRes.error)
      SupabaseAdapter.throwOn(skipRes.error)
      SupabaseAdapter.throwOn(attRes.error)
      for (const s of subs) {
        paymentsBySubscription[s.id] = (payRes.data ?? [])
          .filter((p) => p.subscription_id === s.id)
          .map((p) => ({ ...p, amount: Number(p.amount) }))
        skipsBySubscription[s.id] = (skipRes.data ?? []).filter((k) => k.subscription_id === s.id)
        attendancePresentBySubscription[s.id] = (attRes.data ?? []).filter(
          (a) => a.subscription_id === s.id,
        ).length
      }
    }
    return { customer, subscriptions: subs, paymentsBySubscription, skipsBySubscription, attendancePresentBySubscription }
  }

  async listSubscriptionDetails(filter: SubscriptionFilter = {}): Promise<SubscriptionDetail[]> {
    // The dataset for a tiffin business is small (hundreds of rows), so we
    // fetch the view once and filter client-side with the same domain rules
    // the demo adapter uses.
    const today = todayIST()
    let details = await this.fetchDetails()
    if (filter.locationId) details = details.filter((d) => d.location_id === filter.locationId)
    if (filter.status) details = details.filter((d) => d.status === filter.status)
    if (filter.expiringWithinDays !== undefined) {
      details = details.filter(
        (d) => !d.is_cancelled && d.effective_end_date >= today && d.effective_end_date <= addDays(today, filter.expiringWithinDays!),
      )
    }
    if (filter.recentlyExpiredDays !== undefined) {
      const liveByCustomer = new Set(
        details.filter((d) => !d.is_cancelled && d.effective_end_date >= today).map((d) => d.customer_id),
      )
      details = details.filter((d) =>
        isRecentlyExpired(d, today, filter.recentlyExpiredDays!, liveByCustomer.has(d.customer_id)),
      )
    }
    if (filter.hasDues) details = details.filter((d) => d.due_amount > 0 && !d.is_cancelled)
    return details.sort((a, b) => a.effective_end_date.localeCompare(b.effective_end_date))
  }

  async getSubscriptionDetail(id: string): Promise<SubscriptionDetail> {
    const settings = await this.getSettings()
    const { data, error } = await this.client.from('subscription_details').select('*').eq('id', id).single()
    SupabaseAdapter.throwOn(error)
    return this.toDetail(data as ViewRow, todayIST(), settings.expiryWindowDays)
  }

  async listAttendanceSheet(
    locationId: string | undefined,
    date: ISODate,
    meal: AttendanceMeal,
  ): Promise<AttendanceRow[]> {
    const details = await this.fetchDetails()
    const candidates = details.filter(
      (d) =>
        (!locationId || d.location_id === locationId) &&
        servesMeal(d.meal_type, meal) &&
        isActiveOn(d, effectiveEndDate(d.end_date, d.skip_count), date),
    )
    const subIds = candidates.map((d) => d.id)
    if (subIds.length === 0) return []
    const [markRes, skipRes] = await Promise.all([
      this.client.from('attendance').select('*').in('subscription_id', subIds).eq('att_date', date).eq('meal', meal),
      this.client.from('skip_days').select('subscription_id').in('subscription_id', subIds).eq('skip_date', date),
    ])
    SupabaseAdapter.throwOn(markRes.error)
    SupabaseAdapter.throwOn(skipRes.error)
    const marks = new Map((markRes.data ?? []).map((m) => [m.subscription_id, m.status as AttendanceStatus]))
    const skips = new Set((skipRes.data ?? []).map((k) => k.subscription_id))
    return candidates
      .map((d) => ({ subscription: d, mark: marks.get(d.id) ?? null, isSkipDay: skips.has(d.id) }))
      .sort((a, b) => a.subscription.customer_name.localeCompare(b.subscription.customer_name))
  }

  async getMonthlyReport(month: string): Promise<ReportRow[]> {
    const [locations, details] = await Promise.all([this.listLocations(true), this.fetchDetails()])
    const from = `${month}-01`
    const to = `${month}-31`
    const { data: pays, error } = await this.client
      .from('payments')
      .select('amount, paid_on, subscription_id')
      .gte('paid_on', from)
      .lte('paid_on', to)
    SupabaseAdapter.throwOn(error)
    const locBySub = new Map(details.map((d) => [d.id, d.location_id]))
    const today = todayIST()
    const monthEnd = to > today ? today : to
    return locations.map((loc) => {
      const revenue = (pays ?? [])
        .filter((p) => locBySub.get(p.subscription_id) === loc.id)
        .reduce((sum, p) => sum + Number(p.amount), 0)
      const newSubscriptions = details.filter(
        (d) => d.location_id === loc.id && d.start_date.slice(0, 7) === month,
      ).length
      const activeAtMonthEnd = details.filter(
        (d) => d.location_id === loc.id && isActiveOn(d, d.effective_end_date, monthEnd),
      ).length
      return { locationId: loc.id, locationName: loc.name, revenue, newSubscriptions, activeAtMonthEnd }
    })
  }

  async getSettings(): Promise<AppSettings> {
    const { data, error } = await this.client.from('app_settings').select('*')
    SupabaseAdapter.throwOn(error)
    const map = new Map((data ?? []).map((r) => [r.key, r.value]))
    const settings: AppSettings = {
      renewalTemplate: map.get('renewal_template') || DEFAULT_RENEWAL_TEMPLATE,
      duesTemplate: map.get('dues_template') || DEFAULT_DUES_TEMPLATE,
      upiId: map.get('upi_id') || '',
      expiryWindowDays: Number(map.get('expiry_window_days')) || 5,
    }
    return settings
  }

  // ── writes ──
  async createCustomer(input: { name: string; phone: string | null; location_id: string; notes?: string | null }): Promise<Customer> {
    const { data, error } = await this.client
      .from('customers')
      .insert({ name: input.name.trim(), phone: input.phone, location_id: input.location_id, notes: input.notes ?? null })
      .select()
      .single()
    SupabaseAdapter.throwOn(error)
    return data
  }

  async updateCustomer(id: string, patch: Partial<Pick<Customer, 'name' | 'phone' | 'location_id' | 'notes'>>): Promise<void> {
    const { error } = await this.client.from('customers').update(patch).eq('id', id)
    SupabaseAdapter.throwOn(error)
  }

  async createSubscription(
    input: NewSubscriptionInput,
    initialPayment?: { amount: number; mode: 'cash' | 'upi' | 'other' },
  ): Promise<string> {
    const { data, error } = await this.client
      .from('subscriptions')
      .insert({
        customer_id: input.customer_id,
        location_id: input.location_id,
        meal_type: input.meal_type,
        start_date: input.start_date,
        end_date: input.end_date,
        price: input.price,
        notes: input.notes ?? null,
      })
      .select('id')
      .single()
    SupabaseAdapter.throwOn(error)
    const subId = data!.id as string
    if (initialPayment && initialPayment.amount > 0) {
      // Two inserts (not atomic); acceptable for v1 — an RPC could make this
      // a single transaction later.
      await this.addPayment(subId, { amount: initialPayment.amount, paid_on: todayIST(), mode: initialPayment.mode })
    }
    return subId
  }

  async cancelSubscription(id: string): Promise<void> {
    const { error } = await this.client.from('subscriptions').update({ is_cancelled: true }).eq('id', id)
    SupabaseAdapter.throwOn(error)
  }

  async addPayment(
    subscriptionId: string,
    input: { amount: number; paid_on: ISODate; mode: 'cash' | 'upi' | 'other'; note?: string | null },
  ): Promise<void> {
    const { error } = await this.client.from('payments').insert({
      subscription_id: subscriptionId,
      amount: input.amount,
      paid_on: input.paid_on,
      mode: input.mode,
      note: input.note ?? null,
    })
    SupabaseAdapter.throwOn(error)
  }

  async deletePayment(id: string): Promise<void> {
    const { error } = await this.client.from('payments').delete().eq('id', id)
    SupabaseAdapter.throwOn(error)
  }

  async addSkipDay(subscriptionId: string, date: ISODate, note?: string | null): Promise<void> {
    const { error } = await this.client
      .from('skip_days')
      .insert({ subscription_id: subscriptionId, skip_date: date, note: note ?? null })
    SupabaseAdapter.throwOn(error)
  }

  async removeSkipDay(id: string): Promise<void> {
    const { error } = await this.client.from('skip_days').delete().eq('id', id)
    SupabaseAdapter.throwOn(error)
  }

  async setAttendance(
    subscriptionId: string,
    date: ISODate,
    meal: AttendanceMeal,
    status: AttendanceStatus | null,
  ): Promise<void> {
    if (status === null) {
      const { error } = await this.client
        .from('attendance')
        .delete()
        .eq('subscription_id', subscriptionId)
        .eq('att_date', date)
        .eq('meal', meal)
      SupabaseAdapter.throwOn(error)
      return
    }
    const { error } = await this.client
      .from('attendance')
      .upsert(
        { subscription_id: subscriptionId, att_date: date, meal, status },
        { onConflict: 'subscription_id,att_date,meal' },
      )
    SupabaseAdapter.throwOn(error)
  }

  async upsertLocation(input: { id?: string; name: string; is_active?: boolean }): Promise<void> {
    const row = { name: input.name, is_active: input.is_active ?? true }
    const { error } = input.id
      ? await this.client.from('locations').update(row).eq('id', input.id)
      : await this.client.from('locations').insert(row)
    SupabaseAdapter.throwOn(error)
  }

  async upsertPlan(input: { id?: string; name: string; meal_type: 'lunch' | 'dinner' | 'both'; duration_days: number; price: number; is_active?: boolean }): Promise<void> {
    const row = {
      name: input.name,
      meal_type: input.meal_type,
      duration_days: input.duration_days,
      price: input.price,
      is_active: input.is_active ?? true,
    }
    const { error } = input.id
      ? await this.client.from('plans').update(row).eq('id', input.id)
      : await this.client.from('plans').insert(row)
    SupabaseAdapter.throwOn(error)
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    const rows = [
      { key: 'renewal_template', value: settings.renewalTemplate },
      { key: 'dues_template', value: settings.duesTemplate },
      { key: 'upi_id', value: settings.upiId },
      { key: 'expiry_window_days', value: String(settings.expiryWindowDays) },
    ]
    const { error } = await this.client.from('app_settings').upsert(rows)
    SupabaseAdapter.throwOn(error)
  }
}
