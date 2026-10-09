import { z } from 'zod'
import type { DraftInput, DraftLineInput, InvoiceSummary, LineItem } from '@/data/invoices'
import { isIsoDate } from '@/lib/dates'
import { taxPercent } from '@/lib/form-rules'
import { computeTotals, parseMoneyInput, toCurrencyCode, type InvoiceTotals } from '@/lib/money'
import { bpsToPercentInput, percentInputToBps } from '@/lib/rates'

const QUANTITY = /^\d{1,9}(\.\d{1,3})?$|^\.\d{1,3}$/

export interface LineFormValues {
  /** Stable React key; not persisted (lines are rewritten on every save). */
  key: string
  description: string
  quantity: string
  unit_price: string
  taxable: boolean
}

export const invoiceSchema = z
  .object({
    client_id: z.string().min(1, 'Choose a client.'),
    currency: z.string().regex(/^[A-Z]{3}$/, 'Choose a currency.'),
    tax_percent: taxPercent,
    issue_date: z.string().refine((v) => v === '' || isIsoDate(v), 'Enter a valid date.'),
    due_date: z.string().refine((v) => v === '' || isIsoDate(v), 'Enter a valid date.'),
    notes: z.string(),
    payment_instructions: z.string(),
    lines: z.array(
      z.object({
        key: z.string(),
        description: z.string(),
        quantity: z.string(),
        unit_price: z.string(),
        taxable: z.boolean(),
      }),
    ),
  })
  .superRefine((values, ctx) => {
    if (values.issue_date && values.due_date && values.due_date < values.issue_date) {
      ctx.addIssue({ code: 'custom', path: ['due_date'], message: 'Due date can’t be before the issue date.' })
    }
    values.lines.forEach((line, i) => {
      if (isBlankLine(line)) return
      if (!line.description.trim()) ctx.addIssue({ code: 'custom', path: ['lines', i, 'description'], message: 'Describe the item.' })
      const qty = line.quantity.trim()
      if (!QUANTITY.test(qty) || Number(qty) <= 0) {
        ctx.addIssue({ code: 'custom', path: ['lines', i, 'quantity'], message: 'Quantity above 0, up to 3 decimals.' })
      }
      if (/^[A-Z]{3}$/.test(values.currency) && parseMoneyInput(line.unit_price, toCurrencyCode(values.currency)) === null) {
        ctx.addIssue({ code: 'custom', path: ['lines', i, 'unit_price'], message: 'Enter a price.' })
      }
    })
  })

export type InvoiceFormValues = z.infer<typeof invoiceSchema>

let keySeq = 0
export function newLineKey(): string {
  keySeq += 1
  return `line-${Date.now().toString(36)}-${keySeq}`
}

export function emptyLine(): LineFormValues {
  return { key: newLineKey(), description: '', quantity: '1', unit_price: '', taxable: true }
}

/** A row the user hasn't started is ignored rather than flagged. */
export function isBlankLine(line: Pick<LineFormValues, 'description' | 'unit_price'>): boolean {
  return line.description.trim() === '' && line.unit_price.trim() === ''
}

function minorToInput(minor: number, currency: string): string {
  const digits = new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
  return (minor / 10 ** digits).toFixed(digits)
}

function quantityToInput(quantity: number): string {
  return String(Number(quantity.toFixed(3)))
}

export function invoiceToForm(invoice: InvoiceSummary, lines: readonly LineItem[]): InvoiceFormValues {
  const currency = invoice.currency ?? 'USD'
  const formLines = lines.map((l) => ({
    key: l.id,
    description: l.description,
    quantity: quantityToInput(l.quantity),
    unit_price: minorToInput(l.unit_price_minor, currency),
    taxable: l.taxable,
  }))
  return {
    client_id: invoice.client_id ?? '',
    currency,
    tax_percent: bpsToPercentInput(invoice.tax_rate_bps ?? 0),
    issue_date: invoice.issue_date ?? '',
    due_date: invoice.due_date ?? '',
    notes: invoice.notes ?? '',
    payment_instructions: invoice.payment_instructions ?? '',
    lines: formLines.length > 0 ? formLines : [emptyLine()],
  }
}

/** Parsed lines that count toward totals; blank and invalid rows are skipped. */
export function parsedLines(values: Pick<InvoiceFormValues, 'currency' | 'lines'>): DraftLineInput[] {
  if (!/^[A-Z]{3}$/.test(values.currency)) return []
  const currency = toCurrencyCode(values.currency)
  return values.lines.flatMap((line) => {
    if (isBlankLine(line)) return []
    const qty = line.quantity.trim()
    const price = parseMoneyInput(line.unit_price, currency)
    if (!QUANTITY.test(qty) || Number(qty) <= 0 || price === null || !line.description.trim()) return []
    return [{ description: line.description.trim(), quantity: Number(qty), unit_price_minor: price, taxable: line.taxable }]
  })
}

export function liveTotals(values: Pick<InvoiceFormValues, 'currency' | 'lines' | 'tax_percent'>): InvoiceTotals {
  const lines = parsedLines(values).map((l) => ({ quantity: l.quantity, unitPriceMinor: l.unit_price_minor, taxable: l.taxable }))
  return computeTotals(lines, percentInputToBps(values.tax_percent) ?? 0)
}

export function formToDraft(values: InvoiceFormValues): { invoice: DraftInput; lines: DraftLineInput[] } {
  return {
    invoice: {
      client_id: values.client_id,
      currency: values.currency,
      tax_rate_bps: percentInputToBps(values.tax_percent) ?? 0,
      issue_date: values.issue_date || null,
      due_date: values.due_date || null,
      notes: values.notes.trim() || null,
      payment_instructions: values.payment_instructions.trim() || null,
    },
    lines: parsedLines(values),
  }
}
