import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Customer, MealType, PaymentMode, Plan } from '../data/types'
import { addDays, formatDMY, todayIST } from '../lib/dates'
import { renewalStartDate } from '../lib/domain'
import { inr } from '../lib/money'
import { useApp } from '../state/AppContext'

/**
 * Creates a subscription — for a brand-new customer (inline create), an
 * existing customer (?customer=id), or as a renewal (?renew=subscriptionId,
 * which prefills plan details and starts the day after the old one ends).
 */
export function SubscriptionForm() {
  const { adapter, locations, locationFilter } = useApp()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const customerId = params.get('customer')
  const renewOf = params.get('renew')

  const [plans, setPlans] = useState<Plan[]>([])
  const [customer, setCustomer] = useState<Customer | null>(null)

  // inline new-customer fields
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [locationId, setLocationId] = useState(locationFilter || '')

  // subscription fields
  const [planId, setPlanId] = useState('')
  const [mealType, setMealType] = useState<MealType>('lunch')
  const [startDate, setStartDate] = useState(todayIST())
  const [durationDays, setDurationDays] = useState(30)
  const [price, setPrice] = useState(1750)
  const [notes, setNotes] = useState('')
  const [initialAmount, setInitialAmount] = useState('')
  const [payMode, setPayMode] = useState<PaymentMode>('upi')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    adapter.listPlans().then((p) => {
      setPlans(p)
      if (p.length > 0) applyPlan(p[0])
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter])

  useEffect(() => {
    if (!customerId) return
    adapter.getCustomer(customerId).then((h) => {
      setCustomer(h.customer)
      setLocationId(h.customer.location_id)
      const old = renewOf ? h.subscriptions.find((s) => s.id === renewOf) : undefined
      if (old) {
        setMealType(old.meal_type)
        setPrice(old.price)
        setStartDate(renewalStartDate(old.effective_end_date, todayIST()))
        setPlanId('')
      }
    })
  }, [adapter, customerId, renewOf])

  useEffect(() => {
    if (!locationId && locations.length > 0) setLocationId(locations[0].id)
  }, [locations, locationId])

  function applyPlan(plan: Plan) {
    setPlanId(plan.id)
    setMealType(plan.meal_type)
    setDurationDays(plan.duration_days)
    setPrice(plan.price)
  }

  const endDate = useMemo(() => addDays(startDate, durationDays - 1), [startDate, durationDays])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!customer && !name.trim()) {
      setError('Enter the customer name')
      return
    }
    if (!locationId) {
      setError('Choose a location')
      return
    }
    const phoneDigits = phone.replace(/\D/g, '')
    if (!customer && phoneDigits && phoneDigits.length !== 10) {
      setError('Phone must be 10 digits (or leave it empty)')
      return
    }
    setBusy(true)
    try {
      const cust = customer ?? (await adapter.createCustomer({ name, phone: phoneDigits || null, location_id: locationId }))
      const amt = Number(initialAmount)
      await adapter.createSubscription(
        {
          customer_id: cust.id,
          location_id: locationId,
          meal_type: mealType,
          start_date: startDate,
          end_date: endDate,
          price,
          notes: notes || null,
        },
        amt > 0 ? { amount: amt, mode: payMode } : undefined,
      )
      navigate(`/customers/${cust.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <h2>{renewOf ? 'Renew subscription' : customer ? 'New subscription' : 'New customer'}</h2>
      <form className="card" onSubmit={submit}>
        {customer ? (
          <p>
            <strong>{customer.name}</strong> {customer.phone ? `· ${customer.phone}` : ''}
          </p>
        ) : (
          <>
            <div className="field">
              <label htmlFor="cust-name">Name</label>
              <input id="cust-name" value={name} onChange={(e) => setName(e.target.value)} required data-testid="new-name" />
            </div>
            <div className="field">
              <label htmlFor="cust-phone">Phone (10 digits, optional)</label>
              <input id="cust-phone" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="new-phone" />
            </div>
          </>
        )}

        <div className="field">
          <label htmlFor="sub-location">Location</label>
          <select id="sub-location" value={locationId} onChange={(e) => setLocationId(e.target.value)} data-testid="new-location">
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="sub-plan">Plan preset</label>
          <select
            id="sub-plan"
            value={planId}
            onChange={(e) => {
              const p = plans.find((x) => x.id === e.target.value)
              if (p) applyPlan(p)
            }}
            data-testid="plan-select"
          >
            {planId === '' && <option value="">Custom</option>}
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {inr(p.price)}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="sub-meal">Meal</label>
          <select id="sub-meal" value={mealType} onChange={(e) => setMealType(e.target.value as MealType)} data-testid="meal-select">
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
            <option value="both">Lunch + Dinner</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="sub-start">Start date</label>
          <input id="sub-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid="start-date" />
        </div>
        <div className="field">
          <label htmlFor="sub-days">Duration (days)</label>
          <input
            id="sub-days"
            type="number"
            inputMode="numeric"
            min={1}
            value={durationDays}
            onChange={(e) => setDurationDays(Math.max(1, Number(e.target.value)))}
          />
        </div>
        <p className="muted">
          Ends on <strong data-testid="computed-end">{formatDMY(endDate)}</strong>
        </p>
        <div className="field">
          <label htmlFor="sub-price">Price (₹)</label>
          <input id="sub-price" type="number" inputMode="numeric" min={0} value={price} onChange={(e) => setPrice(Number(e.target.value))} data-testid="price-input" />
        </div>
        <div className="field">
          <label htmlFor="sub-paid">Amount received now (₹, optional — partial allowed)</label>
          <input id="sub-paid" type="number" inputMode="numeric" min={0} value={initialAmount} onChange={(e) => setInitialAmount(e.target.value)} data-testid="initial-payment" />
        </div>
        {Number(initialAmount) > 0 && Number(initialAmount) < price && (
          <p className="muted">Remaining {inr(price - Number(initialAmount))} will show as due.</p>
        )}
        <div className="field">
          <label htmlFor="sub-paymode">Payment mode</label>
          <select id="sub-paymode" value={payMode} onChange={(e) => setPayMode(e.target.value as PaymentMode)}>
            <option value="upi">UPI</option>
            <option value="cash">Cash</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="sub-notes">Notes (optional)</label>
          <input id="sub-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="btn-row">
          <button className="btn primary" type="submit" disabled={busy} data-testid="save-subscription">
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button className="btn" type="button" onClick={() => navigate(-1)}>
            Back
          </button>
        </div>
      </form>
    </div>
  )
}
