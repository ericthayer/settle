// Sends one invoice or reminder email through Resend. Shared by the app's
// send-invoice-email function and the daily send-due-reminders job; each loads
// the rows with its own Supabase client and records the send afterwards.
// Dependency-free, so the app's Vitest suite covers it.

import { buildInvoiceEmail, fromHeader, type InvoiceEmailKind } from './invoice-email.ts'

export const DEFAULT_FROM = 'onboarding@resend.dev'
export const DEFAULT_APP_URL = 'https://settle-invoices.netlify.app'

/** The invoice_summary columns an email needs. */
export interface EmailInvoice {
  readonly id: string
  readonly number: string | null
  readonly currency: string | null
  readonly balance_minor: number | null
  readonly total_minor: number | null
  readonly due_date: string | null
  readonly days_overdue: number | null
  readonly payment_instructions: string | null
  readonly bill_to: unknown
  readonly bill_from: unknown
}

export interface DeliveryRequest {
  readonly kind: InvoiceEmailKind
  readonly invoice: EmailInvoice
  /** The client's current contact details; null when the client row isn't readable. */
  readonly client: { readonly email: string | null; readonly cc_emails: readonly string[] | null } | null
  /** Business settings email, used as Reply-To. */
  readonly businessEmail: string | null
  readonly viewUrl: string
  readonly resendKey: string
  /** EMAIL_FROM secret; blank falls back to Resend's test sender. */
  readonly fromAddress: string | null | undefined
  /** Resend dedupes sends that share this key for 24 hours. */
  readonly idempotencyKey: string
}

export type Delivery =
  | { readonly ok: true; readonly to: string; readonly cc: readonly string[]; readonly subject: string; readonly providerMessageId: string | null }
  | { readonly ok: false; readonly status: number; readonly error: string }

export const NO_ADDRESS = 'Add an email address to this client first.'

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/

/** A non-blank string field of a jsonb snapshot (bill_to / bill_from). */
export function snapshotString(snapshot: unknown, key: string): string | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null
  const value = (snapshot as Record<string, unknown>)[key]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/** Base URL of invoice links: the APP_URL secret without trailing slashes, else production. */
export function appUrl(configured: string | undefined): string {
  return (configured ?? DEFAULT_APP_URL).replace(/\/+$/, '')
}

/**
 * To and CC for an invoice email, or null when there is no usable address. The
 * client's current address wins over the invoice snapshot, so a corrected email is used.
 */
export function resolveRecipients(client: DeliveryRequest['client'], billTo: unknown): { to: string; cc: string[] } | null {
  const to = client?.email?.trim() || snapshotString(billTo, 'email')
  if (!to || !EMAIL_RE.test(to)) return null
  const cc = (client?.cc_emails ?? []).map((e) => e.trim()).filter((e) => EMAIL_RE.test(e) && e !== to)
  return { to, cc }
}

export async function deliverInvoiceEmail(request: DeliveryRequest, fetchImpl: typeof fetch = fetch): Promise<Delivery> {
  const { invoice } = request

  const recipients = resolveRecipients(request.client, invoice.bill_to)
  if (!recipients) return { ok: false, status: 422, error: NO_ADDRESS }
  const { to, cc } = recipients

  const businessName = snapshotString(invoice.bill_from, 'business_name') ?? 'Settle'
  const replyTo = request.businessEmail?.trim() || snapshotString(invoice.bill_from, 'email')

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
    viewUrl: request.viewUrl,
  })

  const sent = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${request.resendKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': request.idempotencyKey,
    },
    body: JSON.stringify({
      from: fromHeader(businessName, request.fromAddress?.trim() || DEFAULT_FROM),
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
    return { ok: false, status: 502, error: `Email provider refused the message: ${result.message ?? sent.statusText}` }
  }
  return { ok: true, to, cc, subject: email.subject, providerMessageId: result.id ?? null }
}
