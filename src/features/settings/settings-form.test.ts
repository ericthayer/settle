import type { BusinessSettings } from '@/data/settings'
import { formToSettings, previewInvoiceNumber, settingsSchema, settingsToForm } from './settings-form'

const row = {
  business_name: 'Thayer Design',
  email: 'hi@example.com',
  phone: null,
  website: null,
  tax_id: null,
  address: { line1: '1 Main St', city: 'Portland' },
  timezone: 'America/Los_Angeles',
  default_currency: 'USD',
  default_payment_terms_days: 30,
  default_tax_rate_bps: 825,
  invoice_prefix: 'INV-',
  invoice_number_width: 4,
  next_invoice_number: 42,
  payment_instructions: null,
  default_notes: null,
  logo_path: null,
} as unknown as BusinessSettings

describe('settings form', () => {
  it('round-trips a stored row', () => {
    const values = settingsToForm(row)
    expect(values.default_tax_percent).toBe('8.25')
    const out = formToSettings(values)
    expect(out).toMatchObject({ business_name: 'Thayer Design', default_tax_rate_bps: 825, next_invoice_number: 42, phone: null })
    expect(out.address).toEqual({ line1: '1 Main St', line2: '', city: 'Portland', region: '', postal_code: '', country: '' })
  })

  it('starts first run with Net 30, USD and the browser time zone', () => {
    const values = settingsToForm(null)
    expect(values).toMatchObject({ default_currency: 'USD', default_payment_terms_days: '30', next_invoice_number: '1' })
    expect(values.timezone).not.toBe('')
  })

  it('only lets the next number move forward', () => {
    const schema = settingsSchema(42)
    expect(schema.safeParse({ ...settingsToForm(row), next_invoice_number: '41' }).success).toBe(false)
    expect(schema.safeParse({ ...settingsToForm(row), next_invoice_number: '42' }).success).toBe(true)
  })

  it('rejects a blank name, bad email and out-of-range tax', () => {
    const result = settingsSchema(1).safeParse({ ...settingsToForm(null), business_name: '  ', email: 'nope', default_tax_percent: '101' })
    expect(result.success).toBe(false)
    const paths = result.error?.issues.map((i) => i.path.join('.'))
    expect(paths).toEqual(expect.arrayContaining(['business_name', 'email', 'default_tax_percent']))
  })

  it('previews the next invoice number', () => {
    expect(previewInvoiceNumber('INV-', '4', '42')).toBe('INV-0042')
    expect(previewInvoiceNumber('', '1', '7')).toBe('7')
  })
})

describe('next number ceiling', () => {
  it('stays below the int range issue_invoice increments into', async () => {
    const { MAX_NEXT_INVOICE_NUMBER } = await import('./settings-form')
    const schema = settingsSchema(1)
    expect(schema.safeParse({ ...settingsToForm(row), next_invoice_number: String(MAX_NEXT_INVOICE_NUMBER) }).success).toBe(true)
    expect(schema.safeParse({ ...settingsToForm(row), next_invoice_number: '2147483647' }).success).toBe(false)
  })
})
