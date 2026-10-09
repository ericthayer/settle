import type { Client } from '@/data/clients'
import type { InvoiceStatus, InvoiceSummary, LineItem } from '@/data/invoices'
import type { BusinessSettings } from '@/data/settings'
import { parseAddress, type Address } from '@/lib/address'
import type { Json } from '@/lib/database.types'
import { addDays } from '@/lib/dates'
import { toCurrencyCode, type CurrencyCode } from '@/lib/money'

export interface Party {
  readonly name: string
  readonly contactName: string | null
  readonly email: string | null
  readonly phone: string | null
  readonly website: string | null
  readonly taxId: string | null
  readonly address: Address
}

/** Everything the printed invoice shows, already resolved. Pure data, no fetching. */
export interface InvoiceDocumentModel {
  readonly number: string | null
  readonly status: InvoiceStatus
  readonly issueDate: string | null
  readonly dueDate: string | null
  /** True when dates are estimates for a draft (issue = today, due = terms). */
  readonly datesProvisional: boolean
  readonly currency: CurrencyCode
  readonly from: Party
  readonly logoPath: string | null
  readonly to: Party
  readonly lines: readonly { readonly id: string; readonly description: string; readonly quantity: number; readonly unitPriceMinor: number; readonly amountMinor: number; readonly taxable: boolean }[]
  readonly taxRateBps: number
  readonly subtotalMinor: number
  readonly taxMinor: number
  readonly totalMinor: number
  readonly amountPaidMinor: number
  readonly balanceMinor: number
  readonly notes: string | null
  readonly paymentInstructions: string | null
  readonly voidReason: string | null
}

type JsonObject = { readonly [key: string]: Json | undefined }

function obj(value: Json | null | undefined): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}
function str(o: JsonObject, key: string): string | null {
  const v = o[key]
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

/** Issued/void invoices print their frozen bill_to/bill_from; drafts preview live client and settings. */
export function toDocumentModel(
  invoice: InvoiceSummary,
  lines: readonly LineItem[],
  settings: BusinessSettings,
  client: Client | null,
  today: string,
): InvoiceDocumentModel {
  const draft = invoice.lifecycle === 'draft'
  const billFrom = obj(invoice.bill_from)
  const billTo = obj(invoice.bill_to)

  const from: Party = draft
    ? { name: settings.business_name, contactName: null, email: settings.email, phone: settings.phone, website: settings.website, taxId: settings.tax_id, address: parseAddress(settings.address) }
    : { name: str(billFrom, 'business_name') ?? '', contactName: null, email: str(billFrom, 'email'), phone: str(billFrom, 'phone'), website: str(billFrom, 'website'), taxId: str(billFrom, 'tax_id'), address: parseAddress(billFrom.address) }

  const to: Party = draft
    ? { name: client?.name ?? invoice.client_name ?? '', contactName: client?.contact_name ?? null, email: client?.email ?? null, phone: client?.phone ?? null, website: null, taxId: client?.tax_id ?? null, address: parseAddress(client?.billing_address) }
    : { name: str(billTo, 'name') ?? '', contactName: str(billTo, 'contact_name'), email: str(billTo, 'email'), phone: str(billTo, 'phone'), website: null, taxId: str(billTo, 'tax_id'), address: parseAddress(billTo.address) }

  const terms = client?.payment_terms_days ?? settings.default_payment_terms_days
  const issueDate = invoice.issue_date ?? (draft ? today : null)
  const dueDate = invoice.due_date ?? (draft && issueDate ? addDays(issueDate, terms) : null)

  return {
    number: invoice.number,
    status: invoice.status ?? 'draft',
    issueDate,
    dueDate,
    datesProvisional: draft && (!invoice.issue_date || !invoice.due_date),
    currency: toCurrencyCode(invoice.currency ?? settings.default_currency),
    from,
    logoPath: draft ? settings.logo_path : str(billFrom, 'logo_path'),
    to,
    lines: lines.map((l) => ({ id: l.id, description: l.description, quantity: l.quantity, unitPriceMinor: l.unit_price_minor, amountMinor: l.amount_minor ?? 0, taxable: l.taxable })),
    taxRateBps: invoice.tax_rate_bps ?? 0,
    subtotalMinor: invoice.subtotal_minor ?? 0,
    taxMinor: invoice.tax_minor ?? 0,
    totalMinor: invoice.total_minor ?? 0,
    amountPaidMinor: invoice.amount_paid_minor ?? 0,
    balanceMinor: invoice.balance_minor ?? invoice.total_minor ?? 0,
    notes: invoice.notes,
    paymentInstructions: invoice.payment_instructions,
    voidReason: invoice.void_reason,
  }
}
