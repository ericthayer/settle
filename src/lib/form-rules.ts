import { z } from 'zod'
import { percentInputToBps } from './rates'

/** Shared string rules: forms keep raw strings, mappers convert on submit. */
export const optionalEmail = z
  .string()
  .trim()
  .refine((v) => v === '' || z.email().safeParse(v).success, 'Enter a valid email address.')

export const wholeNumberIn = (min: number, max: number, message: string) =>
  z
    .string()
    .trim()
    .refine((v) => /^\d+$/.test(v) && Number(v) >= min && Number(v) <= max, message)

export const optionalWholeNumberIn = (min: number, max: number, message: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) >= min && Number(v) <= max), message)

export const taxPercent = z
  .string()
  .refine((v) => percentInputToBps(v) !== null, 'Enter a rate between 0 and 100, up to two decimals.')

export const addressSchema = z.object({
  line1: z.string(),
  line2: z.string(),
  city: z.string(),
  region: z.string(),
  postal_code: z.string(),
  country: z.string(),
})

/** '' -> null after trimming, for nullable text columns. */
export function nullIfBlank(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}
