import { describe, expect, it } from 'vitest'
import {
  dueAmount,
  effectiveEndDate,
  isActiveOn,
  isExpiringWithin,
  isRecentlyExpired,
  renewalStartDate,
  servesMeal,
  subscriptionStatus,
} from '../../src/lib/domain'
import type { SubscriptionDetail } from '../../src/data/types'

const TODAY = '2026-07-19'

function detail(overrides: Partial<SubscriptionDetail>): SubscriptionDetail {
  return {
    id: 's1',
    customer_id: 'c1',
    location_id: 'l1',
    meal_type: 'lunch',
    start_date: '2026-07-01',
    end_date: '2026-07-30',
    price: 1750,
    is_cancelled: false,
    notes: null,
    created_at: '',
    customer_name: 'Test',
    phone: '9999999999',
    skip_count: 0,
    effective_end_date: '2026-07-30',
    paid_total: 1750,
    due_amount: 0,
    status: 'active',
    ...overrides,
  }
}

describe('effectiveEndDate', () => {
  it('is the end date with no skips', () => {
    expect(effectiveEndDate('2026-07-30', 0)).toBe('2026-07-30')
  })
  it('extends one day per skip', () => {
    expect(effectiveEndDate('2026-07-30', 2)).toBe('2026-08-01')
  })
  it('crosses month and year boundaries', () => {
    expect(effectiveEndDate('2026-12-30', 3)).toBe('2027-01-02')
  })
})

describe('dueAmount', () => {
  it('is zero when fully paid', () => {
    expect(dueAmount(1750, 1750)).toBe(0)
  })
  it('is positive for partial payment', () => {
    expect(dueAmount(1750, 200)).toBe(1550)
  })
  it('is negative for overpayment', () => {
    expect(dueAmount(1750, 2000)).toBe(-250)
  })
})

describe('subscriptionStatus', () => {
  const base = { start_date: '2026-07-01', is_cancelled: false }
  it('cancelled wins over everything', () => {
    expect(subscriptionStatus({ ...base, is_cancelled: true }, '2026-07-30', TODAY, 5)).toBe('cancelled')
  })
  it('upcoming when start is in the future', () => {
    expect(subscriptionStatus({ ...base, start_date: '2026-07-25' }, '2026-08-24', TODAY, 5)).toBe('upcoming')
  })
  it('expired when effective end is before today', () => {
    expect(subscriptionStatus(base, '2026-07-18', TODAY, 5)).toBe('expired')
  })
  it('expiring on the last day', () => {
    expect(subscriptionStatus(base, TODAY, TODAY, 5)).toBe('expiring')
  })
  it('expiring at exactly the window edge', () => {
    expect(subscriptionStatus(base, '2026-07-24', TODAY, 5)).toBe('expiring')
  })
  it('active just beyond the window edge', () => {
    expect(subscriptionStatus(base, '2026-07-25', TODAY, 5)).toBe('active')
  })
})

describe('servesMeal', () => {
  it('matches same meal', () => {
    expect(servesMeal('lunch', 'lunch')).toBe(true)
    expect(servesMeal('dinner', 'lunch')).toBe(false)
  })
  it('both serves everything', () => {
    expect(servesMeal('both', 'lunch')).toBe(true)
    expect(servesMeal('both', 'dinner')).toBe(true)
  })
})

describe('isActiveOn', () => {
  const sub = { start_date: '2026-07-01', is_cancelled: false }
  it('inclusive of start and effective end', () => {
    expect(isActiveOn(sub, '2026-07-30', '2026-07-01')).toBe(true)
    expect(isActiveOn(sub, '2026-07-30', '2026-07-30')).toBe(true)
  })
  it('false outside the range', () => {
    expect(isActiveOn(sub, '2026-07-30', '2026-06-30')).toBe(false)
    expect(isActiveOn(sub, '2026-07-30', '2026-07-31')).toBe(false)
  })
  it('a skip-extended end keeps it active', () => {
    const withSkips = effectiveEndDate('2026-07-30', 2)
    expect(isActiveOn(sub, withSkips, '2026-08-01')).toBe(true)
  })
  it('false when cancelled', () => {
    expect(isActiveOn({ ...sub, is_cancelled: true }, '2026-07-30', '2026-07-15')).toBe(false)
  })
})

describe('isExpiringWithin', () => {
  it('includes today and the window edge, excludes beyond', () => {
    expect(isExpiringWithin(detail({ effective_end_date: TODAY }), TODAY, 5)).toBe(true)
    expect(isExpiringWithin(detail({ effective_end_date: '2026-07-24' }), TODAY, 5)).toBe(true)
    expect(isExpiringWithin(detail({ effective_end_date: '2026-07-25' }), TODAY, 5)).toBe(false)
  })
  it('excludes already-expired and cancelled', () => {
    expect(isExpiringWithin(detail({ effective_end_date: '2026-07-18' }), TODAY, 5)).toBe(false)
    expect(isExpiringWithin(detail({ effective_end_date: TODAY, is_cancelled: true }), TODAY, 5)).toBe(false)
  })
})

describe('isRecentlyExpired', () => {
  it('true within the window when customer has not renewed', () => {
    expect(isRecentlyExpired(detail({ effective_end_date: '2026-07-15' }), TODAY, 7, false)).toBe(true)
  })
  it('false when the customer already has a live subscription', () => {
    expect(isRecentlyExpired(detail({ effective_end_date: '2026-07-15' }), TODAY, 7, true)).toBe(false)
  })
  it('false when expired too long ago or not yet expired', () => {
    expect(isRecentlyExpired(detail({ effective_end_date: '2026-07-10' }), TODAY, 7, false)).toBe(false)
    expect(isRecentlyExpired(detail({ effective_end_date: TODAY }), TODAY, 7, false)).toBe(false)
  })
})

describe('renewalStartDate', () => {
  it('starts the day after the effective end', () => {
    expect(renewalStartDate('2026-07-25', TODAY)).toBe('2026-07-26')
  })
  it('never starts in the past for long-expired subscriptions', () => {
    expect(renewalStartDate('2026-06-10', TODAY)).toBe(TODAY)
  })
})
