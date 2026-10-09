import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables } from '../../src/lib/database.types.ts'

export type InvoiceSummary = Tables<'invoice_summary'>

export interface TestUser {
  readonly email: string
  readonly password: string
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set. See e2e/README.md.`)
  return value
}

/** Credentials of the dedicated e2e account. Never logged. */
export function testUser(): TestUser {
  return { email: requireEnv('E2E_TEST_EMAIL'), password: requireEnv('E2E_TEST_PASSWORD') }
}

/**
 * A Supabase client signed in as the test user, with the publishable key only.
 * RLS scopes every read and write to that user's rows, same as the browser.
 */
export async function testUserDb(user: TestUser): Promise<SupabaseClient<Database>> {
  const db = createClient<Database>(requireEnv('VITE_SUPABASE_URL'), requireEnv('VITE_SUPABASE_PUBLISHABLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await db.auth.signInWithPassword(user)
  if (error) throw new Error(`Test user sign-in failed: ${error.message}`)
  return db
}

export async function invoiceSummary(db: SupabaseClient<Database>, id: string): Promise<InvoiceSummary> {
  const { data, error } = await db.from('invoice_summary').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

/**
 * Tidies everything the run created under one client: payments are soft-deleted,
 * issued invoices voided, unnumbered drafts deleted, and the client archived.
 * Issued invoices can't be hard-deleted by design, so they stay as void history.
 */
export async function cleanUpClient(db: SupabaseClient<Database>, clientId: string): Promise<void> {
  const { data: invoices, error } = await db.from('invoices').select('id, lifecycle, number').eq('client_id', clientId)
  if (error) throw error
  for (const invoice of invoices) {
    const { data: payments, error: paymentsError } = await db
      .from('payments')
      .select('id')
      .eq('invoice_id', invoice.id)
      .is('deleted_at', null)
    if (paymentsError) throw paymentsError
    for (const payment of payments) {
      const { error: deleteError } = await db.rpc('delete_payment', { p_payment_id: payment.id })
      if (deleteError) throw deleteError
    }
    if (invoice.lifecycle === 'issued') {
      const { error: voidError } = await db.rpc('void_invoice', { p_invoice_id: invoice.id, p_reason: 'e2e cleanup' })
      if (voidError) throw voidError
    } else if (invoice.lifecycle === 'draft' && invoice.number === null) {
      const { error: deleteError } = await db.from('invoices').delete().eq('id', invoice.id)
      if (deleteError) throw deleteError
    }
  }
  const { error: archiveError } = await db.from('clients').update({ archived_at: new Date().toISOString() }).eq('id', clientId)
  if (archiveError) throw archiveError
}
