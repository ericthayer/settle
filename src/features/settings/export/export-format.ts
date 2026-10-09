import type { ExportData, ExportTables } from '@/data/export'
import { currencyFractionDigits, toCurrencyCode } from '@/lib/money'

export const EXPORT_FORMAT = 'settle-export'
export const EXPORT_VERSION = 1

/** The JSON backup: every table as stored, money in minor units, nothing derived. */
export interface ExportFile {
  readonly format: typeof EXPORT_FORMAT
  readonly version: typeof EXPORT_VERSION
  readonly exported_at: string
  readonly tables: ExportTables
}

const TABLE_NAMES = ['business_settings', 'clients', 'invoices', 'invoice_line_items', 'payments'] as const satisfies readonly (keyof ExportTables)[]

export function toExportJson(tables: ExportTables, exportedAt: Date = new Date()): string {
  const file: ExportFile = { format: EXPORT_FORMAT, version: EXPORT_VERSION, exported_at: exportedAt.toISOString(), tables }
  return JSON.stringify(file, null, 2)
}

/** Reads an export back; throws if it isn't a Settle export this version understands. */
export function parseExportJson(json: string): ExportFile {
  const value: unknown = JSON.parse(json)
  if (typeof value !== 'object' || value === null) throw new Error('Not a Settle export')
  const file = value as Partial<ExportFile>
  if (file.format !== EXPORT_FORMAT) throw new Error('Not a Settle export')
  if (file.version !== EXPORT_VERSION) throw new Error(`Unsupported export version ${String(file.version)}`)
  const tables = file.tables as Partial<Record<string, unknown>> | undefined
  for (const name of TABLE_NAMES) {
    if (!Array.isArray(tables?.[name])) throw new Error(`Export is missing ${name}`)
  }
  return file as ExportFile
}

type Cell = string | number | boolean | null | undefined

/**
 * Text cells starting with these are run as formulas by Excel and Sheets
 * (CSV injection), so they get a leading apostrophe.
 */
const FORMULA_START = /^[=+\-@\t\r]/

function escapeCell(cell: Cell, text: boolean): string {
  if (cell === null || cell === undefined) return ''
  let value = String(cell)
  if (text && FORMULA_START.test(value)) value = `'${value}`
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

/** RFC 4180 CSV with CRLF line endings. `textColumns` are the user-entered columns that get the formula guard. */
export function toCsv(headers: readonly string[], rows: readonly (readonly Cell[])[], textColumns: ReadonlySet<string> = new Set()): string {
  const isText = headers.map((h) => textColumns.has(h))
  const lines = [headers.map((h) => escapeCell(h, false)).join(','), ...rows.map((row) => row.map((cell, i) => escapeCell(cell, isText[i] ?? false)).join(','))]
  return `${lines.join('\r\n')}\r\n`
}

/** Minor units as a plain decimal for spreadsheets: 123456 USD → "1234.56". No symbols or grouping. */
export function minorToDecimal(minor: number | null, currency: string | null): string {
  if (minor === null) return ''
  const digits = currencyFractionDigits(toCurrencyCode(currency ?? 'USD'))
  if (digits === 0) return String(minor)
  const sign = minor < 0 ? '-' : ''
  const abs = Math.abs(minor)
  const scale = 10 ** digits
  return `${sign}${Math.floor(abs / scale)}.${String(abs % scale).padStart(digits, '0')}`
}

export const INVOICE_CSV_HEADERS = [
  'number', 'status', 'client', 'issue_date', 'due_date', 'currency', 'subtotal', 'tax', 'total', 'paid', 'balance', 'days_overdue', 'void_reason', 'id',
] as const

export function invoicesCsv(data: ExportData): string {
  const rows = [...data.invoiceSummary]
    .sort((a, b) => (a.number ?? '￿').localeCompare(b.number ?? '￿') || (a.created_at ?? '').localeCompare(b.created_at ?? ''))
    .map((inv) => [
      inv.number,
      inv.status,
      inv.client_name,
      inv.issue_date,
      inv.due_date,
      inv.currency,
      minorToDecimal(inv.subtotal_minor, inv.currency),
      minorToDecimal(inv.tax_minor, inv.currency),
      minorToDecimal(inv.total_minor, inv.currency),
      minorToDecimal(inv.amount_paid_minor, inv.currency),
      minorToDecimal(inv.balance_minor, inv.currency),
      inv.days_overdue,
      inv.void_reason,
      inv.id,
    ])
  return toCsv(INVOICE_CSV_HEADERS, rows, new Set(['client', 'void_reason']))
}

export const PAYMENT_CSV_HEADERS = [
  'invoice_number', 'paid_on', 'amount', 'currency', 'method', 'reference', 'note', 'status', 'removed_at', 'id', 'invoice_id',
] as const

/** Every payment, removed ones included (removed_at set), so the history matches the app. */
export function paymentsCsv(data: ExportData): string {
  const numbers = new Map(data.tables.invoices.map((inv) => [inv.id, inv.number]))
  const rows = [...data.tables.payments]
    .sort((a, b) => a.paid_on.localeCompare(b.paid_on) || a.created_at.localeCompare(b.created_at))
    .map((p) => [
      numbers.get(p.invoice_id) ?? null,
      p.paid_on,
      minorToDecimal(p.amount_minor, p.currency),
      p.currency,
      p.method,
      p.reference,
      p.note,
      p.status,
      p.deleted_at,
      p.id,
      p.invoice_id,
    ])
  return toCsv(PAYMENT_CSV_HEADERS, rows, new Set(['reference', 'note']))
}

/** "settle-2026-10-09.json" */
export function exportFileName(kind: 'json' | 'invoices' | 'payments', today: string): string {
  return kind === 'json' ? `settle-${today}.json` : `settle-${kind}-${today}.csv`
}
