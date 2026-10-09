import type { KeyboardEvent, ReactNode } from 'react'
import { useFieldArray, useWatch, type UseFormReturn } from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatMoney, lineAmountMinor, parseMoneyInput, toCurrencyCode } from '@/lib/money'
import { emptyLine, type InvoiceFormValues } from './invoice-form'

interface LineItemsEditorProps {
  readonly form: UseFormReturn<InvoiceFormValues>
}

const ROW = '@2xl:grid-cols-[minmax(0,1fr)_6rem_8rem_4.5rem_8rem_2.5rem] @2xl:items-start'

/** Keyboard-first line grid: Enter on a row's last field adds a row and moves to it. */
export function LineItemsEditor({ form }: LineItemsEditorProps): ReactNode {
  const { control, register, formState, setFocus } = form
  const { fields, append, remove } = useFieldArray({ control, name: 'lines', keyName: 'fieldKey' })
  const [lines, currency] = useWatch({ control, name: ['lines', 'currency'] })
  const errors = formState.errors.lines

  function addRow(): void {
    append(emptyLine())
    // Focus after React commits the new row.
    requestAnimationFrame(() => setFocus(`lines.${fields.length}.description`))
  }

  function onRowKeyDown(event: KeyboardEvent<HTMLInputElement>, index: number): void {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    if (index === fields.length - 1) addRow()
    else setFocus(`lines.${index + 1}.description`)
  }

  function amountFor(index: number): string {
    const line = lines[index]
    if (!line || !/^[A-Z]{3}$/.test(currency)) return '—'
    const code = toCurrencyCode(currency)
    const price = parseMoneyInput(line.unit_price, code)
    const qty = Number(line.quantity)
    if (price === null || !Number.isFinite(qty) || qty <= 0) return '—'
    try {
      return formatMoney({ minor: lineAmountMinor(Math.round(qty * 1000) / 1000, price), currency: code })
    } catch {
      return '—'
    }
  }

  return (
    <div className="@container">
      <div aria-hidden="true" className={`hidden gap-3 px-1 pb-2 text-xs font-medium uppercase tracking-wide text-ink-muted @2xl:grid ${ROW}`}>
        <span>Description</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Unit price</span>
        <span className="text-center">Tax</span>
        <span className="text-right">Amount</span>
        <span />
      </div>
      <ol className="flex flex-col gap-3" aria-label="Line items">
        {fields.map((field, index) => {
          const err = errors?.[index]
          const n = index + 1
          return (
            <li key={field.fieldKey} className={`grid grid-cols-2 gap-3 rounded-md border border-line p-3 @2xl:border-0 @2xl:p-1 ${ROW}`}>
              <div className="col-span-2 @2xl:col-span-1">
                <Input
                  aria-label={`Line ${n} description`}
                  aria-invalid={err?.description ? true : undefined}
                  placeholder="Description"
                  {...register(`lines.${index}.description`)}
                  onKeyDown={(e) => onRowKeyDown(e, index)}
                />
                {err?.description ? <p className="mt-1 text-xs text-danger">{err.description.message}</p> : null}
              </div>
              <div>
                <Input
                  aria-label={`Line ${n} quantity`}
                  aria-invalid={err?.quantity ? true : undefined}
                  inputMode="decimal"
                  className="tabular text-right"
                  {...register(`lines.${index}.quantity`)}
                  onKeyDown={(e) => onRowKeyDown(e, index)}
                />
                {err?.quantity ? <p className="mt-1 text-xs text-danger">{err.quantity.message}</p> : null}
              </div>
              <div>
                <Input
                  aria-label={`Line ${n} unit price`}
                  aria-invalid={err?.unit_price ? true : undefined}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="tabular text-right"
                  {...register(`lines.${index}.unit_price`)}
                  onKeyDown={(e) => onRowKeyDown(e, index)}
                />
                {err?.unit_price ? <p className="mt-1 text-xs text-danger">{err.unit_price.message}</p> : null}
              </div>
              <label className="flex h-10 items-center gap-2 text-sm @2xl:justify-center">
                <input type="checkbox" aria-label={`Line ${n} taxable`} className="size-4 accent-accent" {...register(`lines.${index}.taxable`)} />
                <span aria-hidden="true" className="@2xl:hidden">
                  Taxable
                </span>
              </label>
              <output className="tabular flex h-10 items-center justify-end text-sm" aria-label={`Line ${n} amount`}>
                {amountFor(index)}
              </output>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove line ${n}`}
                  disabled={fields.length === 1}
                  onClick={() => remove(index)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            </li>
          )
        })}
      </ol>
      <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={addRow}>
        <Plus aria-hidden="true" />
        Add line
      </Button>
      <p className="mt-2 text-xs text-ink-muted">Press Enter in a row to add the next line.</p>
    </div>
  )
}
