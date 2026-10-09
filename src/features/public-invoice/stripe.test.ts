// @vitest-environment node
import {
  checkoutSessionForm,
  completedCheckout,
  returnOrigin,
  stripeSignature,
  verifyStripeSignature,
  type CheckoutTarget,
} from '../../../supabase/functions/_shared/stripe.ts'

const target: CheckoutTarget = {
  invoiceId: '11111111-1111-4111-8111-111111111111',
  number: 'INV-0007',
  currency: 'USD',
  balanceMinor: 311_348,
  clientEmail: 'ap@acme.com',
  businessName: 'Thayer Design',
}

describe('checkoutSessionForm', () => {
  it('charges the balance once, tagged with the invoice', () => {
    const form = checkoutSessionForm(target, { success: 'https://app/i/t?checkout=success', cancel: 'https://app/i/t?checkout=cancelled' })
    expect(Object.fromEntries(form)).toEqual({
      mode: 'payment',
      success_url: 'https://app/i/t?checkout=success',
      cancel_url: 'https://app/i/t?checkout=cancelled',
      client_reference_id: target.invoiceId,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': '311348',
      'line_items[0][price_data][product_data][name]': 'Invoice INV-0007',
      'line_items[0][price_data][product_data][description]': 'Balance due to Thayer Design',
      'metadata[invoice_id]': target.invoiceId,
      'metadata[invoice_number]': 'INV-0007',
      'payment_intent_data[description]': 'Invoice INV-0007 (Balance due to Thayer Design)',
      'payment_intent_data[metadata][invoice_id]': target.invoiceId,
      'payment_intent_data[metadata][invoice_number]': 'INV-0007',
      customer_email: 'ap@acme.com',
    })
  })

  it('leaves out an unusable client email', () => {
    expect(checkoutSessionForm({ ...target, clientEmail: 'not an email' }, { success: 's', cancel: 'c' }).has('customer_email')).toBe(false)
    expect(checkoutSessionForm({ ...target, clientEmail: null }, { success: 's', cancel: 'c' }).has('customer_email')).toBe(false)
  })
})

describe('returnOrigin', () => {
  const site = 'https://settle-invoices.netlify.app'

  it.each([
    ['https://settle-invoices.netlify.app', 'https://settle-invoices.netlify.app'],
    ['https://deploy-preview-12--settle-invoices.netlify.app', 'https://deploy-preview-12--settle-invoices.netlify.app'],
    ['http://localhost:5173', 'http://localhost:5173'],
    ['https://evil.example', site],
    ['https://deploy-preview-12--evil.netlify.app', site],
    ['https://deploy-preview-12--settle-invoices.netlify.app.evil.example', site],
    ['http://settle-invoices.netlify.app', site],
    ['not a url', site],
    [null, site],
  ])('%s → %s', (origin, expected) => {
    expect(returnOrigin(origin, site)).toBe(expected)
  })
})

describe('verifyStripeSignature', () => {
  const secret = 'whsec_test_secret'
  const body = '{"id":"evt_1","type":"checkout.session.completed"}'
  const now = 1_760_000_000

  it('accepts a fresh signature over the exact body', async () => {
    const sig = await stripeSignature(body, now, secret)
    expect(await verifyStripeSignature(body, `t=${now},v1=${sig}`, secret, now + 10)).toBe(true)
    // Stripe sends extra schemes and several v1 signatures during secret rotation.
    expect(await verifyStripeSignature(body, `t=${now},v1=${'0'.repeat(64)},v1=${sig},v0=abc`, secret, now)).toBe(true)
  })

  it('rejects a tampered body, a wrong secret, a stale timestamp, or a malformed header', async () => {
    const sig = await stripeSignature(body, now, secret)
    expect(await verifyStripeSignature(body.replace('evt_1', 'evt_2'), `t=${now},v1=${sig}`, secret, now)).toBe(false)
    expect(await verifyStripeSignature(body, `t=${now},v1=${sig}`, 'whsec_other', now)).toBe(false)
    expect(await verifyStripeSignature(body, `t=${now},v1=${sig}`, secret, now + 301)).toBe(false)
    expect(await verifyStripeSignature(body, `v1=${sig}`, secret, now)).toBe(false)
    expect(await verifyStripeSignature(body, `t=${now}`, secret, now)).toBe(false)
    expect(await verifyStripeSignature(body, null, secret, now)).toBe(false)
  })

  it('matches an HMAC computed independently with openssl', async () => {
    // Independently computed: echo -n "1700000000.{}" | openssl dgst -sha256 -hmac whsec_known
    expect(await stripeSignature('{}', 1_700_000_000, 'whsec_known')).toBe('56172812b342033a9e9ff107171d9094c9573602923ebd235441051bdf6e8129')
  })
})

function event(type: string, session: Record<string, unknown>): unknown {
  return { id: 'evt_1', type, livemode: false, data: { object: session } }
}

const paidSession = {
  id: 'cs_test_1',
  mode: 'payment',
  payment_status: 'paid',
  payment_intent: 'pi_123',
  amount_total: 311_348,
  currency: 'usd',
  client_reference_id: target.invoiceId,
  metadata: { invoice_id: target.invoiceId, invoice_number: 'INV-0007' },
  customer_details: { email: 'ap@acme.com' },
  livemode: false,
}

describe('completedCheckout', () => {
  it('reads the payment from a completed card checkout', () => {
    expect(completedCheckout(event('checkout.session.completed', paidSession))).toEqual({
      invoiceId: target.invoiceId,
      amountMinor: 311_348,
      currency: 'USD',
      providerRef: 'pi_123',
      payload: {
        event_id: 'evt_1',
        event_type: 'checkout.session.completed',
        session_id: 'cs_test_1',
        payment_intent: 'pi_123',
        amount_total: 311_348,
        currency: 'usd',
        customer_email: 'ap@acme.com',
        livemode: false,
      },
    })
  })

  it('records a bank debit when it settles, not when checkout completes', () => {
    expect(completedCheckout(event('checkout.session.completed', { ...paidSession, payment_status: 'unpaid' }))).toBeNull()
    expect(completedCheckout(event('checkout.session.async_payment_succeeded', paidSession))?.providerRef).toBe('pi_123')
  })

  it('accepts an expanded PaymentIntent and falls back to client_reference_id', () => {
    const result = completedCheckout(event('checkout.session.completed', { ...paidSession, payment_intent: { id: 'pi_456' }, metadata: {} }))
    expect(result?.providerRef).toBe('pi_456')
    expect(result?.invoiceId).toBe(target.invoiceId)
  })

  it('ignores other events and sessions Settle did not create', () => {
    expect(completedCheckout(event('checkout.session.expired', paidSession))).toBeNull()
    expect(completedCheckout(event('checkout.session.async_payment_failed', paidSession))).toBeNull()
    expect(completedCheckout(event('checkout.session.completed', { ...paidSession, mode: 'subscription' }))).toBeNull()
    expect(completedCheckout(event('checkout.session.completed', { ...paidSession, metadata: {}, client_reference_id: null }))).toBeNull()
    expect(completedCheckout(event('checkout.session.completed', { ...paidSession, payment_intent: null }))).toBeNull()
    expect(completedCheckout(event('checkout.session.completed', { ...paidSession, amount_total: 0 }))).toBeNull()
    expect(completedCheckout(null)).toBeNull()
    expect(completedCheckout({ type: 'checkout.session.completed' })).toBeNull()
  })
})
