import type { InvoiceSummary } from '@/data/invoices'
import { addDays } from '@/lib/dates'

/** Amounts per currency; the business default currency sorts first. */
export interface CurrencyAmount {
  readonly currency: string
  readonly minor: number
}

export interface DashboardKpis {
  readonly outstanding: { readonly count: number; readonly amounts: readonly CurrencyAmount[] }
  readonly overdue: { readonly count: number; readonly amounts: readonly CurrencyAmount[] }
  readonly receivedThisMonth: { readonly count: number; readonly amounts: readonly CurrencyAmount[] }
  readonly drafts: number
}

export type FollowUpReason =
  | { readonly kind: 'overdue'; readonly daysOverdue: number }
  | { readonly kind: 'due_soon'; readonly daysUntilDue: number }

export interface FollowUp {
  readonly invoice: InvoiceSummary
  readonly reason: FollowUpReason
}

export interface ReceivedPayment {
  readonly amount_minor: number
  readonly currency: string
}

/** "Due soon" window for the follow-up list. */
export const DUE_SOON_DAYS = 7

export function sumByCurrency<T>(rows: readonly T[], currency: (row: T) => string | null, minor: (row: T) => number | null, primary: string): CurrencyAmount[] {
  const totals = new Map<string, number>()
  for (const row of rows) {
    const code = currency(row) ?? primary
    totals.set(code, (totals.get(code) ?? 0) + (minor(row) ?? 0))
  }
  return [...totals]
    .map(([code, value]) => ({ currency: code, minor: value }))
    .sort((a, b) => (a.currency === primary ? -1 : b.currency === primary ? 1 : a.currency.localeCompare(b.currency)))
}

/** Issued invoices with money still owed: sent, partially paid or overdue. */
export function isOutstanding(inv: InvoiceSummary): boolean {
  return inv.lifecycle === 'issued' && (inv.balance_minor ?? 0) > 0
}

export function computeKpis(open: readonly InvoiceSummary[], received: readonly ReceivedPayment[], drafts: number, primaryCurrency: string): DashboardKpis {
  const outstanding = open.filter(isOutstanding)
  const overdue = outstanding.filter((inv) => inv.status === 'overdue')
  const balance = (inv: InvoiceSummary): number | null => inv.balance_minor
  return {
    outstanding: { count: outstanding.length, amounts: sumByCurrency(outstanding, (i) => i.currency, balance, primaryCurrency) },
    overdue: { count: overdue.length, amounts: sumByCurrency(overdue, (i) => i.currency, balance, primaryCurrency) },
    receivedThisMonth: { count: received.length, amounts: sumByCurrency(received, (p) => p.currency, (p) => p.amount_minor, primaryCurrency) },
    drafts,
  }
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000)
}

/**
 * What to chase: overdue first (most days overdue on top), then invoices due
 * within DUE_SOON_DAYS (soonest first). Today is the owner's calendar day.
 */
export function followUps(open: readonly InvoiceSummary[], today: string): FollowUp[] {
  const horizon = addDays(today, DUE_SOON_DAYS)
  const overdue: FollowUp[] = []
  const dueSoon: FollowUp[] = []
  for (const inv of open) {
    if (!isOutstanding(inv) || !inv.due_date) continue
    if (inv.status === 'overdue') {
      overdue.push({ invoice: inv, reason: { kind: 'overdue', daysOverdue: inv.days_overdue ?? daysBetween(inv.due_date, today) } })
    } else if (inv.due_date <= horizon) {
      dueSoon.push({ invoice: inv, reason: { kind: 'due_soon', daysUntilDue: Math.max(daysBetween(today, inv.due_date), 0) } })
    }
  }
  const days = (f: FollowUp): number => (f.reason.kind === 'overdue' ? f.reason.daysOverdue : f.reason.daysUntilDue)
  overdue.sort((a, b) => days(b) - days(a) || (a.invoice.due_date ?? '').localeCompare(b.invoice.due_date ?? ''))
  dueSoon.sort((a, b) => days(a) - days(b) || (a.invoice.number ?? '').localeCompare(b.invoice.number ?? ''))
  return [...overdue, ...dueSoon]
}

/** First day of the owner's current month, as YYYY-MM-DD. */
export function monthStart(today: string): string {
  return `${today.slice(0, 7)}-01`
}
