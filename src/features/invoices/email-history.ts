import type { InvoiceEmail, InvoiceEmailKind } from '@/data/invoice-emails'
import type { InvoiceSummary } from '@/data/invoices'
import { formatDate } from '@/lib/dates'

/** Reminder once the invoice has been emailed and still has a balance; otherwise (re)send the invoice. */
export function nextEmailKind(invoice: Pick<InvoiceSummary, 'sent_at' | 'balance_minor'>): InvoiceEmailKind {
  return invoice.sent_at && (invoice.balance_minor ?? 0) > 0 ? 'reminder' : 'invoice'
}

/** One sentence for the invoice toolbar: "Emailed to ap@acme.com on Oct 9, 2026. 2 reminders, last on Oct 20, 2026." */
export function emailHistoryText(emails: readonly Pick<InvoiceEmail, 'kind' | 'to_email' | 'created_at'>[]): string | null {
  const invoices = emails.filter((e) => e.kind === 'invoice')
  const reminders = emails.filter((e) => e.kind === 'reminder')
  const first = invoices[0]
  const day = (iso: string): string => formatDate(iso.slice(0, 10))
  const parts: string[] = []
  if (first) parts.push(`Emailed to ${first.to_email} on ${day(first.created_at)}.`)
  const last = reminders.at(-1)
  if (last) {
    parts.push(reminders.length === 1 ? `Reminder sent ${day(last.created_at)}.` : `${reminders.length} reminders, last on ${day(last.created_at)}.`)
  }
  return parts.length > 0 ? parts.join(' ') : null
}
