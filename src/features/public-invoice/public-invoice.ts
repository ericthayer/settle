import { snapshotParties, type InvoiceDocumentModel } from '@/components/invoice-document/document-model'
import type { InvoiceStatus } from '@/data/invoices'
import type { Json } from '@/lib/database.types'
import { toCurrencyCode } from '@/lib/money'

const STATUSES: readonly InvoiceStatus[] = ['draft', 'sent', 'partially_paid', 'paid', 'overdue', 'void']

type JsonObject = { readonly [key: string]: Json | undefined }

function obj(value: Json | undefined): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}
function text(o: JsonObject, key: string): string | null {
  const v = o[key]
  return typeof v === 'string' && v.trim() !== '' ? v : null
}
function num(o: JsonObject, key: string): number {
  const v = o[key]
  return typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : 0
}

/** Turns get_public_invoice's JSON into the printable model; null when the link doesn't resolve. */
export function toPublicDocumentModel(payload: Json | null): InvoiceDocumentModel | null {
  const root = obj(payload ?? undefined)
  const invoice = root ? obj(root.invoice) : null
  if (!root || !invoice) return null
  const rawStatus = text(invoice, 'status')
  const status = STATUSES.find((s) => s === rawStatus) ?? 'sent'
  const { from, to, logoPath } = snapshotParties(invoice.bill_from ?? null, invoice.bill_to ?? null)
  const lines = Array.isArray(root.lines) ? root.lines : []
  return {
    number: text(invoice, 'number'),
    status,
    issueDate: text(invoice, 'issue_date'),
    dueDate: text(invoice, 'due_date'),
    datesProvisional: false,
    currency: toCurrencyCode(text(invoice, 'currency') ?? 'USD'),
    from,
    logoPath,
    to,
    lines: lines.flatMap((value) => {
      const line = obj(value)
      if (!line) return []
      return [
        {
          id: String(num(line, 'position')),
          description: text(line, 'description') ?? '',
          quantity: num(line, 'quantity'),
          unitPriceMinor: num(line, 'unit_price_minor'),
          amountMinor: num(line, 'amount_minor'),
          taxable: line.taxable === true,
        },
      ]
    }),
    taxRateBps: num(invoice, 'tax_rate_bps'),
    subtotalMinor: num(invoice, 'subtotal_minor'),
    taxMinor: num(invoice, 'tax_minor'),
    totalMinor: num(invoice, 'total_minor'),
    amountPaidMinor: num(invoice, 'amount_paid_minor'),
    balanceMinor: num(invoice, 'balance_minor'),
    notes: text(invoice, 'notes'),
    paymentInstructions: text(invoice, 'payment_instructions'),
    voidReason: text(invoice, 'void_reason'),
  }
}
