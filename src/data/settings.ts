import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query'
import type { Tables, TablesInsert } from '@/lib/database.types'
import { requireSupabase } from '@/lib/supabase'
import { queryKeys } from './keys'

export type BusinessSettings = Tables<'business_settings'>
export type BusinessSettingsInput = Omit<TablesInsert<'business_settings'>, 'id' | 'owner_id' | 'created_at' | 'updated_at'>

/** The single settings row, or null on first run. RLS scopes it to the signed-in owner. */
export async function fetchBusinessSettings(): Promise<BusinessSettings | null> {
  const { data, error } = await requireSupabase().from('business_settings').select('*').maybeSingle()
  if (error) throw error
  return data
}

export function useBusinessSettings(): UseQueryResult<BusinessSettings | null> {
  return useQuery({ queryKey: queryKeys.settings, queryFn: fetchBusinessSettings })
}

/** Upsert on owner_id: inserts on first run, updates afterwards. */
export function useSaveBusinessSettings(): UseMutationResult<BusinessSettings, Error, BusinessSettingsInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input) => {
      const { data, error } = await requireSupabase()
        .from('business_settings')
        .upsert(input, { onConflict: 'owner_id' })
        .select('*')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (row) => qc.setQueryData(queryKeys.settings, row),
  })
}
