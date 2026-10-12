import { useMutation, useQuery, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query'
import type { Json } from '@/lib/database.types'
import { functionErrorMessage } from '@/lib/function-errors'
import { requireSupabase } from '@/lib/supabase'
import { queryKeys } from './keys'

const POLL_MS = 2_000

/**
 * Shared invoice by its link token. Works signed out (get_public_invoice is granted to anon).
 * `pollWhile` keeps refetching while it returns true, e.g. until a card payment is recorded.
 */
export function usePublicInvoice(
  token: string | undefined,
  pollWhile?: (data: Json | null | undefined) => boolean,
): UseQueryResult<Json | null> {
  return useQuery({
    queryKey: queryKeys.publicInvoice(token ?? ''),
    enabled: Boolean(token),
    refetchInterval: pollWhile ? (query) => (pollWhile(query.state.data) ? POLL_MS : false) : false,
    queryFn: async () => {
      const { data, error } = await requireSupabase().rpc('get_public_invoice', { p_token: token ?? '' })
      if (error) throw error
      return data
    },
  })
}

/** Opens a Stripe Checkout Session for the invoice's current balance; resolves to its URL. */
export function useStartCheckout(): UseMutationResult<string, Error, { readonly token: string }> {
  return useMutation({
    mutationFn: async ({ token }) => {
      const fallback = 'Couldn’t start the payment. Try again.'
      const { data, error } = await requireSupabase().functions.invoke<{ url?: string }>('create-checkout', { body: { token } })
      if (error) throw new Error(await functionErrorMessage(error, fallback))
      if (!data?.url) throw new Error(fallback)
      return data.url
    },
  })
}
