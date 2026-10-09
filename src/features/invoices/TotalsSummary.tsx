import type { ReactNode } from 'react'
import { formatMoney, type CurrencyCode, type InvoiceTotals } from '@/lib/money'

/** Subtotal / tax / total block, announced politely as it changes. */
export function TotalsSummary({ totals, currency, taxLabel }: { readonly totals: InvoiceTotals; readonly currency: CurrencyCode; readonly taxLabel: string }): ReactNode {
  const fmt = (minor: number): string => formatMoney({ minor, currency })
  return (
    <dl aria-live="polite" className="tabular ml-auto grid w-full max-w-xs grid-cols-[1fr_auto] gap-y-2 text-sm [&_dd]:pl-6">
      <dt className="text-ink-muted">Subtotal</dt>
      <dd className="text-right">{fmt(totals.subtotalMinor)}</dd>
      <dt className="text-ink-muted">{taxLabel}</dt>
      <dd className="text-right">{fmt(totals.taxMinor)}</dd>
      <dt className="border-t border-line pt-2 font-medium">Total</dt>
      <dd className="border-t border-line pt-2 text-right text-base font-semibold">{fmt(totals.totalMinor)}</dd>
    </dl>
  )
}
