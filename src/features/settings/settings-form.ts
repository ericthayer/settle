import { z } from 'zod'
import type { BusinessSettings, BusinessSettingsInput } from '@/data/settings'
import { EMPTY_ADDRESS, parseAddress, toAddressJson } from '@/lib/address'
import { browserTimeZone } from '@/lib/currencies'
import { addressSchema, nullIfBlank, optionalEmail, taxPercent, wholeNumberIn } from '@/lib/form-rules'
import { bpsToPercentInput, percentInputToBps } from '@/lib/rates'

/** next_invoice_number is a Postgres int and issue_invoice adds 1, so stay well under 2^31. */
export const MAX_NEXT_INVOICE_NUMBER = 999_999_999

export function settingsSchema(minNextNumber: number) {
  return z.object({
    business_name: z.string().trim().min(1, 'Business name is required.'),
    email: optionalEmail,
    phone: z.string(),
    website: z.string(),
    tax_id: z.string(),
    address: addressSchema,
    timezone: z.string().min(1, 'Choose a time zone.'),
    default_currency: z.string().regex(/^[A-Z]{3}$/, 'Choose a currency.'),
    default_payment_terms_days: wholeNumberIn(0, 365, 'Enter 0 to 365 days.'),
    default_tax_percent: taxPercent,
    invoice_prefix: z.string().max(20, 'Keep the prefix to 20 characters or fewer.'),
    invoice_number_width: wholeNumberIn(1, 10, 'Enter 1 to 10 digits.'),
    next_invoice_number: wholeNumberIn(
      minNextNumber,
      MAX_NEXT_INVOICE_NUMBER,
      minNextNumber > 1 ? `Numbers only move forward. Use ${minNextNumber} or higher.` : 'Enter a whole number of 1 or more.',
    ),
    payment_instructions: z.string(),
    default_notes: z.string(),
  })
}

export type SettingsFormValues = z.infer<ReturnType<typeof settingsSchema>>

export function settingsToForm(row: BusinessSettings | null): SettingsFormValues {
  return {
    business_name: row?.business_name ?? '',
    email: row?.email ?? '',
    phone: row?.phone ?? '',
    website: row?.website ?? '',
    tax_id: row?.tax_id ?? '',
    address: row ? parseAddress(row.address) : EMPTY_ADDRESS,
    timezone: row?.timezone ?? browserTimeZone(),
    default_currency: row?.default_currency ?? 'USD',
    default_payment_terms_days: String(row?.default_payment_terms_days ?? 30),
    default_tax_percent: bpsToPercentInput(row?.default_tax_rate_bps ?? 0),
    invoice_prefix: row?.invoice_prefix ?? 'INV-',
    invoice_number_width: String(row?.invoice_number_width ?? 4),
    next_invoice_number: String(row?.next_invoice_number ?? 1),
    payment_instructions: row?.payment_instructions ?? '',
    default_notes: row?.default_notes ?? '',
  }
}

export function formToSettings(values: SettingsFormValues): BusinessSettingsInput {
  return {
    business_name: values.business_name.trim(),
    email: nullIfBlank(values.email),
    phone: nullIfBlank(values.phone),
    website: nullIfBlank(values.website),
    tax_id: nullIfBlank(values.tax_id),
    address: toAddressJson(values.address),
    timezone: values.timezone,
    default_currency: values.default_currency,
    default_payment_terms_days: Number(values.default_payment_terms_days),
    default_tax_rate_bps: percentInputToBps(values.default_tax_percent) ?? 0,
    invoice_prefix: values.invoice_prefix,
    invoice_number_width: Number(values.invoice_number_width),
    next_invoice_number: Number(values.next_invoice_number),
    payment_instructions: nullIfBlank(values.payment_instructions),
    default_notes: nullIfBlank(values.default_notes),
  }
}

/** Preview of the next issued number, e.g. "INV-0042". */
export function previewInvoiceNumber(prefix: string, width: string, next: string): string {
  const n = /^\d+$/.test(next) ? next : '1'
  const w = /^\d+$/.test(width) ? Math.min(Number(width), 10) : 4
  return `${prefix}${n.padStart(w, '0')}`
}
