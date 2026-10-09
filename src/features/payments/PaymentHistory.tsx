import type { ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { FormSection } from '@/components/layout/FormSection'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Table, TableCell, TableHead } from '@/components/ui/table'
import { paymentMethodLabel, useDeletePayment, usePayments } from '@/data/payments'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/dates'
import { friendlyDbError } from '@/lib/db-errors'
import { formatMoney, toCurrencyCode } from '@/lib/money'

/** Screen-only ledger under the invoice. Removed payments stay listed, struck through. */
export function PaymentHistory({ invoiceId, clientId, editable }: { readonly invoiceId: string; readonly clientId: string; readonly editable: boolean }): ReactNode {
  const payments = usePayments(invoiceId)
  const remove = useDeletePayment()

  if (payments.isPending) return <p role="status" className="text-sm text-ink-muted">Loading payments…</p>
  if (payments.isError) return <p role="alert" className="text-sm text-danger">Couldn’t load payments: {friendlyDbError(payments.error)}</p>
  if (payments.data.length === 0) return null

  async function onDelete(paymentId: string): Promise<void> {
    try {
      await remove.mutateAsync({ paymentId, invoiceId, clientId })
      toast.success('Payment removed')
    } catch (err) {
      toast.error(friendlyDbError(err))
    }
  }

  return (
    <FormSection title="Payments">
      <Table>
        <caption className="sr-only">Payments on this invoice</caption>
        <thead>
          <tr>
            <TableHead>Date</TableHead>
            <TableHead>Method</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          </tr>
        </thead>
        <tbody>
          {payments.data.map((p) => {
            const removed = p.deleted_at !== null
            const amount = formatMoney({ minor: p.amount_minor, currency: toCurrencyCode(p.currency) })
            return (
              <tr key={p.id} className={cn(removed && 'text-ink-muted')}>
                <TableCell className="tabular">{formatDate(p.paid_on)}</TableCell>
                <TableCell>
                  {paymentMethodLabel(p.method)}
                  {p.note ? <p className="text-xs text-ink-muted">{p.note}</p> : null}
                </TableCell>
                <TableCell>{p.reference ?? '—'}</TableCell>
                <TableCell className="tabular text-right">
                  {removed ? <s aria-label={`${amount}, removed`}>{amount}</s> : amount}
                </TableCell>
                <TableCell className="text-right">
                  {removed ? (
                    <Badge>Removed {formatDate(p.deleted_at?.slice(0, 10))}</Badge>
                  ) : editable ? (
                    <ConfirmDialog
                      title={`Remove the ${amount} payment?`}
                      description="The balance and status update right away. The payment stays in this history, marked as removed."
                      confirmLabel="Remove payment"
                      tone="danger"
                      onConfirm={() => void onDelete(p.id)}
                      trigger={
                        <Button variant="ghost" size="icon" aria-label={`Remove ${amount} payment from ${formatDate(p.paid_on)}`} disabled={remove.isPending}>
                          <Trash2 aria-hidden="true" />
                        </Button>
                      }
                    />
                  ) : null}
                </TableCell>
              </tr>
            )
          })}
        </tbody>
      </Table>
    </FormSection>
  )
}
