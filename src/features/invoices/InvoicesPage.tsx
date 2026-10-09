import { useDeferredValue, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Plus, Search } from 'lucide-react'
import { InvoiceStatusBadge } from '@/components/InvoiceStatusBadge'
import { EmptyState } from '@/components/layout/EmptyState'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Table, TableCell, TableHead } from '@/components/ui/table'
import { useClients } from '@/data/clients'
import { STATUS_FILTERS, useInvoiceList, type StatusFilter } from '@/data/invoices'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/dates'
import { formatMoney, toCurrencyCode } from '@/lib/money'

const CHIPS: { readonly value: StatusFilter; readonly label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'outstanding', label: 'Outstanding' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'paid', label: 'Paid' },
  { value: 'void', label: 'Void' },
]

function isStatusFilter(value: string | null): value is StatusFilter {
  return value !== null && value in STATUS_FILTERS
}

/** Filters live in the URL so a filtered list can be bookmarked or shared with yourself. */
export function InvoicesPage(): ReactNode {
  const [params, setParams] = useSearchParams()
  const statusParam = params.get('status')
  const status: StatusFilter = isStatusFilter(statusParam) ? statusParam : 'all'
  const clientId = params.get('client')
  const search = useDeferredValue(params.get('q') ?? '')
  const invoices = useInvoiceList({ status, clientId, search })
  const clients = useClients(true)

  function update(key: string, value: string | null): void {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value && value !== 'all') next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )
  }

  const filtered = status !== 'all' || Boolean(clientId) || search !== ''

  return (
    <>
      <PageHeader
        title="Invoices"
        actions={
          <Button asChild>
            <Link to="/invoices/new">
              <Plus aria-hidden="true" />
              New invoice
            </Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-4">
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
          {CHIPS.map((chip) => (
            <button
              key={chip.value}
              type="button"
              aria-pressed={status === chip.value}
              onClick={() => update('status', chip.value)}
              className={cn(
                'h-8 rounded-md border border-line px-3 text-sm shadow-xs transition-colors',
                status === chip.value ? 'bg-muted font-medium text-ink' : 'bg-surface text-ink-muted hover:bg-muted hover:text-ink',
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="relative w-full max-w-xs">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
            <Input
              type="search"
              aria-label="Search by invoice number"
              placeholder="Search by number"
              className="pl-9"
              value={params.get('q') ?? ''}
              onChange={(e) => update('q', e.target.value)}
            />
          </div>
          <div className="w-full max-w-xs">
            <NativeSelect aria-label="Filter by client" value={clientId ?? ''} onChange={(e) => update('client', e.target.value || null)}>
              <option value="">All clients</option>
              {(clients.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.archived_at ? ' (archived)' : ''}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
      </div>

      {invoices.isPending ? (
        <p role="status" className="text-sm text-ink-muted">
          Loading…
        </p>
      ) : invoices.isError ? (
        <p role="alert" className="text-sm text-danger">
          Couldn’t load invoices: {invoices.error.message}
        </p>
      ) : invoices.data.length === 0 ? (
        filtered ? (
          <p className="text-sm text-ink-muted">No invoices match these filters.</p>
        ) : (
          <EmptyState title="No invoices yet">Pick a client, add line items, and issue. Drafts save as you type.</EmptyState>
        )
      ) : (
        <Table>
          <caption className="sr-only">Invoices</caption>
          <thead>
            <tr>
              <TableHead>Number</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Issued</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </tr>
          </thead>
          <tbody>
            {invoices.data.map((inv) => {
              const currency = toCurrencyCode(inv.currency ?? 'USD')
              const href = inv.lifecycle === 'draft' ? `/invoices/${inv.id}/edit` : `/invoices/${inv.id}`
              return (
                <tr key={inv.id} className="hover:bg-muted/50">
                  <TableCell>
                    <Link to={href} className="tabular font-medium underline-offset-4 hover:underline">
                      {inv.number ?? 'Draft'}
                    </Link>
                  </TableCell>
                  <TableCell>{inv.client_name}</TableCell>
                  <TableCell className="tabular text-ink-muted">{formatDate(inv.issue_date)}</TableCell>
                  <TableCell className="tabular text-ink-muted">{formatDate(inv.due_date)}</TableCell>
                  <TableCell>
                    <InvoiceStatusBadge status={inv.status} amountPaidMinor={inv.amount_paid_minor} />
                  </TableCell>
                  <TableCell className="tabular text-right">{formatMoney({ minor: inv.total_minor ?? 0, currency })}</TableCell>
                  <TableCell className="tabular text-right">
                    {inv.lifecycle === 'issued' ? formatMoney({ minor: inv.balance_minor ?? 0, currency }) : '—'}
                  </TableCell>
                </tr>
              )
            })}
          </tbody>
        </Table>
      )}
    </>
  )
}
