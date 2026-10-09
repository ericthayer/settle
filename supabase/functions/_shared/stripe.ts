// Stripe Checkout helpers. Pure and dependency-free (Web Crypto + fetch types only)
// so the Edge Functions (Deno) use them and Vitest unit-tests them.

export interface CheckoutTarget {
  readonly invoiceId: string
  readonly number: string
  readonly currency: string
  readonly balanceMinor: number
  readonly clientEmail: string | null
  readonly businessName: string
}

export interface CompletedCheckout {
  readonly invoiceId: string
  readonly amountMinor: number
  readonly currency: string
  /** PaymentIntent id: the idempotency key for recording the payment. */
  readonly providerRef: string
  /** Trimmed event data kept on the payment for audit. */
  readonly payload: Record<string, string | number | boolean | null>
}

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/

/** Form body for POST /v1/checkout/sessions: one line for the invoice's current balance. */
export function checkoutSessionForm(target: CheckoutTarget, returnUrl: { success: string; cancel: string }): URLSearchParams {
  const form = new URLSearchParams()
  const name = `Invoice ${target.number}`
  const description = target.businessName ? `Balance due to ${target.businessName}` : 'Balance due'
  form.set('mode', 'payment')
  form.set('success_url', returnUrl.success)
  form.set('cancel_url', returnUrl.cancel)
  form.set('client_reference_id', target.invoiceId)
  form.set('line_items[0][quantity]', '1')
  form.set('line_items[0][price_data][currency]', target.currency.toLowerCase())
  form.set('line_items[0][price_data][unit_amount]', String(target.balanceMinor))
  form.set('line_items[0][price_data][product_data][name]', name)
  form.set('line_items[0][price_data][product_data][description]', description)
  form.set('metadata[invoice_id]', target.invoiceId)
  form.set('metadata[invoice_number]', target.number)
  form.set('payment_intent_data[description]', `${name} (${description})`)
  form.set('payment_intent_data[metadata][invoice_id]', target.invoiceId)
  form.set('payment_intent_data[metadata][invoice_number]', target.number)
  if (target.clientEmail && EMAIL_RE.test(target.clientEmail)) form.set('customer_email', target.clientEmail)
  return form
}

/**
 * Where Stripe sends the payer back: the calling app's origin when it is this site,
 * one of its Netlify deploy previews, or localhost; otherwise the site itself.
 * Never an arbitrary origin, so the function can't be used as an open redirect.
 */
export function returnOrigin(requestOrigin: string | null, siteUrl: string): string {
  const site = new URL(siteUrl)
  if (!requestOrigin) return site.origin
  let origin: URL
  try {
    origin = new URL(requestOrigin)
  } catch {
    return site.origin
  }
  if (origin.origin === site.origin) return origin.origin
  if (origin.protocol === 'https:' && origin.port === '' && /^deploy-preview-\d+--/.test(origin.hostname) && origin.hostname.endsWith(`--${site.hostname}`)) {
    return origin.origin
  }
  if (origin.protocol === 'http:' && (origin.hostname === 'localhost' || origin.hostname === '127.0.0.1')) return origin.origin
  return site.origin
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** HMAC-SHA256 hex of `${timestamp}.${payload}`, as Stripe signs webhooks. */
export async function stripeSignature(payload: string, timestamp: number, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${payload}`)))
}

/**
 * Checks the Stripe-Signature header (t=…,v1=…) against the raw body.
 * Rejects signatures older or newer than `toleranceSeconds` to stop replays of captured requests.
 */
export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  nowSeconds: number,
  toleranceSeconds = 300,
): Promise<boolean> {
  if (!header || !secret) return false
  let timestamp = Number.NaN
  const signatures: string[] = []
  for (const part of header.split(',')) {
    const [key, value] = part.split('=', 2)
    if (key?.trim() === 't' && value) timestamp = Number(value)
    if (key?.trim() === 'v1' && value) signatures.push(value.trim())
  }
  if (!Number.isInteger(timestamp) || signatures.length === 0) return false
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false
  const expected = await stripeSignature(payload, timestamp, secret)
  return signatures.some((s) => timingSafeEqual(s, expected))
}

const PAID_EVENTS = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded'])

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function str(o: Record<string, unknown> | null, key: string): string | null {
  const v = o?.[key]
  return typeof v === 'string' && v !== '' ? v : null
}

/**
 * The payment a webhook event carries, or null when there is nothing to record:
 * other event types, sessions still awaiting an async payment (ACH), or sessions
 * that didn't come from Settle.
 */
export function completedCheckout(event: unknown): CompletedCheckout | null {
  const e = record(event)
  const type = str(e, 'type')
  if (!type || !PAID_EVENTS.has(type)) return null
  const session = record(record(e?.data)?.object)
  if (!session || str(session, 'mode') !== 'payment' || str(session, 'payment_status') !== 'paid') return null

  const invoiceId = str(record(session.metadata), 'invoice_id') ?? str(session, 'client_reference_id')
  const intent = session.payment_intent
  const providerRef = typeof intent === 'string' ? intent : str(record(intent), 'id')
  const amount = session.amount_total
  const currency = str(session, 'currency')
  if (!invoiceId || !providerRef || typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0 || !currency) return null

  return {
    invoiceId,
    amountMinor: amount,
    currency: currency.toUpperCase(),
    providerRef,
    payload: {
      event_id: str(e, 'id'),
      event_type: type,
      session_id: str(session, 'id'),
      payment_intent: providerRef,
      amount_total: amount,
      currency,
      customer_email: str(record(session.customer_details), 'email') ?? str(session, 'customer_email'),
      livemode: session.livemode === true,
    },
  }
}
