import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query'
import type { Tables, TablesInsert } from '@/lib/database.types'
import { requireSupabase } from '@/lib/supabase'
import { queryKeys } from './keys'

export type Client = Tables<'clients'>
export type ClientInput = Omit<TablesInsert<'clients'>, 'id' | 'owner_id' | 'created_at' | 'updated_at' | 'archived_at'>
export type ClientInvoice = Pick<
  Tables<'invoice_summary'>,
  'id' | 'number' | 'status' | 'issue_date' | 'due_date' | 'total_minor' | 'amount_paid_minor' | 'balance_minor' | 'currency' | 'lifecycle'
>

export function useClients(includeArchived: boolean): UseQueryResult<Client[]> {
  return useQuery({
    queryKey: queryKeys.clients({ includeArchived }),
    queryFn: async () => {
      let query = requireSupabase().from('clients').select('*').order('name')
      if (!includeArchived) query = query.is('archived_at', null)
      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}

export function useClient(id: string | undefined): UseQueryResult<Client | null> {
  return useQuery({
    queryKey: queryKeys.client(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await requireSupabase().from('clients').select('*').eq('id', id ?? '').maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useClientInvoices(id: string | undefined): UseQueryResult<ClientInvoice[]> {
  return useQuery({
    queryKey: queryKeys.clientInvoices(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('invoice_summary')
        .select('id, number, status, issue_date, due_date, total_minor, amount_paid_minor, balance_minor, currency, lifecycle')
        .eq('client_id', id ?? '')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

/** Insert when id is absent, update otherwise. */
export function useSaveClient(): UseMutationResult<Client, Error, { id?: string; input: ClientInput }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }) => {
      const table = requireSupabase().from('clients')
      const { data, error } = id
        ? await table.update(input).eq('id', id).select('*').single()
        : await table.insert(input).select('*').single()
      if (error) throw error
      return data
    },
    onSuccess: (row) => {
      qc.setQueryData(queryKeys.client(row.id), row)
      void qc.invalidateQueries({ queryKey: queryKeys.clientsAll })
    },
  })
}

export function useSetClientArchived(): UseMutationResult<Client, Error, { id: string; archived: boolean }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, archived }) => {
      const { data, error } = await requireSupabase()
        .from('clients')
        .update({ archived_at: archived ? new Date().toISOString() : null })
        .eq('id', id)
        .select('*')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (row) => {
      qc.setQueryData(queryKeys.client(row.id), row)
      void qc.invalidateQueries({ queryKey: queryKeys.clientsAll })
    },
  })
}
