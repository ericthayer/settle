import type { Delivery, DeliveryRequest, EmailInvoice } from '../../../supabase/functions/_shared/deliver-invoice-email.ts'
import {
  handleReminderRequest,
  sendDueReminders,
  type DueReminder,
  type ReminderContext,
  type ReminderStore,
} from '../../../supabase/functions/_shared/due-reminders.ts'

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

interface MemoryOptions {
  /** Steps another run already holds, as "invoice:step". */
  readonly taken?: readonly string[]
  readonly failLog?: boolean
  readonly failRelease?: boolean
  readonly failClaim?: boolean
}

/** In-memory store: due steps, invoice contexts, claims held, and reminders logged. */
function memoryStore(due: DueReminder[], contexts: Record<string, ReminderContext | null>, options: MemoryOptions = {}) {
  const claims = new Set<string>(options.taken ?? [])
  const logged: { invoiceId: string; step: number; providerMessageId: string | null }[] = []
  const store: ReminderStore = {
    dueReminders: async () => due,
    claim: async (invoiceId, step) => {
      if (options.failClaim) throw new Error('claim_automatic_reminder: connection refused')
      const key = `${invoiceId}:${step}`
      if (claims.has(key)) return false
      claims.add(key)
      return true
    },
    release: async (invoiceId, step) => {
      if (options.failRelease) throw new Error('release_automatic_reminder: upstream timeout')
      claims.delete(`${invoiceId}:${step}`)
    },
    context: async (id) => contexts[id] ?? null,
    logReminder: async (invoiceId, step, sent) => {
      if (options.failLog) throw new Error('sent but not logged: connection reset')
      logged.push({ invoiceId, step, providerMessageId: sent.providerMessageId })
    },
  }
  return { store, logged, claims }
}

const config = { appUrl: 'https://settle-invoices.netlify.app', resendKey: 're_test', fromAddress: 'invoices@contact.example.com' }

function context(id: string): ReminderContext {
  return { invoice: invoice(id), client: { email: 'ap@acme.com', cc_emails: [] }, businessEmail: 'eric@hogback.com', publicToken: `tok-${id}` }
}

function sentOk(id: string): Delivery {
  return { ok: true, to: 'ap@acme.com', cc: [], subject: 'Reminder', providerMessageId: `msg_${id}` }
}

describe('sendDueReminders', () => {
  it('sends each due reminder as a reminder email with a per-step idempotency key and logs it', async () => {
    const { store, logged, claims } = memoryStore([{ invoice_id: 'a', reminder_step: 7 }], { a: context('a') })
    const requests: DeliveryRequest[] = []
    const deliver = async (request: DeliveryRequest): Promise<Delivery> => {
      requests.push(request)
      return sentOk('a')
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
    expect([...claims]).toEqual(['a:7'])
  })

  it('reports a refused or failing send, gives its step back, and carries on with the rest', async () => {
    const due = [
      { invoice_id: 'a', reminder_step: 1 },
      { invoice_id: 'b', reminder_step: 1 },
      { invoice_id: 'c', reminder_step: 1 },
    ]
    const { store, logged, claims } = memoryStore(due, { a: context('a'), b: context('b'), c: context('c') })
    const deliver = async (request: DeliveryRequest): Promise<Delivery> => {
      if (request.invoice.id === 'a') return { ok: false, status: 502, error: 'Email provider refused the message: rate limited' }
      if (request.invoice.id === 'b') throw new Error('network down')
      return sentOk('c')
    }

    const result = await sendDueReminders(store, deliver, config)

    expect(result).toEqual({
      sent: 1,
      failed: [
        { invoiceId: 'a', error: 'Email provider refused the message: rate limited' },
        { invoiceId: 'b', error: 'network down' },
      ],
    })
    expect(logged).toEqual([{ invoiceId: 'c', step: 1, providerMessageId: 'msg_c' }])
    expect([...claims]).toEqual(['c:1'])
  })

  it('sends nothing for a step another run already claimed', async () => {
    const { store, logged } = memoryStore([{ invoice_id: 'a', reminder_step: 7 }], { a: context('a') }, { taken: ['a:7'] })
    let calls = 0
    const deliver = async (): Promise<Delivery> => {
      calls += 1
      return sentOk('a')
    }

    expect(await sendDueReminders(store, deliver, config)).toEqual({ sent: 0, failed: [] })
    expect(calls).toBe(0)
    expect(logged).toEqual([])
  })

  it('skips an invoice that stopped qualifying between the query and the send, and gives its step back', async () => {
    const { store, logged, claims } = memoryStore([{ invoice_id: 'gone', reminder_step: 1 }], { gone: null })
    let calls = 0
    const deliver = async (): Promise<Delivery> => {
      calls += 1
      return sentOk('gone')
    }

    expect(await sendDueReminders(store, deliver, config)).toEqual({ sent: 0, failed: [] })
    expect(calls).toBe(0)
    expect(logged).toEqual([])
    expect(claims.size).toBe(0)
  })

  it('keeps the step claimed when the email went out but logging it failed, so it is never sent twice', async () => {
    const { store, claims } = memoryStore([{ invoice_id: 'a', reminder_step: 7 }], { a: context('a') }, { failLog: true })

    const result = await sendDueReminders(store, async () => sentOk('a'), config)

    expect(result).toEqual({ sent: 1, failed: [{ invoiceId: 'a', error: 'sent but not logged: connection reset' }] })
    expect([...claims]).toEqual(['a:7'])
  })

  it('says so when a step it could not send also could not be given back', async () => {
    const { store } = memoryStore([{ invoice_id: 'a', reminder_step: 7 }], { a: context('a') }, { failRelease: true })
    const deliver = async (): Promise<Delivery> => ({ ok: false, status: 502, error: 'Email provider refused the message: down' })

    const result = await sendDueReminders(store, deliver, config)

    expect(result.failed).toEqual([
      { invoiceId: 'a', error: 'Email provider refused the message: down' },
      { invoiceId: 'a', error: 'step 7 stays claimed and will not be retried: release_automatic_reminder: upstream timeout' },
    ])
  })

  it('reports a claim that failed once, without trying to give back a step it never held', async () => {
    let releases = 0
    const { store } = memoryStore([{ invoice_id: 'a', reminder_step: 7 }], { a: context('a') }, { failClaim: true })
    const counted: ReminderStore = { ...store, release: async (id, step) => { releases += 1; await store.release(id, step) } }

    const result = await sendDueReminders(counted, async () => sentOk('a'), config)

    expect(result).toEqual({ sent: 0, failed: [{ invoiceId: 'a', error: 'claim_automatic_reminder: connection refused' }] })
    expect(releases).toBe(0)
  })
})

describe('handleReminderRequest', () => {
  function post(secret?: string): Request {
    return new Request('https://example.supabase.co/functions/v1/send-due-reminders', {
      method: 'POST',
      headers: secret === undefined ? {} : { 'x-reminder-secret': secret },
    })
  }

  function deps({ resendKey }: { readonly resendKey: string | undefined } = { resendKey: 're_test' }) {
    const runs: string[] = []
    return {
      runs,
      deps: {
        secretMatches: async (secret: string) => secret === 's3cret',
        resendKey,
        run: async (key: string) => {
          runs.push(key)
          return { sent: 2, failed: [] }
        },
      },
    }
  }

  it('runs with the right secret and answers with the result', async () => {
    const { runs, deps: d } = deps()
    const response = await handleReminderRequest(post('s3cret'), d)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ sent: 2, failed: [] })
    expect(runs).toEqual(['re_test'])
  })

  it('refuses a missing or wrong secret without running', async () => {
    const { runs, deps: d } = deps()

    expect((await handleReminderRequest(post(), d)).status).toBe(401)
    expect((await handleReminderRequest(post('guess'), d)).status).toBe(401)
    expect(runs).toEqual([])
  })

  it('answers 500 without running when the secret can’t be checked', async () => {
    const { runs, deps: d } = deps()
    const response = await handleReminderRequest(post('s3cret'), {
      ...d,
      secretMatches: async () => {
        throw new Error('reminder_cron_secret_matches: connection refused')
      },
    })

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Could not verify the request' })
    expect(runs).toEqual([])
  })

  it('refuses other methods, and reports missing email setup without running', async () => {
    const { runs, deps: d } = deps({ resendKey: undefined })

    expect((await handleReminderRequest(new Request('https://example.supabase.co/x'), d)).status).toBe(405)
    expect((await handleReminderRequest(post('s3cret'), d)).status).toBe(503)
    expect(runs).toEqual([])
  })
})
