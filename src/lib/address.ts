import type { Json } from './database.types'

export interface Address {
  readonly line1: string
  readonly line2: string
  readonly city: string
  readonly region: string
  readonly postal_code: string
  readonly country: string
}

export const EMPTY_ADDRESS: Address = { line1: '', line2: '', city: '', region: '', postal_code: '', country: '' }

const KEYS = Object.keys(EMPTY_ADDRESS) as (keyof Address)[]

/** Reads the jsonb address column defensively; unknown keys are dropped. */
export function parseAddress(value: Json | null | undefined): Address {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return EMPTY_ADDRESS
  const result: Record<keyof Address, string> = { ...EMPTY_ADDRESS }
  for (const key of KEYS) {
    const field = value[key]
    if (typeof field === 'string') result[key] = field
  }
  return result
}

/** Trims every field; stored as jsonb. */
export function toAddressJson(address: Address): { [K in keyof Address]: string } {
  const result = { ...EMPTY_ADDRESS }
  for (const key of KEYS) result[key] = address[key].trim()
  return result
}

/** Lines for display: "City, Region Postal" collapsed, empty lines dropped. */
export function formatAddressLines(address: Address): string[] {
  const locality = [address.city, [address.region, address.postal_code].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ')
  return [address.line1, address.line2, locality, address.country].map((line) => line.trim()).filter(Boolean)
}
