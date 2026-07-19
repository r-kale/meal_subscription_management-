import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LocationPicker } from '../components/LocationPicker'
import { EmptyState } from '../components/ui'
import { WhatsAppButton } from '../components/WhatsAppButton'
import type { SubscriptionDetail } from '../data/types'
import { formatDMY, todayIST } from '../lib/dates'
import { MEAL_LABEL, isActiveOn, servesMeal } from '../lib/domain'
import { inr } from '../lib/money'
import { useApp } from '../state/AppContext'

export function Dashboard() {
  const { adapter, settings, locationFilter, setLocationFilter } = useApp()
  const navigate = useNavigate()
  const [all, setAll] = useState<SubscriptionDetail[]>([])
  const [expiring, setExpiring] = useState<SubscriptionDetail[]>([])
  const [recentlyExpired, setRecentlyExpired] = useState<SubscriptionDetail[]>([])
  const [dues, setDues] = useState<SubscriptionDetail[]>([])

  useEffect(() => {
    const filter = locationFilter ? { locationId: locationFilter } : {}
    adapter.listSubscriptionDetails(filter).then(setAll)
    adapter.listSubscriptionDetails({ ...filter, expiringWithinDays: settings.expiryWindowDays }).then(setExpiring)
    adapter.listSubscriptionDetails({ ...filter, recentlyExpiredDays: 7 }).then(setRecentlyExpired)
    adapter.listSubscriptionDetails({ ...filter, hasDues: true }).then(setDues)
  }, [adapter, locationFilter, settings.expiryWindowDays])

  const today = todayIST()
  const activeToday = all.filter((d) => isActiveOn(d, d.effective_end_date, today))
  const lunchCount = activeToday.filter((d) => servesMeal(d.meal_type, 'lunch')).length
  const dinnerCount = activeToday.filter((d) => servesMeal(d.meal_type, 'dinner')).length

  return (
    <div className="page">
      <h2>Today · {formatDMY(today)}</h2>
      <LocationPicker value={locationFilter} onChange={setLocationFilter} />

      <div className="stat-grid" data-testid="today-stats">
        <div className="stat">
          <div className="num" data-testid="lunch-count">{lunchCount}</div>
          <div className="label">Lunch today</div>
        </div>
        <div className="stat">
          <div className="num" data-testid="dinner-count">{dinnerCount}</div>
          <div className="label">Dinner today</div>
        </div>
      </div>

      <Panel
        title={`Expiring in ${settings.expiryWindowDays} days`}
        items={expiring}
        testid="expiring-panel"
        empty="No subscriptions expiring soon."
        render={(d) => (
          <Row key={d.id} d={d} onOpen={() => navigate(`/customers/${d.customer_id}`)}>
            <WhatsAppButton detail={d} kind="renewal" small />
            <button className="btn small" onClick={() => navigate(`/subscribe?customer=${d.customer_id}&renew=${d.id}`)}>
              Renew
            </button>
          </Row>
        )}
      />

      <Panel
        title="Recently expired (not renewed)"
        items={recentlyExpired}
        testid="expired-panel"
        empty="Nobody pending renewal."
        render={(d) => (
          <Row key={d.id} d={d} onOpen={() => navigate(`/customers/${d.customer_id}`)}>
            <WhatsAppButton detail={d} kind="renewal" small />
            <button className="btn small" onClick={() => navigate(`/subscribe?customer=${d.customer_id}&renew=${d.id}`)}>
              Renew
            </button>
          </Row>
        )}
      />

      <Panel
        title="Pending dues"
        items={dues}
        testid="dues-panel"
        empty="No dues pending. 🎉"
        render={(d) => (
          <Row key={d.id} d={d} onOpen={() => navigate(`/customers/${d.customer_id}`)} showDue>
            <WhatsAppButton detail={d} kind="dues" small />
          </Row>
        )}
      />
    </div>
  )
}

function Panel(props: {
  title: string
  items: SubscriptionDetail[]
  empty: string
  testid: string
  render: (d: SubscriptionDetail) => React.ReactNode
}) {
  return (
    <div className="card" data-testid={props.testid}>
      <h3>
        {props.title} {props.items.length > 0 && <span className="badge amber">{props.items.length}</span>}
      </h3>
      {props.items.length === 0 ? <EmptyState>{props.empty}</EmptyState> : props.items.map(props.render)}
    </div>
  )
}

function Row(props: {
  d: SubscriptionDetail
  onOpen: () => void
  showDue?: boolean
  children?: React.ReactNode
}) {
  const { d } = props
  return (
    <div className="row">
      <div className="grow tappable" onClick={props.onOpen}>
        <div className="name">{d.customer_name}</div>
        <div className="meta">
          {MEAL_LABEL[d.meal_type]} · till {formatDMY(d.effective_end_date)}
          {d.skip_count > 0 ? ` (+${d.skip_count} skip)` : ''}
          {props.showDue && d.due_amount > 0 ? ` · due ${inr(d.due_amount)}` : ''}
        </div>
      </div>
      {props.children}
    </div>
  )
}
