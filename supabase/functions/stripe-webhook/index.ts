// Records card payments from Stripe Checkout.
//
// Stripe calls this for checkout.session.completed (card, settled at once) and
// checkout.session.async_payment_succeeded (bank debits, settled later). Each
// payment is recorded once per PaymentIntent by record_stripe_payment, so Stripe's
// retries and replays never create a second payment.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   STRIPE_WEBHOOK_SECRET  required. The endpoint's signing secret (whsec_…) from
//                          Stripe → Developers → Webhooks.
//
// Deployed with verify_jwt = false: Stripe has no Supabase session; the Stripe
// signature is the credential.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { completedCheckout, verifyStripeSignature } from '../_shared/stripe.ts'
import { serviceRoleKey } from '../_shared/supabase-keys.ts'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  if (!secret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set')
    return json(503, { error: 'Webhook not configured' })
  }

  // Signatures cover the exact bytes Stripe sent, so read the raw body before parsing.
  const payload = await req.text()
  const valid = await verifyStripeSignature(payload, req.headers.get('Stripe-Signature'), secret, Math.floor(Date.now() / 1000))
  if (!valid) return json(400, { error: 'Invalid signature' })

  let event: unknown
  try {
    event = JSON.parse(payload)
  } catch {
    return json(400, { error: 'Invalid payload' })
  }

  const payment = completedCheckout(event)
  if (!payment) return json(200, { received: true, recorded: false })

  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await db.rpc('record_stripe_payment', {
    p_invoice_id: payment.invoiceId,
    p_amount_minor: payment.amountMinor,
    p_currency: payment.currency,
    p_provider_ref: payment.providerRef,
    p_payload: payment.payload,
  })
  if (error) {
    // 500 makes Stripe retry; the failure also shows on the endpoint in the Stripe dashboard.
    console.error('record_stripe_payment', payment.providerRef, error.message)
    return json(500, { error: 'Could not record payment' })
  }
  return json(200, { received: true, recorded: true, ...(data && typeof data === 'object' ? data : {}) })
})
