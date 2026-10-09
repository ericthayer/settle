import type { InvoiceSummary, LineItem } from '@/data/invoices'
import { emptyLine, formToDraft, invoiceSchema, invoiceToForm, liveTotals, parsedLines, type InvoiceFormValues } from './invoice-form'

const base: InvoiceFormValues = {
  client_id: 'c1',
  currency: 'USD',
  tax_percent: '8.25',
  issue_date: '',
  due_date: '',
  notes: '',
  payment_instructions: '',
  lines: [
    { key: 'a', description: 'Design', quantity: '1.5', unit_price: '150', taxable: true },
    { key: 'b', description: 'Fonts', quantity: '1', unit_price: '50.00', taxable: false },
  ],
}

describe('invoice form', () => {
  it('computes live totals exactly like the database trigger', () => {
    // Same fixture as supabase/tests/invoice_lifecycle.test.sql: 27500 + round(22500 * 8.25%) = 29356.
    expect(liveTotals(base)).toEqual({ subtotalMinor: 27500, taxMinor: 1856, totalMinor: 29356 })
  })

  it('skips untouched rows instead of flagging them', () => {
    const values = { ...base, lines: [...base.lines, emptyLine()] }
    expect(invoiceSchema.safeParse(values).success).toBe(true)
    expect(parsedLines(values)).toHaveLength(2)
  })

  it('flags half-filled rows and a due date before the issue date', () => {
    const result = invoiceSchema.safeParse({
      ...base,
      issue_date: '2026-10-09',
      due_date: '2026-10-01',
      lines: [{ key: 'x', description: '', quantity: '0', unit_price: '12.345', taxable: true }],
    })
    const paths = result.error?.issues.map((i) => i.path.join('.'))
    expect(paths).toEqual(expect.arrayContaining(['due_date', 'lines.0.description', 'lines.0.quantity', 'lines.0.unit_price']))
  })

  it('maps to the save_invoice_draft payload', () => {
    const { invoice, lines } = formToDraft({ ...base, notes: '  Thanks ', issue_date: '2026-10-09' })
    expect(invoice).toEqual({
      client_id: 'c1',
      currency: 'USD',
      tax_rate_bps: 825,
      issue_date: '2026-10-09',
      due_date: null,
      notes: 'Thanks',
      payment_instructions: null,
    })
    expect(lines[0]).toEqual({ description: 'Design', quantity: 1.5, unit_price_minor: 15000, taxable: true })
  })

  it('round-trips stored rows, including JPY with no decimals', () => {
    const invoice = { client_id: 'c1', currency: 'JPY', tax_rate_bps: 1000, issue_date: null, due_date: null, notes: null, payment_instructions: null } as InvoiceSummary
    const lines = [{ id: 'l1', description: 'Workshop', quantity: 2, unit_price_minor: 50000, taxable: true }] as LineItem[]
    const values = invoiceToForm(invoice, lines)
    expect(values.lines[0]).toMatchObject({ quantity: '2', unit_price: '50000' })
    expect(formToDraft(values).lines[0]?.unit_price_minor).toBe(50000)
  })

  it('gives an empty draft one blank row to type into', () => {
    const values = invoiceToForm({ currency: 'USD', tax_rate_bps: 0 } as InvoiceSummary, [])
    expect(values.lines).toHaveLength(1)
  })
})
