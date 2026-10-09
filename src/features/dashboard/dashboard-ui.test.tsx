import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import type { InvoiceSummary } from '@/data/invoices'
import { FollowUpList } from './FollowUpList'
import { KpiTile } from './KpiTile'

function wrap(ui: ReactNode): ReactNode {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('KpiTile', () => {
  it('shows the primary currency, stacks others, and links to the filtered list', () => {
    render(
      wrap(
        <KpiTile
          label="Overdue"
          amounts={[{ currency: 'USD', minor: 150000 }, { currency: 'EUR', minor: 2500 }]}
          primaryCurrency="USD"
          detail="2 invoices"
          tone="danger"
          href="/invoices?status=overdue"
        />,
      ),
    )
    expect(screen.getByRole('link')).toHaveAttribute('href', '/invoices?status=overdue')
    expect(screen.getByText('$1,500.00')).toHaveClass('text-danger')
    expect(screen.getByText('+ €25.00')).toBeInTheDocument()
    expect(screen.getByText('2 invoices')).toBeInTheDocument()
  })

  it('shows zero in the primary currency when nothing is owed', () => {
    render(wrap(<KpiTile label="Outstanding" amounts={[]} primaryCurrency="USD" detail="0 invoices" />))
    expect(screen.getByText('$0.00')).not.toHaveClass('text-danger')
  })
})

describe('FollowUpList', () => {
  it('puts record payment and a reminder email on each row', async () => {
    const invoice = {
      id: 'i1',
      number: 'INV-0042',
      client_id: 'c1',
      client_name: 'Acme',
      lifecycle: 'issued',
      status: 'overdue',
      currency: 'USD',
      due_date: '2026-09-29',
      days_overdue: 10,
      balance_minor: 5000,
      amount_paid_minor: 0,
      bill_to: { email: 'ap@acme.test' },
      bill_from: { business_name: 'Thayer Design' },
    } as unknown as InvoiceSummary
    render(wrap(<FollowUpList items={[{ invoice, reason: { kind: 'overdue', daysOverdue: 10 } }]} today="2026-10-09" />))
    const row = screen.getByRole('link', { name: 'INV-0042' }).closest('tr')
    if (!row) throw new Error('row missing')
    expect(within(row).getByText('10 days overdue')).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: /record payment/i })).toBeInTheDocument()
    await userEvent.click(within(row).getByRole('button', { name: 'Email Acme again about INV-0042' }))
    const dialog = await screen.findByRole('dialog', { name: 'Email invoice INV-0042' })
    expect(await within(dialog).findByText('ap@acme.test')).toBeInTheDocument()
    expect(within(dialog).getByText('Invoice INV-0042 from Thayer Design')).toBeInTheDocument()
    const mailto = within(dialog).getByRole('link', { name: 'Use my mail app instead' })
    expect(mailto.getAttribute('href')).toMatch(/^mailto:ap%40acme\.test\?subject=Reminder%3A%20invoice%20INV-0042%20is%20overdue/)
  })
})
