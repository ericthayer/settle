import type { Client, ClientInvoice } from '@/data/clients'
import { clientSchema, clientToForm, formToClient, splitEmails } from './client-form'
import { clientTotals } from './client-totals'
import { filterClients } from './filter-clients'

describe('client form', () => {
  it('maps blanks to null so business defaults apply', () => {
    const out = formToClient({ ...clientToForm(null), name: ' Acme ', cc_emails: 'a@x.com; b@x.com' })
    expect(out).toMatchObject({ name: 'Acme', email: null, payment_terms_days: null, currency: null, cc_emails: ['a@x.com', 'b@x.com'] })
  })

  it('validates name, cc list and terms', () => {
    const result = clientSchema.safeParse({ ...clientToForm(null), name: '', cc_emails: 'a@x.com, nope', payment_terms_days: '400' })
    expect(result.error?.issues.map((i) => i.path[0])).toEqual(expect.arrayContaining(['name', 'cc_emails', 'payment_terms_days']))
  })

  it('splits cc emails on commas, semicolons and spaces', () => {
    expect(splitEmails(' a@x.com,b@x.com  c@x.com ')).toEqual(['a@x.com', 'b@x.com', 'c@x.com'])
  })
})

describe('filterClients', () => {
  const clients = [
    { name: 'Acme', contact_name: 'Wile', email: 'w@acme.test' },
    { name: 'Globex', contact_name: null, email: null },
  ] as Client[]

  it('matches name, contact or email, ignoring case', () => {
    expect(filterClients(clients, 'wile').map((c) => c.name)).toEqual(['Acme'])
    expect(filterClients(clients, 'GLO').map((c) => c.name)).toEqual(['Globex'])
    expect(filterClients(clients, '  ')).toHaveLength(2)
  })
})

describe('clientTotals', () => {
  it('counts issued invoices only, per currency', () => {
    const invoices = [
      { lifecycle: 'issued', currency: 'USD', total_minor: 10_000, amount_paid_minor: 2_500 },
      { lifecycle: 'issued', currency: 'USD', total_minor: 5_000, amount_paid_minor: 5_000 },
      { lifecycle: 'draft', currency: 'USD', total_minor: 99_999, amount_paid_minor: 0 },
      { lifecycle: 'void', currency: 'USD', total_minor: 1_000, amount_paid_minor: 0 },
    ] as ClientInvoice[]
    expect(clientTotals(invoices)).toEqual([{ currency: 'USD', billedMinor: 15_000, paidMinor: 7_500 }])
  })
})
