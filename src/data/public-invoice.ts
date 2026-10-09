import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { Json } from '@/lib/database.types'
import { requireSupabase } from '@/lib/supabase'
import { queryKeys } from './keys'

/** Shared invoice by its link token. Works signed out (get_public_invoice is granted to anon). */
export function usePublicInvoice(token: string | undefined): UseQueryResult<Json | null> {
  return useQuery({
    queryKey: queryKeys.publicInvoice(token ?? ''),
    enabled: Boolean(token),
    queryFn: async () => {
      const { data, error } = await requireSupabase().rpc('get_public_invoice', { p_token: token ?? '' })
      if (error) throw error
      return data
    },
  })
}
