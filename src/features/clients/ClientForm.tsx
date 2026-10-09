import type { ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AddressFields } from '@/components/AddressFields'
import { FormSection } from '@/components/layout/FormSection'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import type { Client } from '@/data/clients'
import type { BusinessSettings } from '@/data/settings'
import { CURRENCIES, currencyLabel } from '@/lib/currencies'
import { clientSchema, clientToForm, type ClientFormValues } from './client-form'

interface ClientFormProps {
  readonly client: Client | null
  readonly settings: BusinessSettings | null
  readonly submitLabel: string
  readonly onSubmit: (values: ClientFormValues) => Promise<void>
  readonly onCancel: () => void
}

export function ClientForm({ client, settings, submitLabel, onSubmit, onCancel }: ClientFormProps): ReactNode {
  const { register, handleSubmit, formState } = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: clientToForm(client),
  })
  const { errors, isSubmitting, isDirty } = formState
  const defaultTerms = settings?.default_payment_terms_days ?? 30
  const defaultCurrency = settings?.default_currency ?? 'USD'

  return (
    <form noValidate onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="flex flex-col gap-6">
      <FormSection title="Contact">
        <div className="grid gap-4 @lg:grid-cols-2">
          <Field label="Client name" required hint="Company or person, as it appears on the invoice." error={errors.name?.message} className="@lg:col-span-2">
            <Input autoComplete="off" {...register('name')} />
          </Field>
          <Field label="Contact name">
            <Input autoComplete="off" {...register('contact_name')} />
          </Field>
          <Field label="Email" hint="Invoices are addressed here." error={errors.email?.message}>
            <Input type="email" autoComplete="off" {...register('email')} />
          </Field>
          <Field label="CC emails" hint="Separate with commas." error={errors.cc_emails?.message}>
            <Input autoComplete="off" {...register('cc_emails')} />
          </Field>
          <Field label="Phone">
            <Input type="tel" autoComplete="off" {...register('phone')} />
          </Field>
          <Field label="Tax ID">
            <Input autoComplete="off" {...register('tax_id')} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Billing address">
        <AddressFields register={register} name="billing_address" />
      </FormSection>

      <FormSection title="Billing preferences" description="Leave blank to use your business defaults.">
        <div className="grid gap-4 @lg:grid-cols-2">
          <Field label="Payment terms (days)" error={errors.payment_terms_days?.message}>
            <Input inputMode="numeric" className="tabular" placeholder={`Default: Net ${defaultTerms}`} {...register('payment_terms_days')} />
          </Field>
          <Field label="Currency" error={errors.currency?.message}>
            <NativeSelect {...register('currency')}>
              <option value="">Default ({defaultCurrency})</option>
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {currencyLabel(code)}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <Field label="Private notes" hint="Only you see these. Not printed on invoices.">
          <Textarea rows={3} {...register('notes')} />
        </Field>
      </FormSection>

      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur md:-mx-10 md:px-10">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || (client !== null && !isDirty)}>
          {isSubmitting ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
