import { useEffect, type ReactNode } from 'react'
import { useParams } from 'react-router'
import { Download } from 'lucide-react'
import { InvoiceDocument } from '@/components/invoice-document/InvoiceDocument'
import { Button } from '@/components/ui/button'
import { useLogoUrl } from '@/data/logo'
import { usePublicInvoice } from '@/data/public-invoice'
import { printAsPdf } from '@/features/invoices/email-draft'
import { friendlyDbError } from '@/lib/db-errors'
import { toPublicDocumentModel } from './public-invoice'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** What a client sees from the emailed link: the invoice, read-only, and a PDF button. No account needed. */
export function PublicInvoicePage(): ReactNode {
  const { token } = useParams()
  const valid = Boolean(token && UUID.test(token))
  const query = usePublicInvoice(valid ? token : undefined)
  const model = query.data ? toPublicDocumentModel(query.data) : null
  const logoUrl = useLogoUrl(model?.logoPath)
  const title = model ? `${model.number ?? 'Invoice'} – ${model.from.name}` : 'Invoice'

  useEffect(() => {
    document.title = title
  }, [title])

  let body: ReactNode
  if (valid && query.isPending) {
    body = <p role="status" className="text-sm text-ink-muted">Loading…</p>
  } else if (query.isError) {
    body = <p role="alert" className="text-sm text-danger">Couldn’t load this invoice: {friendlyDbError(query.error)}</p>
  } else if (!model) {
    body = (
      <div className="mx-auto max-w-md text-center">
        <h1 className="mb-2 text-lg font-medium">This invoice link isn’t available</h1>
        <p className="text-sm text-ink-muted">It may have been withdrawn or mistyped. Ask the sender for a new link.</p>
      </div>
    )
  } else {
    body = (
      <>
        <div className="mx-auto mb-6 flex max-w-[8.5in] justify-end print:hidden">
          <Button onClick={() => printAsPdf(`${model.number ?? 'Invoice'} – ${model.to.name}`)}>
            <Download aria-hidden="true" />
            Download PDF
          </Button>
        </div>
        <InvoiceDocument model={model} logoUrl={logoUrl.data ?? null} />
      </>
    )
  }

  return (
    <main id="main" className="min-h-dvh px-4 py-8 md:px-10 print:min-h-0 print:p-0">
      {body}
    </main>
  )
}
