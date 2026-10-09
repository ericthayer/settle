// Sends an issued invoice, or a payment reminder, through Resend.
//
// Called from the app with the owner's session. Every read and write goes through
// a client carrying that session, so RLS scopes it exactly like the browser; no
// secret Supabase key is used. The Resend key lives only in this function's secrets.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY  required. Resend → API Keys, "Sending access".
//   EMAIL_FROM      optional bare address on a domain verified in Resend, e.g. invoices@example.com.
//                   Defaults to onboarding@resend.dev, which Resend only delivers to your own
//                   Resend account address and its test inboxes.
//   APP_URL         optional. Base URL of the invoice links. Defaults to production.
//
// Deployed with verify_jwt = false: the project uses publishable keys and JWT signing
// keys, which the gateway check doesn't understand, so the session is verified below.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildInvoiceEmail, fromHeader, type InvoiceEmailKind } from '../_shared/invoice-email.ts'

const DEFAULT_FROM = 'onboarding@resend.dev'
const DEFAULT_APP_URL = 'https://settle-invoices.netlify.app'
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/

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

function publishableKey(): string {
  const keys = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')
  if (keys) {
    const parsed: unknown = JSON.parse(keys)
    if (parsed && typeof parsed === 'object' && 'default' in parsed && typeof parsed.default === 'string') return parsed.default
  }
  return Deno.env.get('SUPABASE_ANON_KEY') ?? ''
}

function snapshotString(snapshot: unknown, key: string): string | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null
  const value = (snapshot as Record<string, unknown>)[key]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

interface SendRequest {
  readonly invoiceId: string
  readonly kind: InvoiceEmailKind
  /** One per dialog submit, so a retried request never sends twice. */
  readonly requestId: string
}

function parseRequest(body: unknown): SendRequest | null {
  if (!body || typeof body !== 'object') return null
  const { invoiceId, kind, requestId } = body as Record<string, unknown>
  const uuid = /^[0-9a-f-]{36}$/i
  if (typeof invoiceId !== 'string' || !uuid.test(invoiceId)) return null
  if (kind !== 'invoice' && kind !== 'reminder') return null
  if (typeof requestId !== 'string' || !/^[\w-]{8,64}$/.test(requestId)) return null
  return { invoiceId, kind, requestId }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return fail(405, 'Method not allowed')

  const authorization = req.headers.get('Authorization') ?? ''
  const token = authorization.replace(/^Bearer\s+/i, '')
  if (!token) return fail(401, 'Sign in again to send email.')

  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', publishableKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: auth, error: authError } = await db.auth.getUser(token)
  if (authError || !auth.user) return fail(401, 'Sign in again to send email.')

  const request = parseRequest(await req.json().catch(() => null))
  if (!request) return fail(400, 'Invalid request.')

  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) return fail(503, 'Email isn’t set up yet: add RESEND_API_KEY to the send-invoice-email function secrets.')

  const { data: invoice, error: invoiceError } = await db.from('invoice_summary').select('*').eq('id', request.invoiceId).maybeSingle()
  if (invoiceError) return fail(500, invoiceError.message)
  if (!invoice) return fail(404, 'Invoice not found.')
  if (invoice.lifecycle !== 'issued') return fail(409, 'Only issued invoices can be emailed.')
  if (request.kind === 'reminder' && (invoice.balance_minor ?? 0) <= 0) return fail(409, 'This invoice is paid, so there’s nothing to remind about.')

  // The client's current address wins over the snapshot, so a corrected email is used.
  const { data: client } = await db.from('clients').select('email, cc_emails').eq('id', invoice.client_id).maybeSingle()
  const to = client?.email?.trim() || snapshotString(invoice.bill_to, 'email')
  if (!to || !EMAIL_RE.test(to)) return fail(422, 'Add an email address to this client first.')
  const cc = ((client?.cc_emails ?? []) as string[]).map((e) => e.trim()).filter((e) => EMAIL_RE.test(e) && e !== to)

  const { data: settings } = await db.from('business_settings').select('email').maybeSingle()
  const businessName = snapshotString(invoice.bill_from, 'business_name') ?? 'Settle'
  const replyTo = settings?.email?.trim() || snapshotString(invoice.bill_from, 'email')

  const { data: publicToken, error: tokenError } = await db.rpc('ensure_public_token', { p_invoice_id: invoice.id })
  if (tokenError || !publicToken) return fail(500, tokenError?.message ?? 'Couldn’t create the invoice link.')
  const appUrl = (Deno.env.get('APP_URL') ?? DEFAULT_APP_URL).replace(/\/+$/, '')

  const email = buildInvoiceEmail({
    kind: request.kind,
    number: invoice.number ?? '',
    businessName,
    contactName: snapshotString(invoice.bill_to, 'contact_name'),
    currency: invoice.currency ?? 'USD',
    balanceMinor: invoice.balance_minor ?? invoice.total_minor ?? 0,
    dueDate: invoice.due_date ?? '',
    daysOverdue: invoice.days_overdue ?? 0,
    paymentInstructions: invoice.payment_instructions,
    viewUrl: `${appUrl}/i/${publicToken}`,
  })

  const sent = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `${invoice.id}:${request.kind}:${request.requestId}`,
    },
    body: JSON.stringify({
      from: fromHeader(businessName, Deno.env.get('EMAIL_FROM')?.trim() || DEFAULT_FROM),
      to: [to],
      ...(cc.length > 0 ? { cc } : {}),
      ...(replyTo && EMAIL_RE.test(replyTo) ? { reply_to: replyTo } : {}),
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
  })
  const result: { id?: string; message?: string } = await sent.json().catch(() => ({}))
  if (!sent.ok) {
    console.error('resend', sent.status, result.message)
    return fail(502, `Email provider refused the message: ${result.message ?? sent.statusText}`)
  }

  const { data: logged, error: logError } = await db.rpc('log_invoice_email', {
    p_invoice_id: invoice.id,
    p_kind: request.kind,
    p_to: to,
    p_cc: cc,
    p_subject: email.subject,
    p_provider_message_id: result.id ?? null,
  })
  // The email is out; report success even if the log write failed.
  if (logError) console.error('log_invoice_email', logError.message)

  return json(200, { to, cc, sentAt: logged?.created_at ?? new Date().toISOString() })
})
