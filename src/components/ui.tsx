import type { ReactNode } from 'react'
import type { SubscriptionStatus } from '../data/types'

export function Badge(props: { color: 'green' | 'amber' | 'red' | 'blue' | 'gray'; children: ReactNode }) {
  return <span className={`badge ${props.color}`}>{props.children}</span>
}

const STATUS_BADGE: Record<SubscriptionStatus, { color: 'green' | 'amber' | 'red' | 'blue' | 'gray'; label: string }> = {
  active: { color: 'green', label: 'Active' },
  expiring: { color: 'amber', label: 'Expiring' },
  expired: { color: 'red', label: 'Expired' },
  upcoming: { color: 'blue', label: 'Upcoming' },
  cancelled: { color: 'gray', label: 'Cancelled' },
}

export function StatusBadge(props: { status: SubscriptionStatus }) {
  const s = STATUS_BADGE[props.status]
  return <Badge color={s.color}>{s.label}</Badge>
}

export function Modal(props: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-overlay" onClick={props.onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{props.title}</h3>
        {props.children}
      </div>
    </div>
  )
}

export function EmptyState(props: { children: ReactNode }) {
  return <div className="empty">{props.children}</div>
}

export function Spinner() {
  return <div className="spinner">Loading…</div>
}
