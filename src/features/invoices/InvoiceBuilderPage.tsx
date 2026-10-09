import type { ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { Eye, Send, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { FormSection } from '@/components/layout/FormSection'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { useClients, type Client } from '@/data/clients'
import { useDeleteDraft, useInvoice, useInvoiceLifecycle, type InvoiceDetail } from '@/data/invoices'
import { useBusinessSettings, type BusinessSettings } from '@/data/settings'
import { CURRENCIES, currencyLabel } from '@/lib/currencies'
import { formatDate } from '@/lib/dates'
import { friendlyDbError } from '@/lib/db-errors'
import { toCurrencyCode } from '@/lib/money'
import { NotFoundPage } from '@/routes/NotFoundPage'
import { invoiceSchema, invoiceToForm, liveTotals, type InvoiceFormValues } from './invoice-form'
import { LineItemsEditor } from './LineItemsEditor'
import { QuickClientDialog } from './QuickClientDialog'
import { SaveStatus } from './SaveStatus'
import { TotalsSummary } from './TotalsSummary'
import { useDraftAutosave } from './useDraftAutosave'

export function InvoiceBuilderPage(): ReactNode {
  const { id } = useParams()
  const detail = useInvoice(id)
  const settings = useBusinessSettings()
  const clients = useClients(false)

  if (detail.isPending || settings.isPending || clients.isPending) {
    return <p role="status" className="text-sm text-ink-muted">Loading…</p>
  }
  if (detail.isError) return <p role="alert" className="text-sm text-danger">Couldn’t load invoice: {friendlyDbError(detail.error)}</p>
  if (!detail.data || !settings.data) return <NotFoundPage />
  if (detail.data.invoice.lifecycle !== 'draft') return <Navigate to={`/invoices/${detail.data.invoice.id}`} replace />

  // Remount per invoice so form defaults always match the loaded row.
  return <Builder key={detail.data.invoice.id} detail={detail.data} settings={settings.data} clients={clients.data ?? []} />
}

interface BuilderProps {
  readonly detail: InvoiceDetail
  readonly settings: BusinessSettings
  readonly clients: readonly Client[]
}

function Builder({ detail, settings, clients }: BuilderProps): ReactNode {
  const navigate = useNavigate()
  const invoiceId = detail.invoice.id ?? ''
  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: invoiceToForm(detail.invoice, detail.lines),
    mode: 'onTouched',
  })
  const { register, setValue, formState, control } = form
  const { errors } = formState
  const autosave = useDraftAutosave(invoiceId, form)
  const lifecycle = useInvoiceLifecycle()
  const remove = useDeleteDraft()
  const [clientId, currency, taxPercent, lines, issueDate] = useWatch({ control, name: ['client_id', 'currency', 'tax_percent', 'lines', 'issue_date'] })

  // An archived client stays selectable on its existing drafts.
  const options: Client[] = [...clients]
  const client = clients.find((c) => c.id === clientId)
  if (!client && detail.invoice.client_id && detail.invoice.client_name) {
    options.push({ id: detail.invoice.client_id, name: `${detail.invoice.client_name} (archived)` } as Client)
  }

  const code = toCurrencyCode(/^[A-Z]{3}$/.test(currency) ? currency : settings.default_currency)
  const totals = liveTotals({ currency: code, lines, tax_percent: taxPercent })
  const terms = client?.payment_terms_days ?? settings.default_payment_terms_days
  const number = detail.invoice.number

  function onClientChange(next: Client): void {
    setValue('client_id', next.id, { shouldDirty: true, shouldValidate: true })
    setValue('currency', next.currency ?? settings.default_currency, { shouldDirty: true })
  }

  async function issue(): Promise<void> {
    if (!(await autosave.flush())) {
      toast.error('Fix the highlighted fields before issuing.')
      return
    }
    try {
      const row = await lifecycle.mutateAsync({ action: 'issue', id: invoiceId })
      toast.success(`Invoice ${row.number ?? ''} issued`)
      void navigate(`/invoices/${row.id}`)
    } catch (err) {
      toast.error(friendlyDbError(err))
    }
  }

  async function deleteDraft(): Promise<void> {
    try {
      await remove.mutateAsync({ id: invoiceId, clientId })
      toast.success('Draft deleted')
      void navigate('/invoices', { replace: true })
    } catch (err) {
      toast.error(friendlyDbError(err))
    }
  }

  async function preview(): Promise<void> {
    await autosave.flush()
    void navigate(`/invoices/${invoiceId}`)
  }

  return (
    <>
      <PageHeader
        title={number ? `Draft ${number}` : 'Draft invoice'}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {number ? null : (
              <ConfirmDialog
                title="Delete this draft?"
                description="The draft and its line items are removed. This can’t be undone."
                confirmLabel="Delete draft"
                tone="danger"
                onConfirm={() => void deleteDraft()}
                trigger={
                  <Button variant="ghost" disabled={remove.isPending}>
                    <Trash2 aria-hidden="true" />
                    Delete
                  </Button>
                }
              />
            )}
            <Button variant="secondary" onClick={() => void preview()}>
              <Eye aria-hidden="true" />
              Preview
            </Button>
            <ConfirmDialog
              title={number ? `Issue ${number}?` : 'Issue this invoice?'}
              description={`${number ? 'It keeps its number' : `It gets the next number (${settings.invoice_prefix}${String(settings.next_invoice_number).padStart(settings.invoice_number_width, '0')})`}, is dated ${issueDate ? formatDate(issueDate) : 'today'}, and is locked. To change it later, revert it to a draft.`}
              confirmLabel="Issue invoice"
              onConfirm={() => void issue()}
              trigger={
                <Button disabled={totals.totalMinor <= 0 || lifecycle.isPending}>
                  <Send aria-hidden="true" />
                  {lifecycle.isPending ? 'Issuing…' : 'Issue invoice'}
                </Button>
              }
            />
          </div>
        }
      />
      <div className="-mt-4 mb-6 flex flex-wrap items-center justify-between gap-2">
        <SaveStatus state={autosave.state} error={autosave.error} />
        {totals.totalMinor <= 0 ? <p className="text-sm text-ink-muted">Add a line item with a price to issue.</p> : null}
      </div>

      <form noValidate onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-6 pb-8">
        <FormSection title="Bill to">
          <div className="grid gap-4 @lg:grid-cols-[minmax(0,1fr)_auto] @lg:items-end">
            <Field label="Client" required error={errors.client_id?.message}>
              <NativeSelect
                value={clientId}
                onChange={(e) => {
                  const next = options.find((c) => c.id === e.target.value)
                  if (next) onClientChange(next)
                }}
              >
                {options.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <QuickClientDialog onCreated={onClientChange} />
          </div>
          {client ? (
            <p className="text-sm text-ink-muted">
              {client.email ?? 'No email on file.'}{' '}
              <Link to={`/clients/${client.id}`} className="text-accent underline underline-offset-4">
                Edit client
              </Link>
            </p>
          ) : null}
        </FormSection>

        <FormSection title="Details">
          <div className="grid gap-4 @lg:grid-cols-2 @3xl:grid-cols-4">
            <Field label="Issue date" hint="Blank = the day you issue it." error={errors.issue_date?.message}>
              <Input type="date" {...register('issue_date')} />
            </Field>
            <Field label="Due date" hint={`Blank = Net ${terms} from issue.`} error={errors.due_date?.message}>
              <Input type="date" {...register('due_date')} />
            </Field>
            <Field label="Currency" error={errors.currency?.message}>
              <NativeSelect {...register('currency')}>
                {[...new Set([...CURRENCIES, currency])].filter(Boolean).map((c) => (
                  <option key={c} value={c}>
                    {currencyLabel(c)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Tax rate (%)" error={errors.tax_percent?.message}>
              <Input inputMode="decimal" className="tabular" {...register('tax_percent')} />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Line items">
          <LineItemsEditor form={form} />
          <TotalsSummary totals={totals} currency={code} taxLabel={`Tax (${taxPercent || '0'}%)`} />
        </FormSection>

        <FormSection title="Notes and payment">
          <Field label="Notes" hint="Printed on the invoice.">
            <Textarea rows={3} {...register('notes')} />
          </Field>
          <Field label="Payment instructions" hint="Defaults from Settings; edit for this invoice only.">
            <Textarea rows={4} {...register('payment_instructions')} />
          </Field>
        </FormSection>
      </form>
    </>
  )
}
