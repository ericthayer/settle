import { describe, expect, it } from 'vitest'
import { computeTotals, formatMoney, lineAmountMinor, parseMoneyInput, toCurrencyCode } from './money'

const USD = toCurrencyCode('usd')
const JPY = toCurrencyCode('JPY')

describe('lineAmountMinor', () => {
  it('multiplies whole quantities', () => {
    expect(lineAmountMinor(3, 12_500)).toBe(37_500)
  })
  it('handles fractional hours without float drift', () => {
    expect(lineAmountMinor(1.5, 15_000)).toBe(22_500)
    expect(lineAmountMinor(0.333, 10_000)).toBe(3_330)
    expect(lineAmountMinor(1.005, 100)).toBe(101)
  })
  it('rounds half up to the cent', () => {
    expect(lineAmountMinor(0.125, 4)).toBe(1) // 0.5 -> 1
    expect(lineAmountMinor(0.001, 333)).toBe(0) // 0.333 -> 0
  })
  it('rejects negative or fractional prices', () => {
    expect(() => lineAmountMinor(1, -1)).toThrow(RangeError)
    expect(() => lineAmountMinor(1, 1.5)).toThrow(RangeError)
    expect(() => lineAmountMinor(-1, 100)).toThrow(RangeError)
  })
})

describe('computeTotals', () => {
  it('applies tax only to taxable lines', () => {
    const totals = computeTotals(
      [
        { quantity: 10, unitPriceMinor: 10_000, taxable: true },
        { quantity: 1, unitPriceMinor: 5_000, taxable: false },
      ],
      825,
    )
    expect(totals).toEqual({ subtotalMinor: 105_000, taxMinor: 8_250, totalMinor: 113_250 })
  })
  it('rounds tax half up', () => {
    // 1001 * 5% = 50.05 -> 50 ; 1010 * 5% = 50.5 -> 51
    expect(computeTotals([{ quantity: 1, unitPriceMinor: 1_001, taxable: true }], 500).taxMinor).toBe(50)
    expect(computeTotals([{ quantity: 1, unitPriceMinor: 1_010, taxable: true }], 500).taxMinor).toBe(51)
  })
  it('returns zeros for an empty invoice', () => {
    expect(computeTotals([], 825)).toEqual({ subtotalMinor: 0, taxMinor: 0, totalMinor: 0 })
  })
})

describe('formatMoney', () => {
  it('formats minor units by currency exponent', () => {
    expect(formatMoney({ minor: 123_456, currency: USD }, 'en-US')).toBe('$1,234.56')
    expect(formatMoney({ minor: 1_234, currency: JPY }, 'en-US')).toBe('¥1,234')
  })
})

describe('parseMoneyInput', () => {
  it('parses common inputs', () => {
    expect(parseMoneyInput('1,234.5', USD)).toBe(123_450)
    expect(parseMoneyInput('$12', USD)).toBe(1_200)
    expect(parseMoneyInput('.99', USD)).toBe(99)
    expect(parseMoneyInput('500', JPY)).toBe(500)
  })
  it('returns null for invalid input', () => {
    expect(parseMoneyInput('', USD)).toBeNull()
    expect(parseMoneyInput('12.345', USD)).toBeNull()
    expect(parseMoneyInput('abc', USD)).toBeNull()
    expect(parseMoneyInput('-5', USD)).toBeNull()
    expect(parseMoneyInput('5.5', JPY)).toBeNull()
  })
})
