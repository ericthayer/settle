import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query'
import { FunctionsHttpError } from '@supabase/supabase-js'
import type { Enums, Tables } from '@/lib/database.types'
import { requireSupabase } from '@/lib/supabase'
import { queryKeys } from './keys'

export type InvoiceEmail = Tables<'invoice_emails'>
export type InvoiceEmailKind = Enums<'invoice_email_kind'>

export interface SendInvoiceEmailInput {
  readonly invoiceId: string
  readonly clientId: string
  readonly kind: InvoiceEmailKind
  /** One per dialog opening: a retried send never delivers twice. */
  readonly requestId: string
}

export interface SendInvoiceEmailResult {
  readonly to: string
  readonly cc: readonly string[]
  readonly sentAt: string
}

/** Every email sent for an invoice, oldest first. */
export function useInvoiceEmails(invoiceId: string | undefined): UseQueryResult<InvoiceEmail[]> {
  return useQuery({
    queryKey: queryKeys.invoiceEmails(invoiceId ?? ''),
    enabled: Boolean(invoiceId),
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('invoice_emails')
        .select('*')
        .eq('invoice_id', invoiceId ?? '')
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

/** The function answers errors as { error: string }; surface that sentence. */
async function functionErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const body: unknown = await (error.context as Response).json().catch(() => null)
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return body.error
  }
  return error instanceof Error ? error.message : 'Couldn’t send the email. Try again.'
}

/** Sends through the send-invoice-email Edge Function, which holds the provider key. */
export function useSendInvoiceEmail(): UseMutationResult<SendInvoiceEmailResult, Error, SendInvoiceEmailInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ invoiceId, kind, requestId }) => {
      const { data, error } = await requireSupabase().functions.invoke<SendInvoiceEmailResult>('send-invoice-email', {
        body: { invoiceId, kind, requestId },
      })
      if (error) throw new Error(await functionErrorMessage(error))
      if (!data) throw new Error('Couldn’t send the email. Try again.')
      return data
    },
    onSuccess: async (_result, { invoiceId, clientId }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.invoicesAll })
      void qc.invalidateQueries({ queryKey: queryKeys.clientInvoices(clientId) })
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.invoice(invoiceId) }),
        qc.invalidateQueries({ queryKey: queryKeys.invoiceEmails(invoiceId) }),
      ])
    },
  })
}
