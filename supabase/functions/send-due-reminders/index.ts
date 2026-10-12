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
import { DEFAULT_APP_URL, deliverInvoiceEmail } from '../_shared/deliver-invoice-email.ts'
import { sendDueReminders, type ReminderStore } from '../_shared/due-reminders.ts'
import { serviceRoleKey } from '../_shared/supabase-keys.ts'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const secret = req.headers.get('x-reminder-secret') ?? ''
  const { data: authorized, error: secretError } = await db.rpc('reminder_cron_secret_matches', { p_secret: secret })
  if (secretError) {
    console.error('reminder_cron_secret_matches', secretError.message)
    return json(500, { error: 'Could not verify the request' })
  }
  if (authorized !== true) return json(401, { error: 'Unauthorized' })

  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) {
    console.error('RESEND_API_KEY is not set')
    return json(503, { error: 'Email is not configured' })
  }

  const store: ReminderStore = {
    async dueReminders() {
      const { data, error } = await db.rpc('due_reminders')
      if (error) throw new Error(error.message)
      return data ?? []
    },
    async context(invoiceId) {
      const { data: invoice, error } = await db.from('invoice_summary').select('*').eq('id', invoiceId).maybeSingle()
      if (error) throw new Error(error.message)
      if (!invoice || invoice.lifecycle !== 'issued' || (invoice.balance_minor ?? 0) <= 0) return null
      const { data: client } = await db.from('clients').select('email, cc_emails').eq('id', invoice.client_id).maybeSingle()
      const { data: settings } = await db.from('business_settings').select('email').eq('owner_id', invoice.owner_id).maybeSingle()
      // ensure_public_token is security invoker; under the service role it reads any owner's invoice.
      const { data: publicToken, error: tokenError } = await db.rpc('ensure_public_token', { p_invoice_id: invoiceId })
      if (tokenError || !publicToken) throw new Error(tokenError?.message ?? 'Couldn’t create the invoice link.')
      return { invoice, client, businessEmail: settings?.email ?? null, publicToken }
    },
    async logReminder(invoiceId, step, sent) {
      const { error } = await db.rpc('log_automatic_reminder', {
        p_invoice_id: invoiceId,
        p_step: step,
        p_to: sent.to,
        p_cc: [...sent.cc],
        p_subject: sent.subject,
        p_provider_message_id: sent.providerMessageId,
      })
      if (error) throw new Error(`sent but not logged: ${error.message}`)
    },
  }

  const result = await sendDueReminders(store, (request) => deliverInvoiceEmail(request), {
    appUrl: (Deno.env.get('APP_URL') ?? DEFAULT_APP_URL).replace(/\/+$/, ''),
    resendKey,
    fromAddress: Deno.env.get('EMAIL_FROM'),
  })
  for (const failure of result.failed) console.error('reminder failed', failure.invoiceId, failure.error)
  return json(200, result)
})
