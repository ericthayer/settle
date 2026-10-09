import type { InvoiceSummary } from '@/data/invoices'
import { computeKpis, followUps, monthStart, sumByCurrency } from './dashboard-model'
import { buildReminderDraft } from './reminder-email'

const TODAY = '2026-10-09'

function inv(overrides: Partial<InvoiceSummary>): InvoiceSummary {
  return {
    id: overrides.number ?? 'x',
    lifecycle: 'issued',
    status: 'sent',
    currency: 'USD',
    total_minor: 10000,
    amount_paid_minor: 0,
    balance_minor: 10000,
    days_overdue: 0,
    ...overrides,
  } as InvoiceSummary
}

const open = [
  inv({ number: 'INV-0001', status: 'overdue', due_date: '2026-09-29', days_overdue: 10, balance_minor: 5000, amount_paid_minor: 5000 }),
  inv({ number: 'INV-0002', status: 'overdue', due_date: '2026-09-01', days_overdue: 38 }),
  inv({ number: 'INV-0003', status: 'sent', due_date: '2026-10-12' }),
  inv({ number: 'INV-0004', status: 'sent', due_date: '2026-10-30' }),
  inv({ number: 'INV-0005', status: 'partially_paid', due_date: TODAY, balance_minor: 2500, amount_paid_minor: 7500 }),
  inv({ number: 'INV-0006', status: 'sent', due_date: '2026-10-20', currency: 'EUR', balance_minor: 30000 }),
  // Paid and void rows never belong in the outstanding set, even if passed in.
  inv({ number: 'INV-0007', status: 'paid', due_date: '2026-09-01', balance_minor: 0 }),
  inv({ number: 'INV-0008', lifecycle: 'void', status: 'void', due_date: '2026-09-01' }),
]

describe('computeKpis', () => {
  it('totals outstanding and overdue balances per currency, default currency first', () => {
    const kpis = computeKpis(open, [{ amount_minor: 7500, currency: 'USD' }, { amount_minor: 1000, currency: 'USD' }], 2, 'USD')
    expect(kpis.outstanding.count).toBe(6)
    expect(kpis.outstanding.amounts).toEqual([
      { currency: 'USD', minor: 5000 + 10000 + 10000 + 10000 + 2500 },
      { currency: 'EUR', minor: 30000 },
    ])
    expect(kpis.overdue).toEqual({ count: 2, amounts: [{ currency: 'USD', minor: 15000 }] })
    expect(kpis.receivedThisMonth).toEqual({ count: 2, amounts: [{ currency: 'USD', minor: 8500 }] })
    expect(kpis.drafts).toBe(2)
  })

  it('returns empty amounts when nothing is owed', () => {
    const kpis = computeKpis([], [], 0, 'USD')
    expect(kpis.outstanding).toEqual({ count: 0, amounts: [] })
  })
})

describe('sumByCurrency', () => {
  it('sorts the primary currency first, then alphabetically', () => {
    const rows = [{ c: 'GBP', m: 1 }, { c: 'CAD', m: 2 }, { c: 'USD', m: 3 }, { c: 'CAD', m: 4 }]
    expect(sumByCurrency(rows, (r) => r.c, (r) => r.m, 'USD').map((a) => `${a.currency}:${a.minor}`)).toEqual(['USD:3', 'CAD:6', 'GBP:1'])
  })
})

describe('followUps', () => {
  it('lists overdue by days overdue (most first), then invoices due within 7 days (soonest first)', () => {
    const list = followUps(open, TODAY)
    expect(list.map((f) => f.invoice.number)).toEqual(['INV-0002', 'INV-0001', 'INV-0005', 'INV-0003'])
    expect(list.map((f) => f.reason)).toEqual([
      { kind: 'overdue', daysOverdue: 38 },
      { kind: 'overdue', daysOverdue: 10 },
      { kind: 'due_soon', daysUntilDue: 0 },
      { kind: 'due_soon', daysUntilDue: 3 },
    ])
  })

  it('includes an invoice due exactly 7 days out and excludes day 8', () => {
    const list = followUps([inv({ number: 'A', due_date: '2026-10-16' }), inv({ number: 'B', due_date: '2026-10-17' })], TODAY)
    expect(list.map((f) => f.invoice.number)).toEqual(['A'])
  })
})

describe('monthStart', () => {
  it('is the first of the owner’s month', () => {
    expect(monthStart('2026-10-31')).toBe('2026-10-01')
  })
})

describe('buildReminderDraft', () => {
  const overdue = inv({
    number: 'INV-0042',
    status: 'overdue',
    due_date: '2026-09-29',
    days_overdue: 10,
    balance_minor: 5000,
    payment_instructions: 'ACH to 123',
    bill_to: { name: 'Acme', contact_name: 'Wile Coyote', email: 'ap@acme.test' },
    bill_from: { business_name: 'Thayer Design' },
  })

  it('addresses the snapshot contact and states days overdue and the balance', () => {
    const draft = buildReminderDraft(overdue, { kind: 'overdue', daysOverdue: 10 })
    expect(draft.to).toBe('ap@acme.test')
    expect(draft.subject).toBe('Reminder: invoice INV-0042 is overdue')
    expect(draft.body).toContain('Hi Wile,')
    expect(draft.body).toContain('invoice INV-0042 for $50.00 was due on Sep 29, 2026 and is now 10 days overdue.')
    expect(draft.body).toContain('How to pay:\nACH to 123')
    expect(draft.body.endsWith('Thank you,\nThayer Design')).toBe(true)
  })

  it('words a due-soon reminder without calling it overdue', () => {
    const draft = buildReminderDraft({ ...overdue, bill_to: null, due_date: '2026-10-12' }, { kind: 'due_soon', daysUntilDue: 3 })
    expect(draft.to).toBe('')
    expect(draft.body).toContain('Hello,')
    expect(draft.subject).toBe('Reminder: invoice INV-0042 is due Oct 12, 2026')
    expect(draft.body).not.toContain('overdue')
  })
})
