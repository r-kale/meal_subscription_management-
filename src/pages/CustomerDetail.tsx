import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Modal, Spinner, StatusBadge } from '../components/ui'
import type { Customer, CustomerWithHistory, PaymentMode, SubscriptionDetail } from '../data/types'
import { addDays, formatDMY, todayIST } from '../lib/dates'
import { MEAL_LABEL } from '../lib/domain'
import { inr } from '../lib/money'
import { renderTemplate, waLink } from '../lib/whatsapp'
import { useApp } from '../state/AppContext'

export function CustomerDetail() {
  const { id } = useParams<{ id: string }>()
  const { adapter, locations } = useApp()
  const navigate = useNavigate()
  const [data, setData] = useState<CustomerWithHistory | null>(null)
  const [payFor, setPayFor] = useState<SubscriptionDetail | null>(null)
  const [skipFor, setSkipFor] = useState<SubscriptionDetail | null>(null)
  const [messageFor, setMessageFor] = useState<SubscriptionDetail | null>(null)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(() => {
    if (id) adapter.getCustomer(id).then(setData).catch((e) => setError(String(e)))
  }, [adapter, id])

  useEffect(reload, [reload])

  if (error) return <div className="page"><p className="error-text">{error}</p></div>
  if (!data) return <Spinner />

  const { customer, subscriptions } = data
  const current = subscriptions.find((s) => !s.is_cancelled && s.status !== 'expired') ?? subscriptions[0]
  const past = subscriptions.filter((s) => s !== current)
  const locationName = locations.find((l) => l.id === customer.location_id)?.name

  async function cancelSub(subId: string) {
    if (!window.confirm('Cancel this subscription?')) return
    await adapter.cancelSubscription(subId)
    reload()
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 data-testid="customer-name" style={{ flex: 1 }}>
          {customer.name}
        </h2>
        <button className="btn small" onClick={() => setEditing(true)} data-testid="edit-customer">
          ✏️ Edit
        </button>
      </div>
      <div className="muted">
        {customer.phone && (
          <>
            <a href={`tel:${customer.phone}`}>{customer.phone}</a> ·{' '}
          </>
        )}
        {locationName ?? 'Unknown location'}
        {customer.notes ? ` · ${customer.notes}` : ''}
      </div>

      {current ? (
        <SubscriptionCard
          detail={current}
          presentCount={data.attendancePresentBySubscription[current.id] ?? 0}
          skips={data.skipsBySubscription[current.id] ?? []}
          payments={data.paymentsBySubscription[current.id] ?? []}
          onAddPayment={() => setPayFor(current)}
          onAddSkip={() => setSkipFor(current)}
          onMessage={() => setMessageFor(current)}
          onRenew={() => navigate(`/subscribe?customer=${customer.id}&renew=${current.id}`)}
          onCancel={() => cancelSub(current.id)}
          onRemoveSkip={async (skipId) => {
            await adapter.removeSkipDay(skipId)
            reload()
          }}
        />
      ) : (
        <div className="card">
          <p className="muted">No subscription yet.</p>
          <button className="btn primary" onClick={() => navigate(`/subscribe?customer=${customer.id}`)}>
            New subscription
          </button>
        </div>
      )}

      {past.length > 0 && (
        <div className="card">
          <h3>History</h3>
          {past.map((s) => (
            <div className="row" key={s.id}>
              <div className="grow">
                <div className="name">
                  {MEAL_LABEL[s.meal_type]} · {inr(s.price)}
                </div>
                <div className="meta">
                  {formatDMY(s.start_date)} → {formatDMY(s.effective_end_date)}
                  {s.skip_count > 0 ? ` (+${s.skip_count} skip)` : ''}
                </div>
              </div>
              {s.due_amount > 0 && !s.is_cancelled && <span className="badge red">{inr(s.due_amount)} due</span>}
              <StatusBadge status={s.status} />
            </div>
          ))}
        </div>
      )}

      {payFor && (
        <PaymentModal
          detail={payFor}
          onClose={() => setPayFor(null)}
          onSaved={() => {
            setPayFor(null)
            reload()
          }}
        />
      )}
      {skipFor && (
        <SkipModal
          detail={skipFor}
          onClose={() => setSkipFor(null)}
          onSaved={() => {
            setSkipFor(null)
            reload()
          }}
        />
      )}
      {messageFor && <MessageModal detail={messageFor} onClose={() => setMessageFor(null)} />}
      {editing && (
        <EditCustomerModal
          customer={customer}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            reload()
          }}
        />
      )}
    </div>
  )
}

function EditCustomerModal(props: { customer: Customer; onClose: () => void; onSaved: () => void }) {
  const { adapter, locations } = useApp()
  const [name, setName] = useState(props.customer.name)
  const [phone, setPhone] = useState(props.customer.phone ?? '')
  const [locationId, setLocationId] = useState(props.customer.location_id)
  const [notes, setNotes] = useState(props.customer.notes ?? '')
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    const digits = phone.replace(/\D/g, '')
    if (digits && digits.length !== 10) {
      setError('Phone must be 10 digits (or empty)')
      return
    }
    try {
      await adapter.updateCustomer(props.customer.id, {
        name: name.trim(),
        phone: digits || null,
        location_id: locationId,
        notes: notes.trim() || null,
      })
      props.onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  return (
    <Modal title="Edit customer" onClose={props.onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="edit-name">Name</label>
          <input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} data-testid="edit-name" />
        </div>
        <div className="field">
          <label htmlFor="edit-phone">Phone (10 digits, optional)</label>
          <input id="edit-phone" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="edit-phone" />
        </div>
        <div className="field">
          <label htmlFor="edit-location">Location</label>
          <select id="edit-location" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="edit-notes">Notes</label>
          <textarea id="edit-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="btn-row">
          <button className="btn primary" type="submit" data-testid="save-customer">
            Save
          </button>
          <button className="btn" type="button" onClick={props.onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}

function MessageModal(props: { detail: SubscriptionDetail; onClose: () => void }) {
  const { settings } = useApp()
  const [custom, setCustom] = useState('')
  const d = props.detail
  if (!d.phone) return null
  const ctx = {
    name: d.customer_name,
    endDate: d.effective_end_date,
    meal: MEAL_LABEL[d.meal_type] ?? d.meal_type,
    price: d.price,
    due: d.due_amount,
    upi: settings.upiId || '—',
  }
  const options = [
    { label: 'Renewal reminder', message: renderTemplate(settings.renewalTemplate, ctx) },
    ...(d.due_amount > 0 ? [{ label: 'Dues reminder', message: renderTemplate(settings.duesTemplate, ctx) }] : []),
    { label: 'Welcome / confirmation', message: renderTemplate(settings.welcomeTemplate, ctx) },
  ]
  return (
    <Modal title={`Message ${d.customer_name}`} onClose={props.onClose}>
      {options.map((o) => (
        <div className="row" key={o.label}>
          <div className="grow">
            <div className="name">{o.label}</div>
            <div className="meta">{o.message}</div>
          </div>
          <a className="btn wa small" href={waLink(d.phone!, o.message)} target="_blank" rel="noreferrer" data-testid="whatsapp-link">
            Send
          </a>
        </div>
      ))}
      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="custom-msg">Custom message</label>
        <textarea id="custom-msg" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Type your own message…" />
      </div>
      <div className="btn-row">
        {custom.trim() ? (
          <a className="btn wa" href={waLink(d.phone!, custom.trim())} target="_blank" rel="noreferrer">
            Send custom message
          </a>
        ) : (
          <button className="btn wa" disabled>
            Send custom message
          </button>
        )}
        <button className="btn" onClick={props.onClose}>
          Close
        </button>
      </div>
    </Modal>
  )
}

function SubscriptionCard(props: {
  detail: SubscriptionDetail
  presentCount: number
  skips: { id: string; skip_date: string }[]
  payments: { id: string; amount: number; paid_on: string; mode: string }[]
  onAddPayment: () => void
  onAddSkip: () => void
  onMessage: () => void
  onRenew: () => void
  onCancel: () => void
  onRemoveSkip: (skipId: string) => void
}) {
  const d = props.detail
  return (
    <div className="card" data-testid="current-subscription">
      <div className="row">
        <div className="grow">
          <div className="name">
            {MEAL_LABEL[d.meal_type]} · {inr(d.price)}
          </div>
          <div className="meta">
            {formatDMY(d.start_date)} → <strong data-testid="effective-end">{formatDMY(d.effective_end_date)}</strong>
            {d.skip_count > 0 ? ` (+${d.skip_count} skip)` : ''}
          </div>
        </div>
        <StatusBadge status={d.status} />
      </div>
      <div className="row">
        <div className="grow">
          <div className="meta">
            Paid {inr(d.paid_total)} of {inr(d.price)}
            {d.due_amount > 0 ? ' · ' : ''}
            {d.due_amount > 0 && <strong style={{ color: 'var(--red)' }} data-testid="due-amount">{inr(d.due_amount)} due</strong>}
          </div>
          <div className="meta">Meals taken this period: {props.presentCount}</div>
        </div>
      </div>
      {props.skips.length > 0 && (
        <div className="row">
          <div className="grow meta">
            Skip days:{' '}
            {props.skips.map((k) => (
              <span key={k.id} style={{ marginRight: 8 }}>
                {formatDMY(k.skip_date)}{' '}
                <button className="btn small" onClick={() => props.onRemoveSkip(k.id)} title="Remove skip day">
                  ✕
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="btn-row" style={{ marginTop: 10 }}>
        <button className="btn primary" onClick={props.onAddPayment} data-testid="add-payment">
          + Payment
        </button>
        <button className="btn" onClick={props.onAddSkip} data-testid="add-skip">
          + Skip day
        </button>
        <button className="btn" onClick={props.onRenew}>
          Renew
        </button>
        {d.phone && (
          <button className="btn wa" onClick={props.onMessage} data-testid="open-messages">
            WhatsApp…
          </button>
        )}
        <button className="btn danger" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function PaymentModal(props: { detail: SubscriptionDetail; onClose: () => void; onSaved: () => void }) {
  const { adapter } = useApp()
  const [amount, setAmount] = useState(props.detail.due_amount > 0 ? String(props.detail.due_amount) : '')
  const [paidOn, setPaidOn] = useState(todayIST())
  const [mode, setMode] = useState<PaymentMode>('upi')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const amt = Number(amount)
    if (!amt || amt <= 0) {
      setError('Enter a valid amount')
      return
    }
    try {
      await adapter.addPayment(props.detail.id, { amount: amt, paid_on: paidOn, mode, note: note || null })
      props.onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  return (
    <Modal title={`Payment — ${props.detail.customer_name}`} onClose={props.onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="pay-amount">Amount (₹)</label>
          <input id="pay-amount" type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="payment-amount" />
        </div>
        <div className="field">
          <label htmlFor="pay-date">Date</label>
          <input id="pay-date" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pay-mode">Mode</label>
          <select id="pay-mode" value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>
            <option value="upi">UPI</option>
            <option value="cash">Cash</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="pay-note">Note (optional)</label>
          <input id="pay-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="btn-row">
          <button className="btn primary" type="submit" data-testid="save-payment">
            Save payment
          </button>
          <button className="btn" type="button" onClick={props.onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}

function SkipModal(props: { detail: SubscriptionDetail; onClose: () => void; onSaved: () => void }) {
  const { adapter } = useApp()
  const [date, setDate] = useState(todayIST())
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const newEnd = addDays(props.detail.effective_end_date, 1)

  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      await adapter.addSkipDay(props.detail.id, date, note || null)
      props.onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  return (
    <Modal title={`Skip day — ${props.detail.customer_name}`} onClose={props.onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="skip-date">Date to skip</label>
          <input id="skip-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="skip-date" />
        </div>
        <div className="field">
          <label htmlFor="skip-note">Reason (optional)</label>
          <input id="skip-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <p className="muted" data-testid="skip-preview">
          Subscription will extend till <strong>{formatDMY(newEnd)}</strong>.
        </p>
        {error && <p className="error-text">{error}</p>}
        <div className="btn-row">
          <button className="btn primary" type="submit" data-testid="save-skip">
            Add skip day
          </button>
          <button className="btn" type="button" onClick={props.onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}
