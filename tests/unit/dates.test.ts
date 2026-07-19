import { describe, expect, it } from 'vitest'
import { addDays, daysBetween, formatDMY, hourIST, monthLabel, monthOf, todayIST } from '../../src/lib/dates'

describe('addDays', () => {
  it('adds within a month', () => {
    expect(addDays('2026-07-01', 10)).toBe('2026-07-11')
  })
  it('crosses months and years', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
  it('handles leap years', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })
  it('supports negative deltas', () => {
    expect(addDays('2026-07-01', -1)).toBe('2026-06-30')
  })
})

describe('daysBetween', () => {
  it('is positive going forward and negative backward', () => {
    expect(daysBetween('2026-07-01', '2026-07-31')).toBe(30)
    expect(daysBetween('2026-07-31', '2026-07-01')).toBe(-30)
    expect(daysBetween('2026-07-19', '2026-07-19')).toBe(0)
  })
})

describe('todayIST', () => {
  it('rolls to the next day at 18:30 UTC', () => {
    expect(todayIST(new Date('2026-07-19T18:29:00Z'))).toBe('2026-07-19')
    expect(todayIST(new Date('2026-07-19T18:30:00Z'))).toBe('2026-07-20')
  })
})

describe('hourIST', () => {
  it('is 5.5 hours ahead of UTC', () => {
    expect(hourIST(new Date('2026-07-19T10:00:00Z'))).toBe(15)
    expect(hourIST(new Date('2026-07-19T11:00:00Z'))).toBe(16)
  })
})

describe('formatting', () => {
  it('formatDMY', () => {
    expect(formatDMY('2026-07-19')).toBe('19/07/2026')
  })
  it('monthOf and monthLabel', () => {
    expect(monthOf('2026-07-19')).toBe('2026-07')
    expect(monthLabel('2026-07')).toBe('July 2026')
  })
})
