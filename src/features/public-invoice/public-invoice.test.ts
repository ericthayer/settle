import { toPublicDocumentModel } from './public-invoice'

describe('toPublicDocumentModel', () => {
  it('maps the get_public_invoice payload onto the printable model', () => {
    const model = toPublicDocumentModel({
      invoice: {
        number: 'INV-0001', lifecycle: 'issued', status: 'partially_paid', issue_date: '2026-10-09', due_date: '2026-11-08',
        currency: 'USD', tax_rate_bps: 825, subtotal_minor: 379998, tax_minor: 31350, total_minor: 411348,
        amount_paid_minor: 100000, balance_minor: 311348, notes: null, payment_instructions: 'ACH',
        bill_to: { name: 'Acme', contact_name: 'Ada', email: 'ap@acme.com' },
        bill_from: { business_name: 'Thayer Design', logo_path: 'owner/logo.png' }, void_reason: null,
      },
      lines: [{ position: 0, description: 'Design sprint', quantity: 3, unit_price_minor: 125000, amount_minor: 375000, taxable: true }],
    })
    expect(model?.number).toBe('INV-0001')
    expect(model?.status).toBe('partially_paid')
    expect(model?.from.name).toBe('Thayer Design')
    expect(model?.to.contactName).toBe('Ada')
    expect(model?.logoPath).toBe('owner/logo.png')
    expect(model?.balanceMinor).toBe(311348)
    expect(model?.lines).toEqual([{ id: '0', description: 'Design sprint', quantity: 3, unitPriceMinor: 125000, amountMinor: 375000, taxable: true }])
  })

  it('returns null for an unknown or withdrawn link', () => {
    expect(toPublicDocumentModel(null)).toBeNull()
    expect(toPublicDocumentModel({})).toBeNull()
  })
})
