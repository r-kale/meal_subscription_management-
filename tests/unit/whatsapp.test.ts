import { describe, expect, it } from 'vitest'
import { DEFAULT_RENEWAL_TEMPLATE, renderTemplate, waLink } from '../../src/lib/whatsapp'

const ctx = {
  name: 'Sonali',
  endDate: '2026-07-24',
  meal: 'Lunch',
  price: 1500,
  due: 750,
  upi: 'owner@upi',
}

describe('renderTemplate', () => {
  it('fills all placeholders', () => {
    const msg = renderTemplate('{name} {end_date} {meal} {price} {due} {upi}', ctx)
    expect(msg).toBe('Sonali 24/07/2026 Lunch ₹1,500 ₹750 owner@upi')
  })
  it('default renewal template mentions the person and date', () => {
    const msg = renderTemplate(DEFAULT_RENEWAL_TEMPLATE, ctx)
    expect(msg).toContain('Sonali')
    expect(msg).toContain('24/07/2026')
    expect(msg).toContain('owner@upi')
  })
})

describe('waLink', () => {
  it('prefixes 91 for 10-digit numbers and URL-encodes the message', () => {
    const link = waLink('7757010226', 'Namaste Sonali ji! ₹1,500')
    expect(link).toContain('https://wa.me/917757010226?text=')
    expect(link).toContain(encodeURIComponent('Namaste Sonali ji! ₹1,500'))
  })
  it('strips formatting characters from the phone', () => {
    expect(waLink('77570-10226', 'hi')).toContain('wa.me/917757010226')
  })
})
