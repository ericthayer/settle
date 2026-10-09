import { buildInvoiceEmail, fromHeader, invoiceEmailSubject, type InvoiceEmailInput } from '../../../supabase/functions/_shared/invoice-email.ts'
import { emailHistoryText, nextEmailKind } from './email-history'

const base: InvoiceEmailInput = {
  kind: 'invoice',
  number: 'INV-0042',
  businessName: 'Thayer Design',
  contactName: 'Ada Lovelace',
  currency: 'USD',
  balanceMinor: 411_348,
  dueDate: '2026-11-08',
  daysOverdue: 0,
  paymentInstructions: 'ACH to 123',
  viewUrl: 'https://settle-invoices.netlify.app/i/00000000-0000-4000-8000-000000000000',
}

describe('buildInvoiceEmail', () => {
  it('writes the invoice email with amount, due date, link and payment instructions', () => {
    const email = buildInvoiceEmail(base)
    expect(email.subject).toBe('Invoice INV-0042 from Thayer Design')
    expect(email.text).toContain('Hi Ada,')
    expect(email.text).toContain('Here is invoice INV-0042 for $4,113.48, due Nov 8, 2026.')
    expect(email.text).toContain(`View and download the invoice: ${base.viewUrl}`)
    expect(email.text).toContain('How to pay:\nACH to 123')
    expect(email.html).toContain(`href="${base.viewUrl}"`)
  })

  it('words reminders by due state', () => {
    expect(invoiceEmailSubject({ ...base, kind: 'reminder' })).toBe('Reminder: invoice INV-0042 is due Nov 8, 2026')
    const overdue = buildInvoiceEmail({ ...base, kind: 'reminder', daysOverdue: 1 })
    expect(overdue.subject).toBe('Reminder: invoice INV-0042 is overdue')
    expect(overdue.text).toContain('is now 1 day overdue')
    expect(overdue.text).toContain('please disregard this note')
  })

  it('escapes client-controlled text in the HTML body', () => {
    const email = buildInvoiceEmail({ ...base, businessName: '<script>x</script>', paymentInstructions: 'a & "b"' })
    expect(email.html).not.toContain('<script>x')
    expect(email.html).toContain('&lt;script&gt;')
    expect(email.html).toContain('a &amp; &quot;b&quot;')
  })

  it('greets generically without a contact, and handles zero-decimal currencies', () => {
    const email = buildInvoiceEmail({ ...base, contactName: null, currency: 'JPY', balanceMinor: 5000 })
    expect(email.text.startsWith('Hello,')).toBe(true)
    expect(email.text).toContain('¥5,000')
  })
})

describe('fromHeader', () => {
  it('quotes the display name and strips header-breaking characters', () => {
    expect(fromHeader('Thayer "Design"\r\nBcc: x', 'a@b.co')).toBe('"Thayer DesignBcc: x" <a@b.co>')
    expect(fromHeader('', 'a@b.co')).toBe('a@b.co')
  })
})

describe('email history', () => {
  it('chooses a reminder only after the invoice was sent and while a balance remains', () => {
    expect(nextEmailKind({ sent_at: null, balance_minor: 100 })).toBe('invoice')
    expect(nextEmailKind({ sent_at: '2026-10-09T10:00:00Z', balance_minor: 100 })).toBe('reminder')
    expect(nextEmailKind({ sent_at: '2026-10-09T10:00:00Z', balance_minor: 0 })).toBe('invoice')
  })

  it('summarises sends and reminders', () => {
    expect(emailHistoryText([])).toBeNull()
    const sent = { kind: 'invoice' as const, to_email: 'ap@acme.com', created_at: '2026-10-09T10:00:00Z' }
    expect(emailHistoryText([sent])).toBe('Emailed to ap@acme.com on Oct 9, 2026.')
    const r1 = { kind: 'reminder' as const, to_email: 'ap@acme.com', created_at: '2026-10-20T10:00:00Z' }
    const r2 = { ...r1, created_at: '2026-10-27T10:00:00Z' }
    expect(emailHistoryText([sent, r1])).toBe('Emailed to ap@acme.com on Oct 9, 2026. Reminder sent Oct 20, 2026.')
    expect(emailHistoryText([sent, r1, r2])).toBe('Emailed to ap@acme.com on Oct 9, 2026. 2 reminders, last on Oct 27, 2026.')
  })
})
