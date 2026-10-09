import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, Download, Mail, Pencil, Send, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { InvoiceStatusBadge } from '@/components/InvoiceStatusBadge'
import { InvoiceDocument } from '@/components/invoice-document/InvoiceDocument'
import { toDocumentModel } from '@/components/invoice-document/document-model'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useClient } from '@/data/clients'
import { useInvoice, useInvoiceLifecycle } from '@/data/invoices'
import { useLogoUrl } from '@/data/logo'
import { useBusinessSettings } from '@/data/settings'
import { todayIn } from '@/lib/dates'
import { friendlyDbError } from '@/lib/db-errors'
import { NotFoundPage } from '@/routes/NotFoundPage'
import { buildEmailDraft, printAsPdf, toMailto } from './email-draft'
import { PaymentHistory } from '@/features/payments/PaymentHistory'
import { RecordPaymentDialog } from '@/features/payments/RecordPaymentDialog'
import { VoidInvoiceDialog } from './VoidInvoiceDialog'

export function InvoiceViewPage(): ReactNode {
  const { id } = useParams()
  const navigate = useNavigate()
  const detail = useInvoice(id)
  const settings = useBusinessSettings()
  const client = useClient(detail.data?.invoice.client_id ?? undefined)
  const lifecycle = useInvoiceLifecycle()
  const model =
    detail.data && settings.data
      ? toDocumentModel(detail.data.invoice, detail.data.lines, settings.data, client.data ?? null, todayIn(settings.data.timezone))
      : null
  const logoUrl = useLogoUrl(model?.logoPath)

  if (detail.isPending || settings.isPending) return <p role="status" className="text-sm text-ink-muted">Loading…</p>
  if (detail.isError) return <p role="alert" className="text-sm text-danger">Couldn’t load invoice: {friendlyDbError(detail.error)}</p>
  if (!detail.data || !model) return <NotFoundPage />

  const { invoice } = detail.data
  const invoiceId = invoice.id ?? ''
  const lc = invoice.lifecycle
  const hasPayments = (invoice.amount_paid_minor ?? 0) > 0
  const balance = invoice.balance_minor ?? 0
  const today = todayIn(settings.data?.timezone ?? 'UTC')
  const email = buildEmailDraft(model, client.data?.cc_emails ?? [])

  async function change(action: 'issue' | 'revert' | 'void', reason?: string): Promise<void> {
    try {
      const row = await lifecycle.mutateAsync(action === 'void' ? { action, id: invoiceId, reason } : { action, id: invoiceId })
      toast.success(action === 'issue' ? `Invoice ${row.number ?? ''} issued` : action === 'revert' ? 'Back to draft' : `${row.number ?? 'Invoice'} voided`)
      if (action === 'revert') void navigate(`/invoices/${invoiceId}/edit`)
    } catch (err) {
      toast.error(friendlyDbError(err))
    }
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/invoices">
              <ArrowLeft aria-hidden="true" />
              Invoices
            </Link>
          </Button>
          <InvoiceStatusBadge status={invoice.status} amountPaidMinor={invoice.amount_paid_minor} />
          {invoice.status === 'overdue' && invoice.days_overdue ? (
            <span className="text-sm text-danger">{invoice.days_overdue} days overdue</span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lc === 'draft' ? (
            <>
              <Button asChild variant="secondary">
                <Link to={`/invoices/${invoiceId}/edit`}>
                  <Pencil aria-hidden="true" />
                  Edit
                </Link>
              </Button>
              <ConfirmDialog
                title="Issue this invoice?"
                description="It gets its number and today’s date (unless set), and is locked. To change it later, revert it to a draft."
                confirmLabel="Issue invoice"
                onConfirm={() => void change('issue')}
                trigger={
                  <Button disabled={(invoice.total_minor ?? 0) <= 0 || lifecycle.isPending}>
                    <Send aria-hidden="true" />
                    Issue invoice
                  </Button>
                }
              />
            </>
          ) : null}
          {lc === 'issued' ? (
            <>
              <ConfirmDialog
                title={`Revert ${invoice.number ?? ''} to draft?`}
                description="You can edit it again. It keeps its number, and re-issuing doesn’t use a new one."
                confirmLabel="Revert to draft"
                onConfirm={() => void change('revert')}
                trigger={
                  <Button variant="ghost" disabled={hasPayments || lifecycle.isPending} title={hasPayments ? 'Remove its payments first' : undefined}>
                    <Undo2 aria-hidden="true" />
                    Revert to draft
                  </Button>
                }
              />
              <VoidInvoiceDialog number={invoice.number ?? ''} disabled={hasPayments || lifecycle.isPending} onConfirm={(reason) => void change('void', reason)} />
              {balance > 0 ? (
                <RecordPaymentDialog
                  invoiceId={invoiceId}
                  clientId={invoice.client_id ?? ''}
                  number={invoice.number ?? ''}
                  currency={model.currency}
                  balanceMinor={balance}
                  today={today}
                />
              ) : null}
              <Button asChild variant="secondary">
                <a href={toMailto(email)}>
                  <Mail aria-hidden="true" />
                  Email
                </a>
              </Button>
            </>
          ) : null}
          <Button variant={lc === 'issued' && balance <= 0 ? 'primary' : 'secondary'} onClick={() => printAsPdf(`${invoice.number ?? 'Draft'} – ${model.to.name}`)}>
            <Download aria-hidden="true" />
            Download PDF
          </Button>
        </div>
      </div>
      {lc === 'issued' && hasPayments ? (
        <p className="mb-4 text-sm text-ink-muted print:hidden">To revert or void this invoice, remove its payments first.</p>
      ) : null}
      {lc === 'issued' && !model.to.email ? (
        <p className="mb-4 text-sm text-ink-muted print:hidden">This client has no email address, so the email will open without a recipient.</p>
      ) : null}
      <InvoiceDocument model={model} logoUrl={logoUrl.data ?? null} />
      {lc !== 'draft' ? (
        <div className="mx-auto mt-8 max-w-[8.5in] print:hidden">
          <PaymentHistory invoiceId={invoiceId} clientId={invoice.client_id ?? ''} editable={lc === 'issued'} />
        </div>
      ) : null}
      {lc === 'issued' ? (
        <p className="mt-4 text-center text-xs text-ink-muted print:hidden">
          Email opens your mail app with the message filled in. Attach the downloaded PDF before sending.
        </p>
      ) : null}
    </>
  )
}
