import type { Delivery, DeliveryRequest, EmailInvoice } from '../../../supabase/functions/_shared/deliver-invoice-email.ts'
import { sendDueReminders, type DueReminder, type ReminderContext, type ReminderStore } from '../../../supabase/functions/_shared/due-reminders.ts'

function invoice(id: string): EmailInvoice {
  return {
    id,
    number: `INV-${id}`,
    currency: 'USD',
    balance_minor: 10_000,
    total_minor: 10_000,
    due_date: '2026-10-01',
    days_overdue: 7,
    payment_instructions: null,
    bill_to: { email: 'ap@acme.com' },
    bill_from: { business_name: 'Hogback Provisions' },
  }
}

/** In-memory store: invoices by id, and the reminders logged so far. */
function memoryStore(due: DueReminder[], contexts: Record<string, ReminderContext | null>) {
  const logged: { invoiceId: string; step: number; providerMessageId: string | null }[] = []
  const store: ReminderStore = {
    dueReminders: async () => due,
    context: async (id) => contexts[id] ?? null,
    logReminder: async (invoiceId, step, sent) => {
      logged.push({ invoiceId, step, providerMessageId: sent.providerMessageId })
    },
  }
  return { store, logged }
}

const config = { appUrl: 'https://settle-invoices.netlify.app', resendKey: 're_test', fromAddress: 'invoices@contact.example.com' }

function context(id: string): ReminderContext {
  return { invoice: invoice(id), client: { email: 'ap@acme.com', cc_emails: [] }, businessEmail: 'eric@hogback.com', publicToken: `tok-${id}` }
}

describe('sendDueReminders', () => {
  it('sends each due reminder as a reminder email with a per-step idempotency key and logs it', async () => {
    const { store, logged } = memoryStore([{ invoice_id: 'a', reminder_step: 7 }], { a: context('a') })
    const requests: DeliveryRequest[] = []
    const deliver = async (request: DeliveryRequest): Promise<Delivery> => {
      requests.push(request)
      return { ok: true, to: 'ap@acme.com', cc: [], subject: 'Reminder', providerMessageId: 'msg_a' }
    }

    const result = await sendDueReminders(store, deliver, config)

    expect(result).toEqual({ sent: 1, failed: [] })
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({
      kind: 'reminder',
      viewUrl: 'https://settle-invoices.netlify.app/i/tok-a',
      idempotencyKey: 'a:auto:7',
      resendKey: 're_test',
      fromAddress: 'invoices@contact.example.com',
      businessEmail: 'eric@hogback.com',
    })
    expect(logged).toEqual([{ invoiceId: 'a', step: 7, providerMessageId: 'msg_a' }])
  })

  it('reports a refused or failing send and carries on with the rest, logging only what went out', async () => {
    const due = [
      { invoice_id: 'a', reminder_step: 1 },
      { invoice_id: 'b', reminder_step: 1 },
      { invoice_id: 'c', reminder_step: 1 },
    ]
    const { store, logged } = memoryStore(due, { a: context('a'), b: context('b'), c: context('c') })
    const deliver = async (request: DeliveryRequest): Promise<Delivery> => {
      if (request.invoice.id === 'a') return { ok: false, status: 422, error: 'Add an email address to this client first.' }
      if (request.invoice.id === 'b') throw new Error('network down')
      return { ok: true, to: 'ap@acme.com', cc: [], subject: 'Reminder', providerMessageId: 'msg_c' }
    }

    const result = await sendDueReminders(store, deliver, config)

    expect(result).toEqual({
      sent: 1,
      failed: [
        { invoiceId: 'a', error: 'Add an email address to this client first.' },
        { invoiceId: 'b', error: 'network down' },
      ],
    })
    expect(logged).toEqual([{ invoiceId: 'c', step: 1, providerMessageId: 'msg_c' }])
  })

  it('skips an invoice that stopped qualifying between the query and the send', async () => {
    const { store, logged } = memoryStore([{ invoice_id: 'gone', reminder_step: 1 }], { gone: null })
    let calls = 0
    const deliver = async (): Promise<Delivery> => {
      calls += 1
      return { ok: true, to: 'ap@acme.com', cc: [], subject: 'Reminder', providerMessageId: null }
    }

    expect(await sendDueReminders(store, deliver, config)).toEqual({ sent: 0, failed: [] })
    expect(calls).toBe(0)
    expect(logged).toEqual([])
  })
})
