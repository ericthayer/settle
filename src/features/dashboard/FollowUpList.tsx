import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableCell, TableHead } from '@/components/ui/table'
import { RecordPaymentDialog } from '@/features/payments/RecordPaymentDialog'
import { toMailto } from '@/features/invoices/email-draft'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/cn'
import { formatMoney, toCurrencyCode } from '@/lib/money'
import type { FollowUp, FollowUpReason } from './dashboard-model'
import { buildReminderDraft } from './reminder-email'

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function reasonText(reason: FollowUpReason): string {
  if (reason.kind === 'overdue') return `${plural(reason.daysOverdue, 'day')} overdue`
  if (reason.daysUntilDue === 0) return 'Due today'
  return `Due in ${plural(reason.daysUntilDue, 'day')}`
}

/** Overdue and soon-due invoices, each with "Record payment" and "Email again" one click away. */
export function FollowUpList({ items, today }: { readonly items: readonly FollowUp[]; readonly today: string }): ReactNode {
  return (
    <Table>
      <caption className="sr-only">Invoices that need follow-up</caption>
      <thead>
        <tr>
          <TableHead>Invoice</TableHead>
          <TableHead>Due</TableHead>
          <TableHead className="text-right">Balance</TableHead>
          <TableHead>
            <span className="sr-only">Actions</span>
          </TableHead>
        </tr>
      </thead>
      <tbody>
        {items.map(({ invoice, reason }) => {
          const id = invoice.id ?? ''
          const currency = toCurrencyCode(invoice.currency ?? 'USD')
          const balance = invoice.balance_minor ?? 0
          const draft = buildReminderDraft(invoice, reason)
          return (
            <tr key={id} className="hover:bg-paper">
              <TableCell>
                <Link to={`/invoices/${id}`} className="tabular font-medium underline-offset-4 hover:underline">
                  {invoice.number}
                </Link>
                <div className="text-ink-muted">{invoice.client_name}</div>
              </TableCell>
              <TableCell>
                <div className={cn('font-medium', reason.kind === 'overdue' ? 'text-danger' : 'text-ink')}>{reasonText(reason)}</div>
                <div className="tabular text-ink-muted">{formatDate(invoice.due_date)}</div>
              </TableCell>
              <TableCell className="tabular text-right">
                {formatMoney({ minor: balance, currency })}
                {(invoice.amount_paid_minor ?? 0) > 0 ? <div className="text-xs text-ink-muted">Partially paid</div> : null}
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-2">
                  <RecordPaymentDialog
                    invoiceId={id}
                    clientId={invoice.client_id ?? ''}
                    number={invoice.number ?? ''}
                    currency={currency}
                    balanceMinor={balance}
                    today={today}
                    size="sm"
                  />
                  <Button asChild variant="secondary" size="sm">
                    <a href={toMailto(draft)} aria-label={`Email ${invoice.client_name ?? 'client'} again about ${invoice.number ?? 'this invoice'}`}>
                      <Mail aria-hidden="true" />
                      Email again
                    </a>
                  </Button>
                </div>
              </TableCell>
            </tr>
          )
        })}
      </tbody>
    </Table>
  )
}
