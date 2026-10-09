import { useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Dialog } from 'radix-ui'
import { Banknote } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { PAYMENT_METHODS, useRecordPayment } from '@/data/payments'
import { friendlyDbError } from '@/lib/db-errors'
import { currencyFractionDigits, formatMoney, parseMoneyInput, type CurrencyCode } from '@/lib/money'
import { paymentSchema, type PaymentFormValues } from './payment-form'

interface RecordPaymentDialogProps {
  readonly invoiceId: string
  readonly clientId: string
  readonly number: string
  readonly currency: CurrencyCode
  readonly balanceMinor: number
  /** Owner's today, so "paid on" defaults to their calendar day. */
  readonly today: string
  readonly size?: 'sm' | 'md'
}

export function RecordPaymentDialog(props: RecordPaymentDialogProps): ReactNode {
  const [open, setOpen] = useState(false)
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button size={props.size}>
          <Banknote aria-hidden="true" />
          Record payment
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-ink/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 max-h-[calc(100dvh-2rem)] w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-md border border-line bg-surface p-6 shadow-lg">
          <Dialog.Title className="mb-1 font-medium">Record payment for {props.number}</Dialog.Title>
          <Dialog.Description className="mb-5 text-sm text-ink-muted">
            {formatMoney({ minor: props.balanceMinor, currency: props.currency })} is still owed.
          </Dialog.Description>
          {/* Mounted only while open, so every opening starts from the current balance. */}
          {open ? <PaymentForm {...props} onDone={() => setOpen(false)} /> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function PaymentForm({ invoiceId, clientId, currency, balanceMinor, today, onDone }: RecordPaymentDialogProps & { readonly onDone: () => void }): ReactNode {
  const record = useRecordPayment()
  const digits = currencyFractionDigits(currency)
  const balanceLabel = formatMoney({ minor: balanceMinor, currency })
  const { register, handleSubmit, formState, setValue } = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema(currency, balanceMinor, balanceLabel)),
    defaultValues: { amount: (balanceMinor / 10 ** digits).toFixed(digits), paid_on: today, method: 'bank_transfer', reference: '', note: '' },
  })
  const { errors, isSubmitting } = formState

  async function onSubmit(values: PaymentFormValues): Promise<void> {
    const amountMinor = parseMoneyInput(values.amount, currency)
    if (amountMinor === null) return
    try {
      await record.mutateAsync({ invoiceId, clientId, amountMinor, paidOn: values.paid_on, method: values.method, reference: values.reference, note: values.note })
      toast.success(amountMinor === balanceMinor ? 'Paid in full' : `${formatMoney({ minor: amountMinor, currency })} recorded`)
      onDone()
    } catch (err) {
      toast.error(friendlyDbError(err))
    }
  }

  return (
    <form noValidate onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Field label="Amount" required error={errors.amount?.message}>
            <Input inputMode="decimal" className="tabular" autoFocus {...register('amount')} />
          </Field>
          <button
            type="button"
            className="self-start text-xs text-accent underline underline-offset-4"
            onClick={() => setValue('amount', (balanceMinor / 10 ** digits).toFixed(digits), { shouldValidate: true })}
          >
            Use full balance ({balanceLabel})
          </button>
        </div>
        <Field label="Paid on" required error={errors.paid_on?.message}>
          <Input type="date" {...register('paid_on')} />
        </Field>
      </div>
      <Field label="Method" error={errors.method?.message}>
        <NativeSelect {...register('method')}>
          {PAYMENT_METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Reference" hint="Check number, transfer ID or similar." error={errors.reference?.message}>
        <Input autoComplete="off" {...register('reference')} />
      </Field>
      <Field label="Note" error={errors.note?.message}>
        <Input autoComplete="off" {...register('note')} />
      </Field>
      <div className="mt-2 flex justify-end gap-2">
        <Dialog.Close asChild>
          <Button type="button" variant="secondary">
            Cancel
          </Button>
        </Dialog.Close>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Record payment'}
        </Button>
      </div>
    </form>
  )
}
