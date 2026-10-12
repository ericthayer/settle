// The daily automatic reminder run: claim each due step, send it, log it, and keep
// going when one invoice fails. Data access and delivery are passed in, so the
// Edge Function wires Supabase and Resend and Vitest wires fakes.

import type { Delivery, DeliveryRequest, EmailInvoice } from './deliver-invoice-email.ts'

export interface DueReminder {
  readonly invoice_id: string
  /** Days from the due date this reminder belongs to (-3, 1, 7, 14, 30). */
  readonly reminder_step: number
}

export interface ReminderContext {
  readonly invoice: EmailInvoice
  readonly client: DeliveryRequest['client']
  readonly businessEmail: string | null
  readonly publicToken: string
}

export interface ReminderStore {
  dueReminders(): Promise<readonly DueReminder[]>
  /** Takes the step before sending; false when another run holds it or the invoice stopped qualifying. */
  claim(invoiceId: string, step: number): Promise<boolean>
  /** Gives a step back after a send that didn't go out, so the next run retries it. */
  release(invoiceId: string, step: number): Promise<void>
  /** Null when there is nothing to send to. */
  context(invoiceId: string): Promise<ReminderContext | null>
  logReminder(invoiceId: string, step: number, sent: Extract<Delivery, { ok: true }>): Promise<void>
}

export interface ReminderRunConfig {
  readonly appUrl: string
  readonly resendKey: string
  readonly fromAddress: string | null | undefined
}

export interface ReminderRunResult {
  readonly sent: number
  readonly failed: readonly { readonly invoiceId: string; readonly error: string }[]
}

export async function sendDueReminders(
  store: ReminderStore,
  deliver: (request: DeliveryRequest) => Promise<Delivery>,
  config: ReminderRunConfig,
): Promise<ReminderRunResult> {
  let sent = 0
  const failed: { invoiceId: string; error: string }[] = []
  const fail = (invoiceId: string, error: unknown): void => {
    failed.push({ invoiceId, error: error instanceof Error ? error.message : String(error) })
  }

  for (const due of await store.dueReminders()) {
    const { invoice_id: invoiceId, reminder_step: step } = due
    let delivery: Delivery
    try {
      if (!(await store.claim(invoiceId, step))) continue
      const ctx = await store.context(invoiceId)
      if (!ctx) {
        await store.release(invoiceId, step)
        continue
      }
      delivery = await deliver({
        kind: 'reminder',
        invoice: ctx.invoice,
        client: ctx.client,
        businessEmail: ctx.businessEmail,
        viewUrl: `${config.appUrl}/i/${ctx.publicToken}`,
        resendKey: config.resendKey,
        fromAddress: config.fromAddress,
        idempotencyKey: `${invoiceId}:auto:${step}`,
      })
    } catch (error) {
      fail(invoiceId, error)
      await store.release(invoiceId, step).catch(() => undefined)
      continue
    }
    if (!delivery.ok) {
      fail(invoiceId, delivery.error)
      await store.release(invoiceId, step).catch(() => undefined)
      continue
    }

    // The email is out: the claim stays even if the history write fails, so it is never sent twice.
    sent += 1
    try {
      await store.logReminder(invoiceId, step, delivery)
    } catch (error) {
      fail(invoiceId, error)
    }
  }
  return { sent, failed }
}

export interface ReminderRequestDeps {
  /** Checks the x-reminder-secret header against the secret the cron job sends. */
  readonly secretMatches: (secret: string) => Promise<boolean>
  readonly resendKey: string | undefined
  readonly run: (resendKey: string) => Promise<ReminderRunResult>
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** The send-due-reminders endpoint: POST with the cron secret, or nothing runs. */
export async function handleReminderRequest(req: Request, deps: ReminderRequestDeps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })
  const secret = req.headers.get('x-reminder-secret') ?? ''
  if (!(await deps.secretMatches(secret))) return json(401, { error: 'Unauthorized' })
  if (!deps.resendKey) {
    console.error('RESEND_API_KEY is not set')
    return json(503, { error: 'Email is not configured' })
  }
  const result = await deps.run(deps.resendKey)
  for (const failure of result.failed) console.error('reminder failed', failure.invoiceId, failure.error)
  return json(200, result)
}
