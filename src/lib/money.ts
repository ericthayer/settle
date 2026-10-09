/**
 * Money is always integer minor units (cents) plus an ISO 4217 code.
 * Totals here must match the SQL in supabase/migrations exactly:
 *   line amount = round(quantity * unit_price_minor)
 *   tax         = round(taxable_subtotal * tax_rate_bps / 10000)
 * Both round half away from zero; inputs are non-negative, so half-up.
 */

export type CurrencyCode = string & { readonly __brand: 'CurrencyCode' }

export interface Money {
  readonly minor: number
  readonly currency: CurrencyCode
}

export interface LineInput {
  /** Up to 3 decimal places (numeric(12,3) in the database). */
  readonly quantity: number
  readonly unitPriceMinor: number
  readonly taxable: boolean
}

export interface InvoiceTotals {
  readonly subtotalMinor: number
  readonly taxMinor: number
  readonly totalMinor: number
}

const QTY_SCALE = 1000
const BPS_SCALE = 10_000

export function toCurrencyCode(value: string): CurrencyCode {
  const code = value.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(code)) throw new RangeError(`Invalid currency code: ${value}`)
  return code as CurrencyCode
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer, got ${value}`)
  }
}

/** Integer division rounding half up, for non-negative operands. */
function divRoundHalfUp(numerator: number, denominator: number): number {
  return Math.floor((numerator + denominator / 2) / denominator)
}

export function lineAmountMinor(quantity: number, unitPriceMinor: number): number {
  assertNonNegativeInteger(unitPriceMinor, 'unitPriceMinor')
  const scaledQty = Math.round(quantity * QTY_SCALE)
  assertNonNegativeInteger(scaledQty, 'quantity')
  return divRoundHalfUp(scaledQty * unitPriceMinor, QTY_SCALE)
}

export function computeTotals(lines: readonly LineInput[], taxRateBps: number): InvoiceTotals {
  assertNonNegativeInteger(taxRateBps, 'taxRateBps')
  let subtotalMinor = 0
  let taxableMinor = 0
  for (const line of lines) {
    const amount = lineAmountMinor(line.quantity, line.unitPriceMinor)
    subtotalMinor += amount
    if (line.taxable) taxableMinor += amount
  }
  const taxMinor = divRoundHalfUp(taxableMinor * taxRateBps, BPS_SCALE)
  return { subtotalMinor, taxMinor, totalMinor: subtotalMinor + taxMinor }
}

export function currencyFractionDigits(currency: CurrencyCode): number {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions()
    .maximumFractionDigits ?? 2
}

export function formatMoney(money: Money, locale?: string): string {
  const digits = currencyFractionDigits(money.currency)
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: money.currency,
  }).format(money.minor / 10 ** digits)
}

/**
 * Parses user input like "1,234.5" or "$12" into minor units.
 * Returns null for empty or invalid input; never guesses.
 */
export function parseMoneyInput(input: string, currency: CurrencyCode): number | null {
  const cleaned = input.replace(/[\s,$€£¥]/g, '')
  if (cleaned === '') return null
  const digits = currencyFractionDigits(currency)
  const pattern = digits === 0 ? /^\d+$/ : new RegExp(`^\\d+(\\.\\d{0,${digits}})?$|^\\.\\d{1,${digits}}$`)
  if (!pattern.test(cleaned)) return null
  const [whole = '0', fraction = ''] = cleaned.split('.')
  const minor = Number(whole || '0') * 10 ** digits + Number(fraction.padEnd(digits, '0') || '0')
  return Number.isSafeInteger(minor) ? minor : null
}
