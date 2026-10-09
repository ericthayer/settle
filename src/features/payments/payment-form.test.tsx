import { render, screen } from '@testing-library/react'
import { InvoiceStatusBadge } from '@/components/InvoiceStatusBadge'
import { toCurrencyCode } from '@/lib/money'
import { paymentSchema } from './payment-form'

const usd = toCurrencyCode('USD')
const valid = { amount: '100', paid_on: '2026-10-09', method: 'check' as const, reference: '', note: '' }

describe('payment form', () => {
  const schema = paymentSchema(usd, 29_356, '$293.56')

  it('accepts a partial or full payment', () => {
    expect(schema.safeParse(valid).success).toBe(true)
    expect(schema.safeParse({ ...valid, amount: '293.56' }).success).toBe(true)
  })

  it('rejects overpayment, zero and bad dates', () => {
    expect(schema.safeParse({ ...valid, amount: '293.57' }).error?.issues[0]?.message).toBe('That’s more than the $293.56 still owed.')
    expect(schema.safeParse({ ...valid, amount: '0' }).success).toBe(false)
    expect(schema.safeParse({ ...valid, paid_on: '2026-02-30' }).success).toBe(false)
  })
})

describe('InvoiceStatusBadge', () => {
  it('keeps a partial payment visible on an overdue invoice', () => {
    render(<InvoiceStatusBadge status="overdue" amountPaidMinor={500} />)
    expect(screen.getByText('Overdue')).toBeInTheDocument()
    expect(screen.getByText('Partially paid')).toBeInTheDocument()
  })

  it('shows one tag otherwise', () => {
    render(<InvoiceStatusBadge status="paid" amountPaidMinor={29_356} />)
    expect(screen.queryByText('Partially paid')).toBeNull()
  })
})
