import type { InvoiceEmail, InvoiceEmailKind } from '@/data/invoice-emails'
import type { InvoiceSummary } from '@/data/invoices'
import { formatDate } from '@/lib/dates'

/** Reminder once the invoice has been emailed and still has a balance; otherwise (re)send the invoice. */
export function nextEmailKind(invoice: Pick<InvoiceSummary, 'sent_at' | 'balance_minor'>): InvoiceEmailKind {
  return invoice.sent_at && (invoice.balance_minor ?? 0) > 0 ? 'reminder' : 'invoice'
}

/** One sentence for the invoice toolbar: "Emailed to ap@acme.com on Oct 9, 2026. 2 reminders (1 automatic), last on Oct 20, 2026." */
export function emailHistoryText(
  emails: readonly (Pick<InvoiceEmail, 'kind' | 'to_email' | 'created_at'> & Partial<Pick<InvoiceEmail, 'reminder_step'>>)[],
): string | null {
  const invoices = emails.filter((e) => e.kind === 'invoice')
  const reminders = emails.filter((e) => e.kind === 'reminder')
  const first = invoices[0]
  const day = (iso: string): string => formatDate(iso.slice(0, 10))
  const parts: string[] = []
  if (first) parts.push(`Emailed to ${first.to_email} on ${day(first.created_at)}.`)
  const last = reminders.at(-1)
  if (last) {
    const automatic = reminders.filter((e) => e.reminder_step != null).length
    if (reminders.length === 1) parts.push(`${automatic ? 'Automatic reminder' : 'Reminder'} sent ${day(last.created_at)}.`)
    else if (automatic === reminders.length) parts.push(`${reminders.length} automatic reminders, last on ${day(last.created_at)}.`)
    else parts.push(`${reminders.length} reminders${automatic ? ` (${automatic} automatic)` : ''}, last on ${day(last.created_at)}.`)
  }
  return parts.length > 0 ? parts.join(' ') : null
}
