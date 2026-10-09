import type { Tables } from '@/lib/database.types'
import { requireSupabase } from '@/lib/supabase'

export interface ExportTables {
  readonly business_settings: Tables<'business_settings'>[]
  readonly clients: Tables<'clients'>[]
  readonly invoices: Tables<'invoices'>[]
  readonly invoice_line_items: Tables<'invoice_line_items'>[]
  readonly payments: Tables<'payments'>[]
}

export interface ExportData {
  readonly tables: ExportTables
  /** Derived status, paid and balance per invoice, for the CSV. Not part of the restorable data. */
  readonly invoiceSummary: Tables<'invoice_summary'>[]
}

/** PostgREST caps a response (1000 rows on Supabase), so read every table in pages. */
const PAGE = 1000

type Page<T> = PromiseLike<{ data: T[] | null; error: Error | null }>

async function readAll<T>(page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if ((data ?? []).length < PAGE) return rows
  }
}

/** Every row the signed-in owner can see (RLS scopes it), including archived clients, voids and removed payments. */
export async function fetchExportData(): Promise<ExportData> {
  const db = requireSupabase()
  const [business_settings, clients, invoices, invoice_line_items, payments, invoiceSummary] = await Promise.all([
    readAll((from, to) => db.from('business_settings').select('*').order('id').range(from, to)),
    readAll((from, to) => db.from('clients').select('*').order('id').range(from, to)),
    readAll((from, to) => db.from('invoices').select('*').order('id').range(from, to)),
    readAll((from, to) => db.from('invoice_line_items').select('*').order('id').range(from, to)),
    readAll((from, to) => db.from('payments').select('*').order('id').range(from, to)),
    readAll((from, to) => db.from('invoice_summary').select('*').order('id').range(from, to)),
  ])
  return { tables: { business_settings, clients, invoices, invoice_line_items, payments }, invoiceSummary }
}
