import { z } from 'zod'
import type { PaymentMethod } from '@/data/payments'
import { isIsoDate } from '@/lib/dates'
import { parseMoneyInput, type CurrencyCode } from '@/lib/money'

const METHODS = ['bank_transfer', 'ach', 'check', 'cash', 'card', 'zelle', 'paypal', 'other'] as const satisfies readonly PaymentMethod[]

/** Amount is validated against the open balance here; record_payment enforces it again under a row lock. */
export function paymentSchema(currency: CurrencyCode, balanceMinor: number, formatBalance: string) {
  return z.object({
    amount: z.string().superRefine((value, ctx) => {
      const minor = parseMoneyInput(value, currency)
      if (minor === null || minor <= 0) ctx.addIssue({ code: 'custom', message: 'Enter an amount above zero.' })
      else if (minor > balanceMinor) ctx.addIssue({ code: 'custom', message: `That’s more than the ${formatBalance} still owed.` })
    }),
    paid_on: z.string().refine(isIsoDate, 'Enter the date you were paid.'),
    method: z.enum(METHODS),
    reference: z.string().max(200),
    note: z.string().max(1000),
  })
}

export type PaymentFormValues = z.infer<ReturnType<typeof paymentSchema>>
