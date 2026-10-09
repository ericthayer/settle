import { z } from 'zod'
import type { Client, ClientInput } from '@/data/clients'
import { EMPTY_ADDRESS, parseAddress, toAddressJson } from '@/lib/address'
import { addressSchema, nullIfBlank, optionalEmail, optionalWholeNumberIn } from '@/lib/form-rules'

export const clientSchema = z.object({
  name: z.string().trim().min(1, 'Client name is required.'),
  contact_name: z.string(),
  email: optionalEmail,
  cc_emails: z
    .string()
    .refine(
      (v) => splitEmails(v).every((e) => z.email().safeParse(e).success),
      'Separate addresses with commas, and check each one.',
    ),
  phone: z.string(),
  tax_id: z.string(),
  billing_address: addressSchema,
  /** '' = use the business default. */
  payment_terms_days: optionalWholeNumberIn(0, 365, 'Enter 0 to 365 days, or leave blank for the default.'),
  currency: z.string().refine((v) => v === '' || /^[A-Z]{3}$/.test(v), 'Choose a currency.'),
  notes: z.string(),
})

export type ClientFormValues = z.infer<typeof clientSchema>

export function splitEmails(value: string): string[] {
  return value
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter(Boolean)
}

export function clientToForm(row: Client | null | undefined): ClientFormValues {
  return {
    name: row?.name ?? '',
    contact_name: row?.contact_name ?? '',
    email: row?.email ?? '',
    cc_emails: row?.cc_emails.join(', ') ?? '',
    phone: row?.phone ?? '',
    tax_id: row?.tax_id ?? '',
    billing_address: row ? parseAddress(row.billing_address) : EMPTY_ADDRESS,
    payment_terms_days: row?.payment_terms_days == null ? '' : String(row.payment_terms_days),
    currency: row?.currency ?? '',
    notes: row?.notes ?? '',
  }
}

export function formToClient(values: ClientFormValues): ClientInput {
  const terms = values.payment_terms_days.trim()
  return {
    name: values.name.trim(),
    contact_name: nullIfBlank(values.contact_name),
    email: nullIfBlank(values.email),
    cc_emails: splitEmails(values.cc_emails),
    phone: nullIfBlank(values.phone),
    tax_id: nullIfBlank(values.tax_id),
    billing_address: toAddressJson(values.billing_address),
    payment_terms_days: terms === '' ? null : Number(terms),
    currency: values.currency === '' ? null : values.currency,
    notes: nullIfBlank(values.notes),
  }
}
