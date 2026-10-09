import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

/** True when the build has Supabase credentials; the app shows a setup notice otherwise. */
export const isSupabaseConfigured: boolean = Boolean(url && publishableKey)

export type SettleClient = SupabaseClient<Database>

/**
 * Browser client. Only ever the publishable (anon) key: every table is guarded by RLS.
 * The service-role key must never be referenced from src/.
 */
export const supabase: SettleClient | null = isSupabaseConfigured
  ? createClient<Database>(url, publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null

export function requireSupabase(): SettleClient {
  if (!supabase) throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.')
  return supabase
}
