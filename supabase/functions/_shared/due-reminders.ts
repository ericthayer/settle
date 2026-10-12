// The daily automatic reminder run: send each due reminder once, log it, and keep
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
  /** Null when the invoice is no longer issued with a balance. */
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
  for (const due of await store.dueReminders()) {
    try {
      const ctx = await store.context(due.invoice_id)
      if (!ctx) continue
      const delivery = await deliver({
        kind: 'reminder',
        invoice: ctx.invoice,
        client: ctx.client,
        businessEmail: ctx.businessEmail,
        viewUrl: `${config.appUrl}/i/${ctx.publicToken}`,
        resendKey: config.resendKey,
        fromAddress: config.fromAddress,
        idempotencyKey: `${due.invoice_id}:auto:${due.reminder_step}`,
      })
      if (!delivery.ok) {
        failed.push({ invoiceId: due.invoice_id, error: delivery.error })
        continue
      }
      await store.logReminder(due.invoice_id, due.reminder_step, delivery)
      sent += 1
    } catch (error) {
      failed.push({ invoiceId: due.invoice_id, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return { sent, failed }
}
