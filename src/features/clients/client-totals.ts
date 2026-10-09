import type { ClientInvoice } from '@/data/clients'
import { formatMoney, toCurrencyCode } from '@/lib/money'

export interface CurrencyTotals {
  readonly currency: string
  readonly billedMinor: number
  readonly paidMinor: number
}

/** Lifetime billed and paid per currency. Drafts and void invoices don't count as billed. */
export function clientTotals(invoices: readonly ClientInvoice[]): CurrencyTotals[] {
  const byCurrency = new Map<string, { billedMinor: number; paidMinor: number }>()
  for (const inv of invoices) {
    if (inv.lifecycle !== 'issued' || !inv.currency) continue
    const entry = byCurrency.get(inv.currency) ?? { billedMinor: 0, paidMinor: 0 }
    entry.billedMinor += inv.total_minor ?? 0
    entry.paidMinor += inv.amount_paid_minor ?? 0
    byCurrency.set(inv.currency, entry)
  }
  return [...byCurrency].map(([currency, t]) => ({ currency, ...t }))
}

export function formatTotals(totals: readonly CurrencyTotals[], key: 'billedMinor' | 'paidMinor', fallbackCurrency: string): string {
  if (totals.length === 0) return formatMoney({ minor: 0, currency: toCurrencyCode(fallbackCurrency) })
  return totals.map((t) => formatMoney({ minor: t[key], currency: toCurrencyCode(t.currency) })).join(' · ')
}
