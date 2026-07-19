import { renderTemplate, waLink } from '../lib/whatsapp'
import { useApp } from '../state/AppContext'
import type { SubscriptionDetail } from '../data/types'
import { MEAL_LABEL } from '../lib/domain'

/**
 * Opens WhatsApp with a prefilled renewal or dues message for the
 * subscription's customer. Hidden when the customer has no phone number.
 */
export function WhatsAppButton(props: { detail: SubscriptionDetail; kind: 'renewal' | 'dues'; small?: boolean }) {
  const { settings } = useApp()
  const { detail } = props
  if (!detail.phone) return null
  const template = props.kind === 'dues' ? settings.duesTemplate : settings.renewalTemplate
  const message = renderTemplate(template, {
    name: detail.customer_name,
    endDate: detail.effective_end_date,
    meal: MEAL_LABEL[detail.meal_type] ?? detail.meal_type,
    price: detail.price,
    due: detail.due_amount,
    upi: settings.upiId || '—',
  })
  return (
    <a
      className={`btn wa${props.small ? ' small' : ''}`}
      href={waLink(detail.phone, message)}
      target="_blank"
      rel="noreferrer"
      data-testid="whatsapp-link"
    >
      WhatsApp
    </a>
  )
}
