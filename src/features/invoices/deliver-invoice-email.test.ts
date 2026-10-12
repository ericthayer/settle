import { appUrl, deliverInvoiceEmail, resolveRecipients, type DeliveryRequest } from '../../../supabase/functions/_shared/deliver-invoice-email.ts'

const request: DeliveryRequest = {
  kind: 'reminder',
  invoice: {
    id: '90000000-0000-0000-0000-000000000001',
    number: 'INV-0042',
    currency: 'USD',
    balance_minor: 6_000,
    total_minor: 10_000,
    due_date: '2026-10-01',
    days_overdue: 7,
    payment_instructions: 'ACH to 123',
    bill_to: { name: 'Acme', email: 'old@acme.com', contact_name: 'Ada Lovelace' },
    bill_from: { business_name: 'Hogback Provisions', email: 'snapshot@hogback.com' },
  },
  client: { email: 'ap@acme.com', cc_emails: ['boss@acme.com', 'not-an-email', 'ap@acme.com'] },
  businessEmail: 'eric@hogback.com',
  viewUrl: 'https://settle-invoices.netlify.app/i/tok',
  resendKey: 're_test',
  fromAddress: 'invoices@contact.example.com',
  idempotencyKey: 'inv:reminder:1',
}

interface Sent {
  readonly url: string
  readonly headers: Record<string, string>
  readonly body: Record<string, unknown>
}

function resend(status: number, response: unknown): { fetchImpl: typeof fetch; sent: Sent[] } {
  const sent: Sent[] = []
  const fetchImpl = (async (url: string, init: RequestInit) => {
    sent.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) as Record<string, unknown> })
    return new Response(JSON.stringify(response), { status })
  }) as unknown as typeof fetch
  return { fetchImpl, sent }
}

describe('deliverInvoiceEmail', () => {
  it('sends to the client’s current address with valid CCs, reply-to and the idempotency key', async () => {
    const { fetchImpl, sent } = resend(200, { id: 'msg_1' })
    const result = await deliverInvoiceEmail(request, fetchImpl)

    expect(result).toEqual({ ok: true, to: 'ap@acme.com', cc: ['boss@acme.com'], subject: 'Reminder: invoice INV-0042 is overdue', providerMessageId: 'msg_1' })
    expect(sent).toHaveLength(1)
    expect(sent[0]?.url).toBe('https://api.resend.com/emails')
    expect(sent[0]?.headers).toMatchObject({ Authorization: 'Bearer re_test', 'Idempotency-Key': 'inv:reminder:1' })
    expect(sent[0]?.body).toMatchObject({
      from: '"Hogback Provisions" <invoices@contact.example.com>',
      to: ['ap@acme.com'],
      cc: ['boss@acme.com'],
      reply_to: 'eric@hogback.com',
      subject: 'Reminder: invoice INV-0042 is overdue',
    })
    expect(sent[0]?.body.text).toContain('$60.00 was due on Oct 1, 2026 and is now 7 days overdue')
    expect(sent[0]?.body.text).toContain('https://settle-invoices.netlify.app/i/tok')
    expect(sent[0]?.body.text).toContain('Hi Ada,')
    expect(sent[0]?.body.text).toContain('How to pay:\nACH to 123')
  })

  it('leaves out a reply-to that isn’t an email address', async () => {
    const { fetchImpl, sent } = resend(200, { id: 'msg_4' })
    await deliverInvoiceEmail({ ...request, businessEmail: 'call me' }, fetchImpl)

    expect(sent[0]?.body).not.toHaveProperty('reply_to')
  })

  it('falls back to the invoice snapshot for recipient and reply-to, and to Resend’s test sender', async () => {
    const { fetchImpl, sent } = resend(200, { id: 'msg_2' })
    const result = await deliverInvoiceEmail({ ...request, client: null, businessEmail: '  ', fromAddress: undefined }, fetchImpl)

    expect(result).toMatchObject({ ok: true, to: 'old@acme.com', cc: [] })
    expect(sent[0]?.body).toMatchObject({ to: ['old@acme.com'], reply_to: 'snapshot@hogback.com', from: '"Hogback Provisions" <onboarding@resend.dev>' })
    expect(sent[0]?.body).not.toHaveProperty('cc')
  })

  it('refuses without a usable address and sends nothing', async () => {
    const { fetchImpl, sent } = resend(200, { id: 'msg_3' })
    const result = await deliverInvoiceEmail(
      { ...request, client: { email: 'ap at acme', cc_emails: [] }, invoice: { ...request.invoice, bill_to: { name: 'Acme' } } },
      fetchImpl,
    )

    expect(result).toEqual({ ok: false, status: 422, error: 'Add an email address to this client first.' })
    expect(sent).toHaveLength(0)
  })

  it('reports the provider’s reason when Resend refuses', async () => {
    const { fetchImpl } = resend(403, { message: 'Domain not verified' })
    const result = await deliverInvoiceEmail(request, fetchImpl)

    expect(result).toEqual({ ok: false, status: 502, error: 'Email provider refused the message: Domain not verified' })
  })
})

describe('resolveRecipients', () => {
  it('lets a caller check the address before creating a share link', () => {
    expect(resolveRecipients({ email: ' ap@acme.com ', cc_emails: ['x@acme.com'] }, {})).toEqual({ to: 'ap@acme.com', cc: ['x@acme.com'] })
    expect(resolveRecipients(null, { email: 'old@acme.com' })).toEqual({ to: 'old@acme.com', cc: [] })
    expect(resolveRecipients({ email: 'ap at acme', cc_emails: [] }, { email: 'old@acme.com' })).toBeNull()
    expect(resolveRecipients({ email: null, cc_emails: [] }, null)).toBeNull()
  })
})

describe('appUrl', () => {
  it('uses APP_URL without trailing slashes, else production', () => {
    expect(appUrl('https://deploy-preview-13--settle-invoices.netlify.app//')).toBe('https://deploy-preview-13--settle-invoices.netlify.app')
    expect(appUrl(undefined)).toBe('https://settle-invoices.netlify.app')
  })
})
