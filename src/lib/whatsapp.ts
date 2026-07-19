import { formatDMY, type ISODate } from './dates'
import { inr } from './money'

export interface TemplateContext {
  name: string
  endDate: ISODate
  meal: string
  price: number
  due: number
  upi: string
}

export const DEFAULT_RENEWAL_TEMPLATE =
  'Namaste {name} ji! Aapka {meal} tiffin {end_date} ko khatam ho raha hai. ' +
  'Renew karne ke liye {price} bhejein — UPI: {upi}. Dhanyavaad!'

export const DEFAULT_DUES_TEMPLATE =
  'Namaste {name} ji! Aapke tiffin ke {due} baaki hain. UPI: {upi}. Dhanyavaad!'

export function renderTemplate(template: string, ctx: TemplateContext): string {
  return template
    .replaceAll('{name}', ctx.name)
    .replaceAll('{end_date}', formatDMY(ctx.endDate))
    .replaceAll('{meal}', ctx.meal)
    .replaceAll('{price}', inr(ctx.price))
    .replaceAll('{due}', inr(ctx.due))
    .replaceAll('{upi}', ctx.upi)
}

/** Build a wa.me deep link for an Indian 10-digit number with a prefilled message. */
export function waLink(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, '')
  const full = digits.length === 10 ? `91${digits}` : digits
  return `https://wa.me/${full}?text=${encodeURIComponent(message)}`
}
