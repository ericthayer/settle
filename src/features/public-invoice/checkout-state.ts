import type { InvoiceDocumentModel } from '@/components/invoice-document/document-model'

/** How the payer arrived back from Stripe Checkout, from the ?checkout= query param. */
export type CheckoutReturn = 'success' | 'cancelled' | null

export function checkoutReturn(param: string | null): CheckoutReturn {
  return param === 'success' || param === 'cancelled' ? param : null
}

/** Card payment is offered while an issued invoice still has something to pay. */
export function canPayOnline(model: InvoiceDocumentModel): boolean {
  return (model.status === 'sent' || model.status === 'partially_paid' || model.status === 'overdue') && model.balanceMinor > 0
}

/** Stop polling for the webhook after a minute; bank debits can take days. */
export const PAYMENT_POLL_MS = 60_000

export type CheckoutNotice =
  | { readonly kind: 'none' }
  | { readonly kind: 'processing' }
  | { readonly kind: 'delayed' }
  | { readonly kind: 'paid' }
  | { readonly kind: 'cancelled' }

export function checkoutNotice(returned: CheckoutReturn, model: InvoiceDocumentModel | null, stillPolling: boolean): CheckoutNotice {
  if (!model || returned === null) return { kind: 'none' }
  if (returned === 'cancelled') return canPayOnline(model) ? { kind: 'cancelled' } : { kind: 'none' }
  if (model.status === 'paid') return { kind: 'paid' }
  return stillPolling ? { kind: 'processing' } : { kind: 'delayed' }
}
