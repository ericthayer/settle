import { useEffect, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { AddressFields } from '@/components/AddressFields'
import { FormSection } from '@/components/layout/FormSection'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth/auth-context'
import { useBusinessSettings, useSaveBusinessSettings, type BusinessSettings } from '@/data/settings'
import { CURRENCIES, currencyLabel, timeZones } from '@/lib/currencies'
import { formToSettings, previewInvoiceNumber, settingsSchema, settingsToForm, type SettingsFormValues } from './settings-form'
import { LogoField } from './LogoField'

export function SettingsPage(): ReactNode {
  const settings = useBusinessSettings()

  if (settings.isPending) {
    return (
      <p role="status" className="text-sm text-ink-muted">
        Loading…
      </p>
    )
  }
  if (settings.isError) {
    return (
      <p role="alert" className="text-sm text-danger">
        Couldn’t load settings: {settings.error.message}
      </p>
    )
  }
  return <SettingsForm settings={settings.data} />
}

function SettingsForm({ settings }: { readonly settings: BusinessSettings | null }): ReactNode {
  const { state } = useAuth()
  const navigate = useNavigate()
  const save = useSaveBusinessSettings()
  const firstRun = settings === null
  const minNext = settings?.next_invoice_number ?? 1

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema(minNext)),
    defaultValues: settingsToForm(settings),
  })
  const { register, handleSubmit, formState, reset, control } = form
  const { errors, isDirty, isSubmitting } = formState

  // Re-baseline after a save so isDirty reflects the stored row.
  useEffect(() => {
    // keepDirtyValues: a logo upload refreshes the row without wiping unsaved edits.
    if (settings) reset(settingsToForm(settings), { keepDirtyValues: true })
  }, [settings, reset])

  const [prefix, width, next] = useWatch({ control, name: ['invoice_prefix', 'invoice_number_width', 'next_invoice_number'] })

  async function onSubmit(values: SettingsFormValues): Promise<void> {
    try {
      const row = await save.mutateAsync(formToSettings(values))
      reset(settingsToForm(row))
      if (firstRun) {
        toast.success('You’re set up. Add your first client.')
        void navigate('/clients/new')
      } else {
        toast.success('Settings saved')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Couldn’t save settings')
    }
  }

  const defaultTimezone = form.formState.defaultValues?.timezone
  const ownerId = state.status === 'signed-in' ? state.session.user.id : ''

  return (
    <>
      <PageHeader title={firstRun ? 'Set up your business' : 'Settings'} />
      {firstRun ? (
        <p className="-mt-4 mb-8 max-w-prose text-sm text-ink-muted">
          These details appear on every invoice. Only the business name is required, and you can change any of it later.
        </p>
      ) : null}

      <form noValidate onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="flex flex-col gap-6 pb-24">
        <FormSection title="Business">
          <div className="grid gap-4 @lg:grid-cols-2">
            <Field label="Business name" required error={errors.business_name?.message} className="@lg:col-span-2">
              <Input autoComplete="organization" {...register('business_name')} />
            </Field>
            <Field label="Email" error={errors.email?.message}>
              <Input type="email" autoComplete="email" {...register('email')} />
            </Field>
            <Field label="Phone">
              <Input type="tel" autoComplete="tel" {...register('phone')} />
            </Field>
            <Field label="Website">
              <Input type="url" autoComplete="url" placeholder="example.com" {...register('website')} />
            </Field>
            <Field label="Tax ID" hint="EIN, VAT or GST number, shown on invoices.">
              <Input {...register('tax_id')} />
            </Field>
          </div>
          <LogoField ownerId={ownerId} settings={settings} />
        </FormSection>

        <FormSection title="Address">
          <AddressFields register={register} name="address" />
        </FormSection>

        <FormSection title="Invoice defaults" description="New invoices start with these. Each client can override terms and currency.">
          <div className="grid gap-4 @lg:grid-cols-2">
            <Field label="Currency" error={errors.default_currency?.message}>
              <NativeSelect {...register('default_currency')}>
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {currencyLabel(code)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Time zone" hint="Decides when an invoice becomes overdue." error={errors.timezone?.message}>
              <NativeSelect {...register('timezone')}>
                {timeZones(settings?.timezone ?? defaultTimezone).map((tz) => (
                  <option key={tz} value={tz}>
                    {tz.replaceAll('_', ' ')}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Payment terms (days)" hint="Net 30 means due 30 days after issue." error={errors.default_payment_terms_days?.message}>
              <Input inputMode="numeric" className="tabular" {...register('default_payment_terms_days')} />
            </Field>
            <Field label="Tax rate (%)" hint="Use 0 if you don’t charge tax." error={errors.default_tax_percent?.message}>
              <Input inputMode="decimal" className="tabular" {...register('default_tax_percent')} />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Numbering" description="Numbers are assigned when an invoice is issued, never reused, and only move forward.">
          <div className="grid gap-4 @lg:grid-cols-3">
            <Field label="Prefix" error={errors.invoice_prefix?.message}>
              <Input {...register('invoice_prefix')} />
            </Field>
            <Field label="Digits" error={errors.invoice_number_width?.message}>
              <Input inputMode="numeric" className="tabular" {...register('invoice_number_width')} />
            </Field>
            <Field label="Next number" error={errors.next_invoice_number?.message}>
              <Input inputMode="numeric" className="tabular" {...register('next_invoice_number')} />
            </Field>
          </div>
          <p className="text-sm text-ink-muted" aria-live="polite">
            Next invoice: <span className="tabular font-medium text-ink">{previewInvoiceNumber(prefix, width, next)}</span>
          </p>
        </FormSection>

        <FormSection title="Payment details">
          <Field label="Payment instructions" hint="Bank details, Zelle, or how to pay. Printed in the invoice footer.">
            <Textarea rows={4} {...register('payment_instructions')} />
          </Field>
          <Field label="Default notes" hint="A thank-you or terms line added to new invoices.">
            <Textarea rows={3} {...register('default_notes')} />
          </Field>
        </FormSection>

        <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur md:-mx-10 md:px-10">
          {!firstRun && isDirty ? (
            <Button type="button" variant="ghost" onClick={() => reset()}>
              Discard changes
            </Button>
          ) : null}
          <Button type="submit" disabled={isSubmitting || (!firstRun && !isDirty)}>
            {isSubmitting ? 'Saving…' : firstRun ? 'Save and continue' : 'Save changes'}
          </Button>
        </div>
      </form>
    </>
  )
}
