// Starts a Stripe Checkout Session for the balance of a shared invoice.
//
// Called signed out from the shared invoice page (/i/<token>); the unguessable
// token is the only credential, same as reading the page. The amount always comes
// from the database (prepare_checkout), never from the request.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY  required. Stripe → Developers → API keys (sk_test_… while testing).
//   SITE_URL           optional. The app's URL; defaults to production. Deploy previews
//                      and localhost of the same site are also allowed as return URLs.
//
// Deployed with verify_jwt = false: callers are signed out and the project uses
// publishable keys, which the gateway check doesn't understand.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { checkoutSessionForm, returnOrigin, type CheckoutTarget } from '../_shared/stripe.ts'
import { serviceRoleKey } from '../_shared/supabase-keys.ts'

const DEFAULT_SITE_URL = 'https://settle-invoices.netlify.app'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function fail(status: number, error: string): Response {
  return json(status, { error })
}

function toTarget(row: unknown): CheckoutTarget | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null
  const r = row as Record<string, unknown>
  const balance = Number(r.balance_minor)
  if (typeof r.invoice_id !== 'string' || typeof r.currency !== 'string' || !Number.isInteger(balance) || balance <= 0) return null
  return {
    invoiceId: r.invoice_id,
    number: typeof r.number === 'string' ? r.number : '',
    currency: r.currency,
    balanceMinor: balance,
    clientEmail: typeof r.client_email === 'string' ? r.client_email : null,
    businessName: typeof r.business_name === 'string' ? r.business_name : '',
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return fail(405, 'Method not allowed')

  const body: unknown = await req.json().catch(() => null)
  const token = body && typeof body === 'object' ? (body as Record<string, unknown>).token : null
  if (typeof token !== 'string' || !UUID.test(token)) return fail(400, 'Invalid request.')

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
  if (!stripeKey) return fail(503, 'Card payments aren’t available for this invoice yet.')

  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await db.rpc('prepare_checkout', { p_token: token })
  if (error) {
    console.error('prepare_checkout', error.message)
    return fail(500, 'Couldn’t start the payment. Try again.')
  }
  const target = toTarget(data)
  if (!target) return fail(409, 'This invoice has nothing left to pay.')

  const origin = returnOrigin(req.headers.get('Origin'), Deno.env.get('SITE_URL') ?? DEFAULT_SITE_URL)
  const page = `${origin}/i/${token}`
  const form = checkoutSessionForm(target, { success: `${page}?checkout=success`, cancel: `${page}?checkout=cancelled` })

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  })
  const session: { url?: string; error?: { message?: string } } = await response.json().catch(() => ({}))
  if (!response.ok || !session.url) {
    console.error('stripe checkout', response.status, session.error?.message)
    return fail(502, 'The payment provider couldn’t start checkout. Try again.')
  }

  // Latest session link, for reference from the owner's side.
  const { error: saveError } = await db.from('invoices').update({ checkout_url: session.url }).eq('id', target.invoiceId)
  if (saveError) console.error('save checkout_url', saveError.message)

  return json(200, { url: session.url })
})
