import { useState, type ReactNode } from 'react'
import { Dialog } from 'radix-ui'
import { Mail } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useClient } from '@/data/clients'
import { useSendInvoiceEmail, type InvoiceEmailKind } from '@/data/invoice-emails'
import type { InvoiceSummary } from '@/data/invoices'
import { invoiceEmailSubject } from '../../../supabase/functions/_shared/invoice-email.ts'
import { nextEmailKind } from './email-history'

interface SendEmailDialogProps {
  readonly invoice: InvoiceSummary
  /** mailto: fallback for sending from the owner's own mail app. */
  readonly mailtoHref: string
  readonly label: string
  readonly size?: 'sm' | 'md'
  readonly ariaLabel?: string
}

function snapshotString(snapshot: InvoiceSummary['bill_to'], key: string): string | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null
  const value = snapshot[key]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function newRequestId(): string {
  return crypto.randomUUID()
}

/** Confirms recipient and subject, then sends through the app (Resend). */
export function SendEmailDialog({ invoice, mailtoHref, label, size, ariaLabel }: SendEmailDialogProps): ReactNode {
  const [open, setOpen] = useState(false)
  const [requestId, setRequestId] = useState(newRequestId)
  const client = useClient(open ? (invoice.client_id ?? undefined) : undefined)
  const send = useSendInvoiceEmail()

  const kind: InvoiceEmailKind = nextEmailKind(invoice)
  const number = invoice.number ?? ''
  const to = client.data?.email?.trim() || snapshotString(invoice.bill_to, 'email')
  const cc = (client.data?.cc_emails ?? []).filter((e) => e.trim() !== '' && e !== to)
  const subject = invoiceEmailSubject({
    kind,
    number,
    businessName: snapshotString(invoice.bill_from, 'business_name') ?? '',
    dueDate: invoice.due_date ?? '',
    daysOverdue: invoice.days_overdue ?? 0,
  })
  const title = kind === 'reminder' ? `Send a reminder for ${number}` : `Email invoice ${number}`

  function onOpenChange(next: boolean): void {
    if (next) setRequestId(newRequestId())
    setOpen(next)
  }

  async function onSend(): Promise<void> {
    try {
      const result = await send.mutateAsync({ invoiceId: invoice.id ?? '', clientId: invoice.client_id ?? '', kind, requestId })
      toast.success(kind === 'reminder' ? `Reminder sent to ${result.to}` : `${number} emailed to ${result.to}`)
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t send the email. Try again.')
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>
        <Button variant="secondary" size={size} aria-label={ariaLabel}>
          <Mail aria-hidden="true" />
          {label}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-ink/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 max-h-[calc(100dvh-2rem)] w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-md border border-line bg-surface p-6 shadow-lg">
          <Dialog.Title className="mb-1 font-medium">{title}</Dialog.Title>
          <Dialog.Description className="mb-5 text-sm text-ink-muted">
            The email includes a link where your client can view the invoice and save it as a PDF.
          </Dialog.Description>
          {client.isPending && invoice.client_id ? (
            <p role="status" className="mb-5 text-sm text-ink-muted">
              Loading…
            </p>
          ) : (
            <dl className="mb-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-ink-muted">To</dt>
              <dd className="break-all">{to ?? <span className="text-danger">No email address on this client</span>}</dd>
              {cc.length > 0 ? (
                <>
                  <dt className="text-ink-muted">Cc</dt>
                  <dd className="break-all">{cc.join(', ')}</dd>
                </>
              ) : null}
              <dt className="text-ink-muted">Subject</dt>
              <dd>{subject}</dd>
            </dl>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <a href={mailtoHref} className="text-xs text-accent underline underline-offset-4">
              Use my mail app instead
            </a>
            <div className="flex gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="button" disabled={!to || send.isPending || client.isPending} onClick={() => void onSend()}>
                {send.isPending ? 'Sending…' : kind === 'reminder' ? 'Send reminder' : 'Send invoice'}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
