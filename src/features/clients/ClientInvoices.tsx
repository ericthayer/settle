import type { ReactNode } from 'react'
import { InvoiceStatusBadge } from '@/components/InvoiceStatusBadge'
import { FormSection } from '@/components/layout/FormSection'
import { Table, TableCell, TableHead } from '@/components/ui/table'
import { useClientInvoices } from '@/data/clients'
import { formatMoney, toCurrencyCode } from '@/lib/money'
import { clientTotals, formatTotals } from './client-totals'

/** Invoice history and lifetime billed/paid for one client. */
export function ClientInvoices({ clientId, fallbackCurrency }: { readonly clientId: string; readonly fallbackCurrency: string }): ReactNode {
  const invoices = useClientInvoices(clientId)

  if (invoices.isPending) return <p role="status" className="text-sm text-ink-muted">Loading invoices…</p>
  if (invoices.isError) return <p role="alert" className="text-sm text-danger">Couldn’t load invoices: {invoices.error.message}</p>

  const totals = clientTotals(invoices.data)

  return (
    <FormSection title="Invoices">
      <dl className="grid grid-cols-2 gap-4 @lg:max-w-md">
        <div>
          <dt className="text-xs uppercase tracking-wide text-ink-muted">Billed</dt>
          <dd className="tabular text-lg font-medium">{formatTotals(totals, 'billedMinor', fallbackCurrency)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-ink-muted">Paid</dt>
          <dd className="tabular text-lg font-medium">{formatTotals(totals, 'paidMinor', fallbackCurrency)}</dd>
        </div>
      </dl>
      {invoices.data.length === 0 ? (
        <p className="text-sm text-ink-muted">No invoices for this client yet.</p>
      ) : (
        <Table>
          <caption className="sr-only">Invoices for this client</caption>
          <thead>
            <tr>
              <TableHead>Number</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Due</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </tr>
          </thead>
          <tbody>
            {invoices.data.map((inv) => {
              const currency = toCurrencyCode(inv.currency ?? fallbackCurrency)
              return (
                <tr key={inv.id}>
                  <TableCell>
                    {/* Links to /invoices/:id once M2 adds the invoice view. */}
                    <span className="tabular font-medium">{inv.number ?? 'Draft'}</span>
                  </TableCell>
                  <TableCell>
                    <InvoiceStatusBadge status={inv.status} />
                  </TableCell>
                  <TableCell className="tabular text-ink-muted">{inv.due_date ?? '—'}</TableCell>
                  <TableCell className="tabular text-right">{formatMoney({ minor: inv.total_minor ?? 0, currency })}</TableCell>
                  <TableCell className="tabular text-right">{formatMoney({ minor: inv.balance_minor ?? 0, currency })}</TableCell>
                </tr>
              )
            })}
          </tbody>
        </Table>
      )}
    </FormSection>
  )
}
