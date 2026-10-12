// Sends automatic payment reminders. Called once a day by the pg_cron job in
// migration 20261012000000_automatic_reminders.sql, never by the app.
//
// The x-reminder-secret header must match the random secret that migration stored
// in Vault; anything else gets 401 and sends nothing. Runs with the service role
// because the job has no user session; due_reminders() decides what is due.
//
// Secrets (Supabase → Edge Functions → Secrets), shared with send-invoice-email:
//   RESEND_API_KEY  required.
//   EMAIL_FROM      optional verified sender address.
//   APP_URL         optional base URL of the invoice links. Defaults to production.
//
// Deployed with verify_jwt = false: the job sends no JWT; the secret is the credential.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { appUrl, deliverInvoiceEmail, resolveRecipients } from '../_shared/deliver-invoice-email.ts'
import { handleReminderRequest, sendDueReminders, type ReminderStore } from '../_shared/due-reminders.ts'
import { serviceRoleKey } from '../_shared/supabase-keys.ts'

const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args)
  if (error) throw new Error(`${fn}: ${error.message}`)
  return data as T
}

const store: ReminderStore = {
  dueReminders: () => rpc('due_reminders'),
  claim: (invoiceId, step) => rpc('claim_automatic_reminder', { p_invoice_id: invoiceId, p_step: step }),
  release: (invoiceId, step) => rpc('release_automatic_reminder', { p_invoice_id: invoiceId, p_step: step }),
  async context(invoiceId) {
    const { data: invoice, error } = await db.from('invoice_summary').select('*').eq('id', invoiceId).maybeSingle()
    if (error) throw new Error(error.message)
    if (!invoice) return null
    const { data: client } = await db.from('clients').select('email, cc_emails').eq('id', invoice.client_id).maybeSingle()
    if (!resolveRecipients(client, invoice.bill_to)) return null
    const { data: settings } = await db.from('business_settings').select('email').eq('owner_id', invoice.owner_id).maybeSingle()
    // ensure_public_token is security invoker; under the service role it reads any owner's invoice.
    const publicToken = await rpc<string>('ensure_public_token', { p_invoice_id: invoiceId })
    return { invoice, client, businessEmail: settings?.email ?? null, publicToken }
  },
  logReminder: (invoiceId, step, sent) =>
    rpc('log_automatic_reminder', {
      p_invoice_id: invoiceId,
      p_step: step,
      p_to: sent.to,
      p_cc: [...sent.cc],
      p_subject: sent.subject,
      p_provider_message_id: sent.providerMessageId,
    }),
}

Deno.serve((req: Request): Promise<Response> =>
  handleReminderRequest(req, {
    secretMatches: async (secret) => (await rpc<boolean>('reminder_cron_secret_matches', { p_secret: secret })) === true,
    resendKey: Deno.env.get('RESEND_API_KEY'),
    run: (resendKey) =>
      sendDueReminders(store, (request) => deliverInvoiceEmail(request), {
        appUrl: appUrl(Deno.env.get('APP_URL')),
        resendKey,
        fromAddress: Deno.env.get('EMAIL_FROM'),
      }),
  }),
)
