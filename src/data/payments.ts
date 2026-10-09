import { useMutation, useQuery, useQueryClient, type QueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query'
import type { Enums, Tables } from '@/lib/database.types'
import { requireSupabase } from '@/lib/supabase'
import { queryKeys } from './keys'

export type Payment = Tables<'payments'>
export type PaymentMethod = Enums<'payment_method'>

export const PAYMENT_METHODS: readonly { readonly value: PaymentMethod; readonly label: string }[] = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'ach', label: 'ACH' },
  { value: 'check', label: 'Check' },
  { value: 'zelle', label: 'Zelle' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'card', label: 'Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
]

export function paymentMethodLabel(method: PaymentMethod): string {
  return PAYMENT_METHODS.find((m) => m.value === method)?.label ?? method
}

export interface RecordPaymentInput {
  readonly invoiceId: string
  readonly clientId: string
  readonly amountMinor: number
  readonly paidOn: string
  readonly method: PaymentMethod
  readonly reference: string
  readonly note: string
}

/** Every payment on an invoice, including removed ones: history is never lost. */
export function usePayments(invoiceId: string | undefined): UseQueryResult<Payment[]> {
  return useQuery({
    queryKey: queryKeys.payments(invoiceId ?? ''),
    enabled: Boolean(invoiceId),
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('payments')
        .select('*')
        .eq('invoice_id', invoiceId ?? '')
        .order('paid_on', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

/** Payments change the derived status, balance and every list that shows them. */
async function refreshAfterPayment(qc: QueryClient, invoiceId: string, clientId: string): Promise<void> {
  void qc.invalidateQueries({ queryKey: queryKeys.invoicesAll })
  void qc.invalidateQueries({ queryKey: queryKeys.clientInvoices(clientId) })
  await Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.invoice(invoiceId) }),
    qc.invalidateQueries({ queryKey: queryKeys.payments(invoiceId) }),
  ])
}

export function useRecordPayment(): UseMutationResult<Payment, Error, RecordPaymentInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input) => {
      const { data, error } = await requireSupabase().rpc('record_payment', {
        p_invoice_id: input.invoiceId,
        p_amount_minor: input.amountMinor,
        p_paid_on: input.paidOn,
        p_method: input.method,
        p_reference: input.reference,
        p_note: input.note,
      })
      if (error) throw error
      return data
    },
    onSuccess: (_payment, input) => refreshAfterPayment(qc, input.invoiceId, input.clientId),
  })
}

/** Soft delete (delete_payment): the row stays for history, the balance recomputes. */
export function useDeletePayment(): UseMutationResult<Payment, Error, { paymentId: string; invoiceId: string; clientId: string }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ paymentId }) => {
      const { data, error } = await requireSupabase().rpc('delete_payment', { p_payment_id: paymentId })
      if (error) throw error
      return data
    },
    onSuccess: (_payment, input) => refreshAfterPayment(qc, input.invoiceId, input.clientId),
  })
}
