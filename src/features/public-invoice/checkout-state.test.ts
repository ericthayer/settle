import type { InvoiceDocumentModel } from '@/components/invoice-document/document-model'
import { canPayOnline, checkoutNotice, checkoutReturn } from './checkout-state'

function model(status: InvoiceDocumentModel['status'], balanceMinor: number): InvoiceDocumentModel {
  return { status, balanceMinor } as InvoiceDocumentModel
}

describe('canPayOnline', () => {
  it('offers card payment while an issued invoice has a balance', () => {
    expect(canPayOnline(model('sent', 100))).toBe(true)
    expect(canPayOnline(model('partially_paid', 100))).toBe(true)
    expect(canPayOnline(model('overdue', 100))).toBe(true)
  })

  it('hides it once paid, voided, or with nothing due', () => {
    expect(canPayOnline(model('paid', 0))).toBe(false)
    expect(canPayOnline(model('void', 100))).toBe(false)
    expect(canPayOnline(model('draft', 100))).toBe(false)
    expect(canPayOnline(model('sent', 0))).toBe(false)
  })
})

describe('checkoutNotice', () => {
  it('reads only the two return values Settle sends Stripe', () => {
    expect(checkoutReturn('success')).toBe('success')
    expect(checkoutReturn('cancelled')).toBe('cancelled')
    expect(checkoutReturn('paid')).toBeNull()
    expect(checkoutReturn(null)).toBeNull()
  })

  it('says processing until the webhook marks the invoice paid', () => {
    expect(checkoutNotice('success', model('sent', 100), true).kind).toBe('processing')
    expect(checkoutNotice('success', model('sent', 100), false).kind).toBe('delayed')
    expect(checkoutNotice('success', model('paid', 0), true).kind).toBe('paid')
  })

  it('confirms a cancelled checkout only while there is still something to pay', () => {
    expect(checkoutNotice('cancelled', model('sent', 100), true).kind).toBe('cancelled')
    expect(checkoutNotice('cancelled', model('paid', 0), true).kind).toBe('none')
  })

  it('stays quiet on a plain visit or before the invoice loads', () => {
    expect(checkoutNotice(null, model('sent', 100), true).kind).toBe('none')
    expect(checkoutNotice('success', null, true).kind).toBe('none')
  })
})
