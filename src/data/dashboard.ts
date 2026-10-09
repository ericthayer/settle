import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { requireSupabase } from '@/lib/supabase'
import type { InvoiceSummary } from './invoices'
import { queryKeys } from './keys'

export interface DashboardData {
  /** Issued invoices with a balance: the only rows KPIs and follow-ups need, so the set stays small. */
  readonly open: InvoiceSummary[]
  /** Succeeded, not-removed payments dated on or after monthStart. */
  readonly received: { amount_minor: number; currency: string }[]
  readonly drafts: number
}

/** monthStart is the owner's month (their time zone), so "this month" matches their calendar. */
export function useDashboard(monthStart: string | null): UseQueryResult<DashboardData> {
  return useQuery({
    queryKey: queryKeys.dashboard(monthStart ?? ''),
    enabled: monthStart !== null,
    queryFn: async () => {
      const client = requireSupabase()
      const [open, received, drafts] = await Promise.all([
        client.from('invoice_summary').select('*').eq('lifecycle', 'issued').gt('balance_minor', 0).order('due_date'),
        client
          .from('payments')
          .select('amount_minor, currency')
          .eq('status', 'succeeded')
          .is('deleted_at', null)
          .gte('paid_on', monthStart ?? ''),
        client.from('invoices').select('id', { count: 'exact', head: true }).eq('lifecycle', 'draft'),
      ])
      if (open.error) throw open.error
      if (received.error) throw received.error
      if (drafts.error) throw drafts.error
      return { open: open.data, received: received.data, drafts: drafts.count ?? 0 }
    },
  })
}
