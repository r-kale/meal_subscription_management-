import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LocationPicker } from '../components/LocationPicker'
import { EmptyState, StatusBadge } from '../components/ui'
import type { Customer, SubscriptionDetail } from '../data/types'
import { inr } from '../lib/money'
import { useApp } from '../state/AppContext'

export function Customers() {
  const { adapter, locationFilter, setLocationFilter, locations } = useApp()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [details, setDetails] = useState<SubscriptionDetail[]>([])

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    adapter.searchCustomers(debounced, locationFilter || undefined).then(setCustomers)
  }, [adapter, debounced, locationFilter])

  useEffect(() => {
    adapter.listSubscriptionDetails({}).then(setDetails)
  }, [adapter])

  // Latest (by start date) subscription per customer for the status/due badges.
  const latestByCustomer = useMemo(() => {
    const map = new Map<string, SubscriptionDetail>()
    for (const d of details) {
      const prev = map.get(d.customer_id)
      if (!prev || d.start_date > prev.start_date) map.set(d.customer_id, d)
    }
    return map
  }, [details])

  const locationName = (id: string) => locations.find((l) => l.id === id)?.name

  return (
    <div className="page">
      <h2>Customers</h2>
      <input
        className="search-input"
        placeholder="Search name or phone…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        data-testid="customer-search"
      />
      <LocationPicker value={locationFilter} onChange={setLocationFilter} />
      <div className="card">
        {customers.length === 0 && <EmptyState>No customers found. Tap + to add one.</EmptyState>}
        {customers.map((c) => {
          const latest = latestByCustomer.get(c.id)
          return (
            <div key={c.id} className="row tappable" onClick={() => navigate(`/customers/${c.id}`)} data-testid="customer-row">
              <div className="grow">
                <div className="name">{c.name}</div>
                <div className="meta">
                  {c.phone ?? 'no phone'}
                  {locations.length > 1 && locationName(c.location_id) ? ` · ${locationName(c.location_id)}` : ''}
                </div>
              </div>
              {latest && latest.due_amount > 0 && !latest.is_cancelled && (
                <span className="badge red">{inr(latest.due_amount)} due</span>
              )}
              {latest ? <StatusBadge status={latest.status} /> : <span className="badge gray">No plan</span>}
            </div>
          )
        })}
      </div>
      <button className="fab" onClick={() => navigate('/subscribe')} aria-label="New customer" data-testid="fab-new">
        +
      </button>
    </div>
  )
}
