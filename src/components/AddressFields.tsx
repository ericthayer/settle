import type { ReactNode } from 'react'
import type { FieldValues, Path, UseFormRegister } from 'react-hook-form'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

interface AddressFieldsProps<T extends FieldValues> {
  readonly register: UseFormRegister<T>
  /** Form path of the address object, e.g. "address" or "billing_address". */
  readonly name: string
}

/** Postal address inputs bound to `${name}.line1` etc. */
export function AddressFields<T extends FieldValues>({ register, name }: AddressFieldsProps<T>): ReactNode {
  const path = (key: string): Path<T> => `${name}.${key}` as Path<T>
  return (
    <div className="@container"><div className="grid gap-4 @lg:grid-cols-2">
      <Field label="Street address" className="@lg:col-span-2">
        <Input autoComplete="address-line1" {...register(path('line1'))} />
      </Field>
      <Field label="Apartment, suite, etc." className="@lg:col-span-2">
        <Input autoComplete="address-line2" {...register(path('line2'))} />
      </Field>
      <Field label="City">
        <Input autoComplete="address-level2" {...register(path('city'))} />
      </Field>
      <Field label="State / region">
        <Input autoComplete="address-level1" {...register(path('region'))} />
      </Field>
      <Field label="Postal code">
        <Input autoComplete="postal-code" {...register(path('postal_code'))} />
      </Field>
      <Field label="Country">
        <Input autoComplete="country-name" {...register(path('country'))} />
      </Field>
    </div></div>
  )
}
