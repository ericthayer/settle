import { useMutation, useQuery, useQueryClient, type QueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query'
import type { Enums, Json, Tables } from '@/lib/database.types'
import { requireSupabase } from '@/lib/supabase'
import { queryKeys } from './keys'

export type InvoiceRow = Tables<'invoices'>
export type InvoiceSummary = Tables<'invoice_summary'>
export type LineItem = Tables<'invoice_line_items'>
export type InvoiceStatus = Enums<'invoice_status'>

/** Status filter chips. Outstanding = issued with a balance (sent, partially paid or overdue). */
export const STATUS_FILTERS = {
  all: null,
  draft: ['draft'],
  outstanding: ['sent', 'partially_paid', 'overdue'],
  overdue: ['overdue'],
  paid: ['paid'],
  void: ['void'],
} as const satisfies Record<string, readonly InvoiceStatus[] | null>
export type StatusFilter = keyof typeof STATUS_FILTERS

export interface InvoiceListFilters {
  readonly status: StatusFilter
  readonly clientId: string | null
  readonly search: string
}

export interface InvoiceDetail {
  readonly invoice: InvoiceSummary
  readonly lines: readonly LineItem[]
}

export interface DraftInput {
  readonly client_id: string
  readonly currency: string
  readonly tax_rate_bps: number
  readonly issue_date: string | null
  readonly due_date: string | null
  readonly notes: string | null
  readonly payment_instructions: string | null
}

export interface DraftLineInput {
  readonly description: string
  readonly quantity: number
  readonly unit_price_minor: number
  readonly taxable: boolean
}

export function useInvoiceList(filters: InvoiceListFilters): UseQueryResult<InvoiceSummary[]> {
  return useQuery({
    queryKey: queryKeys.invoices(filters),
    queryFn: async () => {
      let query = requireSupabase().from('invoice_summary').select('*')
      const statuses = STATUS_FILTERS[filters.status]
      if (statuses) query = query.in('status', [...statuses])
      if (filters.clientId) query = query.eq('client_id', filters.clientId)
      const search = filters.search.trim().replace(/[%_,()]/g, '')
      if (search) query = query.ilike('number', `%${search}%`)
      // Drafts (no issue date) first, then newest issued.
      const { data, error } = await query
        .order('issue_date', { ascending: false, nullsFirst: true })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useInvoice(id: string | undefined): UseQueryResult<InvoiceDetail | null> {
  return useQuery({
    queryKey: queryKeys.invoice(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () => {
      const client = requireSupabase()
      const [invoice, lines] = await Promise.all([
        client.from('invoice_summary').select('*').eq('id', id ?? '').maybeSingle(),
        client.from('invoice_line_items').select('*').eq('invoice_id', id ?? '').order('position'),
      ])
      if (invoice.error) throw invoice.error
      if (lines.error) throw lines.error
      return invoice.data ? { invoice: invoice.data, lines: lines.data } : null
    },
  })
}

function invalidateInvoices(qc: QueryClient, row: InvoiceRow): void {
  void qc.invalidateQueries({ queryKey: queryKeys.invoicesAll })
  void qc.invalidateQueries({ queryKey: queryKeys.invoice(row.id) })
  void qc.invalidateQueries({ queryKey: queryKeys.clientInvoices(row.client_id) })
}

export function useCreateDraft(): UseMutationResult<InvoiceRow, Error, Omit<DraftInput, 'issue_date' | 'due_date'>> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input) => {
      const { data, error } = await requireSupabase().from('invoices').insert(input).select('*').single()
      if (error) throw error
      return data
    },
    onSuccess: (row) => invalidateInvoices(qc, row),
  })
}

/** Header + all lines in one transaction (save_invoice_draft). */
export function useSaveDraft(): UseMutationResult<InvoiceRow, Error, { id: string; invoice: DraftInput; lines: readonly DraftLineInput[] }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, invoice, lines }) => {
      const { data, error } = await requireSupabase().rpc('save_invoice_draft', {
        p_invoice_id: id,
        p_invoice: invoice as unknown as Json,
        p_lines: lines as unknown as Json,
      })
      if (error) throw error
      return data
    },
    onSuccess: async (row) => {
      void qc.invalidateQueries({ queryKey: queryKeys.invoicesAll })
      void qc.invalidateQueries({ queryKey: queryKeys.clientInvoices(row.client_id) })
      // Preview and issue read this; keep it current so they never show a stale draft.
      await qc.invalidateQueries({ queryKey: queryKeys.invoice(row.id) })
    },
  })
}

type Lifecycle =
  | { readonly action: 'issue'; readonly id: string; readonly issueDate?: string }
  | { readonly action: 'revert'; readonly id: string }
  | { readonly action: 'void'; readonly id: string; readonly reason?: string }

export function useInvoiceLifecycle(): UseMutationResult<InvoiceRow, Error, Lifecycle> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (change) => {
      const client = requireSupabase()
      const result =
        change.action === 'issue'
          ? await client.rpc('issue_invoice', { p_invoice_id: change.id, ...(change.issueDate ? { p_issue_date: change.issueDate } : {}) })
          : change.action === 'revert'
            ? await client.rpc('revert_to_draft', { p_invoice_id: change.id })
            : await client.rpc('void_invoice', { p_invoice_id: change.id, ...(change.reason ? { p_reason: change.reason } : {}) })
      if (result.error) throw result.error
      return result.data
    },
    // Awaited so callers navigating on success never render the pre-change lifecycle.
    onSuccess: async (row) => {
      invalidateInvoices(qc, row)
      // Issuing advances next_invoice_number.
      void qc.invalidateQueries({ queryKey: queryKeys.settings })
      await qc.invalidateQueries({ queryKey: queryKeys.invoice(row.id) })
    },
  })
}

export function useDeleteDraft(): UseMutationResult<void, Error, { id: string; clientId: string }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }) => {
      const { error, count } = await requireSupabase().from('invoices').delete({ count: 'exact' }).eq('id', id)
      if (error) throw error
      if (count === 0) throw new Error('This draft has an invoice number, so it can’t be deleted. Issue it and void it instead.')
    },
    onSuccess: (_void, { id, clientId }) => {
      qc.removeQueries({ queryKey: queryKeys.invoice(id) })
      void qc.invalidateQueries({ queryKey: queryKeys.invoicesAll })
      void qc.invalidateQueries({ queryKey: queryKeys.clientInvoices(clientId) })
    },
  })
}
