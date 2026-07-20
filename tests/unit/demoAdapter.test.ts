import { beforeEach, describe, expect, it } from 'vitest'
import { DemoAdapter, buildSeed } from '../../src/data/demoAdapter'
import { addDays, todayIST } from '../../src/lib/dates'

// The demo adapter falls back to in-memory storage when localStorage is
// unavailable (as in the node test environment).

let adapter: DemoAdapter

beforeEach(() => {
  adapter = new DemoAdapter(buildSeed())
})

describe('DemoAdapter reads', () => {
  it('lists seeded locations and plans', async () => {
    expect((await adapter.listLocations()).length).toBe(2)
    expect((await adapter.listPlans()).length).toBe(3)
  })

  it('search matches name and phone, filtered by location', async () => {
    const byName = await adapter.searchCustomers('sonali')
    expect(byName.map((c) => c.name)).toContain('Sonali Pawar')
    const byPhone = await adapter.searchCustomers('7757010226')
    expect(byPhone.map((c) => c.name)).toContain('Sonali Pawar')
    const wrongLoc = await adapter.searchCustomers('sonali', 'loc-b')
    expect(wrongLoc.length).toBe(0)
  })

  it('expiring filter matches domain rules', async () => {
    const expiring = await adapter.listSubscriptionDetails({ expiringWithinDays: 5 })
    expect(expiring.length).toBeGreaterThan(0)
    const today = todayIST()
    for (const d of expiring) {
      expect(d.effective_end_date >= today).toBe(true)
      expect(d.effective_end_date <= addDays(today, 5)).toBe(true)
    }
  })

  it('recently-expired excludes customers who renewed', async () => {
    const expired = await adapter.listSubscriptionDetails({ recentlyExpiredDays: 7 })
    expect(expired.map((d) => d.customer_name)).toContain('Pradeep Patil')
    // Renew Pradeep: new subscription starting today.
    const pradeep = expired.find((d) => d.customer_name === 'Pradeep Patil')!
    await adapter.createSubscription({
      customer_id: pradeep.customer_id,
      location_id: pradeep.location_id,
      meal_type: 'lunch',
      start_date: todayIST(),
      end_date: addDays(todayIST(), 29),
      price: 1750,
    })
    const after = await adapter.listSubscriptionDetails({ recentlyExpiredDays: 7 })
    expect(after.map((d) => d.customer_name)).not.toContain('Pradeep Patil')
  })

  it('dues filter reflects partial payments', async () => {
    const dues = await adapter.listSubscriptionDetails({ hasDues: true })
    const pankaj = dues.find((d) => d.customer_name === 'Pankaj Biller')
    expect(pankaj?.due_amount).toBe(1550)
  })
})

describe('DemoAdapter skip days', () => {
  it('adding a skip extends the effective end by one day', async () => {
    const [d] = await adapter.listSubscriptionDetails({ status: 'active' })
    const before = d.effective_end_date
    await adapter.addSkipDay(d.id, todayIST())
    const after = await adapter.getSubscriptionDetail(d.id)
    expect(after.effective_end_date).toBe(addDays(before, 1))
  })

  it('rejects duplicate skip dates', async () => {
    const [d] = await adapter.listSubscriptionDetails({ status: 'active' })
    await adapter.addSkipDay(d.id, todayIST())
    await expect(adapter.addSkipDay(d.id, todayIST())).rejects.toThrow()
  })

  it('a skip day hides the customer from that day’s attendance sheet', async () => {
    const today = todayIST()
    const sheetBefore = await adapter.listAttendanceSheet('loc-a', today, 'lunch')
    const target = sheetBefore.find((r) => !r.isSkipDay)!
    await adapter.addSkipDay(target.subscription.id, today)
    const sheetAfter = await adapter.listAttendanceSheet('loc-a', today, 'lunch')
    const row = sheetAfter.find((r) => r.subscription.id === target.subscription.id)!
    expect(row.isSkipDay).toBe(true)
  })
})

describe('DemoAdapter attendance', () => {
  it('marks, remarks and clears attendance', async () => {
    const today = todayIST()
    const sheet = await adapter.listAttendanceSheet(undefined, today, 'dinner')
    expect(sheet.length).toBeGreaterThan(0)
    const sub = sheet[0].subscription.id
    await adapter.setAttendance(sub, today, 'dinner', 'present')
    let rows = await adapter.listAttendanceSheet(undefined, today, 'dinner')
    expect(rows.find((r) => r.subscription.id === sub)?.mark).toBe('present')
    await adapter.setAttendance(sub, today, 'dinner', 'absent')
    rows = await adapter.listAttendanceSheet(undefined, today, 'dinner')
    expect(rows.find((r) => r.subscription.id === sub)?.mark).toBe('absent')
    await adapter.setAttendance(sub, today, 'dinner', null)
    rows = await adapter.listAttendanceSheet(undefined, today, 'dinner')
    expect(rows.find((r) => r.subscription.id === sub)?.mark).toBeNull()
  })

  it('lunch sheet only includes lunch and both subscribers', async () => {
    const sheet = await adapter.listAttendanceSheet(undefined, todayIST(), 'lunch')
    for (const r of sheet) {
      expect(['lunch', 'both']).toContain(r.subscription.meal_type)
    }
  })
})

describe('DemoAdapter payments and subscriptions', () => {
  it('initial partial payment leaves a due, later payment clears it', async () => {
    const cust = await adapter.createCustomer({ name: 'Test Person', phone: '9000000001', location_id: 'loc-a' })
    const subId = await adapter.createSubscription(
      {
        customer_id: cust.id,
        location_id: 'loc-a',
        meal_type: 'dinner',
        start_date: todayIST(),
        end_date: addDays(todayIST(), 29),
        price: 1750,
      },
      { amount: 500, mode: 'cash' },
    )
    let d = await adapter.getSubscriptionDetail(subId)
    expect(d.paid_total).toBe(500)
    expect(d.due_amount).toBe(1250)
    await adapter.addPayment(subId, { amount: 1250, paid_on: todayIST(), mode: 'upi' })
    d = await adapter.getSubscriptionDetail(subId)
    expect(d.due_amount).toBe(0)
  })

  it('cancelling removes the sub from attendance', async () => {
    const today = todayIST()
    const sheet = await adapter.listAttendanceSheet(undefined, today, 'lunch')
    const target = sheet[0].subscription.id
    await adapter.cancelSubscription(target)
    const after = await adapter.listAttendanceSheet(undefined, today, 'lunch')
    expect(after.map((r) => r.subscription.id)).not.toContain(target)
  })

  it('monthly report sums payments by location for the month', async () => {
    const month = todayIST().slice(0, 7)
    const report = await adapter.getMonthlyReport(month)
    expect(report.length).toBe(2)
    const total = report.reduce((s, r) => s + r.revenue, 0)
    expect(total).toBeGreaterThan(0)
  })
})

describe('DemoAdapter v1.1 additions', () => {
  it('monthly report counts meals served from present marks', async () => {
    const today = todayIST()
    const sheet = await adapter.listAttendanceSheet('loc-a', today, 'lunch')
    await adapter.setAttendance(sheet[0].subscription.id, today, 'lunch', 'present')
    await adapter.setAttendance(sheet[1].subscription.id, today, 'lunch', 'absent')
    const report = await adapter.getMonthlyReport(today.slice(0, 7))
    const locA = report.find((r) => r.locationId === 'loc-a')!
    expect(locA.mealsServed).toBe(1)
  })

  it('updateCustomer edits name, phone and location', async () => {
    const [c] = await adapter.searchCustomers('Sonali')
    await adapter.updateCustomer(c.id, { name: 'Sonali P.', phone: '9999900000', location_id: 'loc-b' })
    const { customer } = await adapter.getCustomer(c.id)
    expect(customer.name).toBe('Sonali P.')
    expect(customer.phone).toBe('9999900000')
    expect(customer.location_id).toBe('loc-b')
  })

  it('upsertLocation renames an existing location', async () => {
    await adapter.upsertLocation({ id: 'loc-a', name: 'Renamed Branch' })
    const locations = await adapter.listLocations()
    expect(locations.map((l) => l.name)).toContain('Renamed Branch')
  })

  it('settings include an editable welcome template', async () => {
    const s = await adapter.getSettings()
    expect(s.welcomeTemplate.length).toBeGreaterThan(0)
    await adapter.saveSettings({ ...s, welcomeTemplate: 'Hello {name}!' })
    expect((await adapter.getSettings()).welcomeTemplate).toBe('Hello {name}!')
  })
})
