/** Currencies offered in pickers; the database accepts any ISO 4217 code. */
export const CURRENCIES = ['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'NZD', 'CHF', 'JPY', 'MXN'] as const

export function currencyLabel(code: string, locale?: string): string {
  try {
    const name = new Intl.DisplayNames(locale ? [locale] : undefined, { type: 'currency' }).of(code)
    return name ? `${code} · ${name}` : code
  } catch {
    return code
  }
}

/** IANA zones for the picker. Chrome omits "UTC" from supportedValuesOf, so it and `current` are always included. */
export function timeZones(current?: string): string[] {
  const zones = new Set(typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [])
  zones.add('UTC')
  if (current) zones.add(current)
  return [...zones].sort()
}

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}
