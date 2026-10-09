import type { InvoiceSummary } from '@/data/invoices'
import type { EmailDraft } from '@/features/invoices/email-draft'
import type { Json } from '@/lib/database.types'
import { formatDate } from '@/lib/dates'
import { formatMoney, toCurrencyCode } from '@/lib/money'
import type { FollowUpReason } from './dashboard-model'

function snapshotField(snapshot: Json | null, key: string): string | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null
  const value = snapshot[key]
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/** Reminder for an issued invoice, addressed from its frozen bill_to/bill_from snapshots. */
export function buildReminderDraft(invoice: InvoiceSummary, reason: FollowUpReason): EmailDraft {
  const number = invoice.number ?? ''
  const amount = formatMoney({ minor: invoice.balance_minor ?? 0, currency: toCurrencyCode(invoice.currency ?? 'USD') })
  const contact = snapshotField(invoice.bill_to, 'contact_name')
  const fromName = snapshotField(invoice.bill_from, 'business_name') ?? ''
  const due = formatDate(invoice.due_date)
  const status =
    reason.kind === 'overdue'
      ? `A friendly reminder that invoice ${number} for ${amount} was due on ${due} and is now ${reason.daysOverdue} ${reason.daysOverdue === 1 ? 'day' : 'days'} overdue.`
      : `A friendly reminder that invoice ${number} for ${amount} is due on ${due}.`
  const body = [
    contact ? `Hi ${contact.split(' ')[0]},` : 'Hello,',
    '',
    status,
    'If you’ve already sent payment, thank you, and please disregard this note.',
    ...(invoice.payment_instructions ? ['', 'How to pay:', invoice.payment_instructions] : []),
    '',
    'Thank you,',
    fromName,
  ].join('\n')
  const subject = reason.kind === 'overdue' ? `Reminder: invoice ${number} is overdue` : `Reminder: invoice ${number} is due ${due}`
  return { to: snapshotField(invoice.bill_to, 'email') ?? '', cc: [], subject, body }
}
