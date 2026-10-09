import type { Client } from '@/data/clients'
import type { InvoiceSummary, LineItem } from '@/data/invoices'
import type { BusinessSettings } from '@/data/settings'
import { buildEmailDraft, toMailto } from '@/features/invoices/email-draft'
import { toDocumentModel } from './document-model'

const settings = {
  business_name: 'Thayer Design',
  email: 'eric@example.com',
  phone: null,
  website: null,
  tax_id: null,
  address: { city: 'Portland' },
  default_currency: 'USD',
  default_payment_terms_days: 30,
  logo_path: 'owner/logo-new.png',
  timezone: 'UTC',
} as unknown as BusinessSettings

const client = { name: 'Acme Live', contact_name: 'Wile Coyote', email: 'ap@acme.test', payment_terms_days: 15, billing_address: {}, tax_id: null, phone: null, cc_emails: ['cfo@acme.test'] } as unknown as Client
const lines = [{ id: 'l1', description: 'Design', quantity: 1, unit_price_minor: 10000, amount_minor: 10000, taxable: true }] as LineItem[]

describe('toDocumentModel', () => {
  it('previews a draft from live client and settings with provisional dates', () => {
    const draft = { lifecycle: 'draft', status: 'draft', currency: 'USD', number: null, issue_date: null, due_date: null, total_minor: 10000 } as InvoiceSummary
    const model = toDocumentModel(draft, lines, settings, client, '2026-10-09')
    expect(model.to.name).toBe('Acme Live')
    expect(model.issueDate).toBe('2026-10-09')
    expect(model.dueDate).toBe('2026-10-24') // client Net 15
    expect(model.datesProvisional).toBe(true)
    expect(model.logoPath).toBe('owner/logo-new.png')
  })

  it('prints an issued invoice from its frozen snapshot, not live data', () => {
    const issued = {
      lifecycle: 'issued',
      status: 'sent',
      currency: 'USD',
      number: 'INV-0042',
      issue_date: '2026-10-01',
      due_date: '2026-10-31',
      total_minor: 10000,
      amount_paid_minor: 0,
      balance_minor: 10000,
      bill_to: { name: 'Acme (at issue)', contact_name: 'Wile Coyote', email: 'old@acme.test', address: { line1: '1 Desert Rd' } },
      bill_from: { business_name: 'Thayer Design', logo_path: 'owner/logo-old.png' },
    } as unknown as InvoiceSummary
    const model = toDocumentModel(issued, lines, settings, client, '2026-10-09')
    expect(model.to.name).toBe('Acme (at issue)')
    expect(model.to.address.line1).toBe('1 Desert Rd')
    expect(model.logoPath).toBe('owner/logo-old.png')
    expect(model.datesProvisional).toBe(false)

    const email = buildEmailDraft(model, ['cfo@acme.test'])
    expect(email.to).toBe('old@acme.test')
    expect(email.subject).toBe('Invoice INV-0042 from Thayer Design')
    expect(email.body).toContain('Hi Wile,')
    expect(email.body).toContain('$100.00, due Oct 31, 2026')
    const mailto = toMailto(email)
    expect(mailto.startsWith('mailto:old%40acme.test?cc=cfo%40acme.test&subject=Invoice%20INV-0042')).toBe(true)
    expect(mailto).not.toContain('+')
  })
})
