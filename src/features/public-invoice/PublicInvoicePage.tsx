import { useEffect, useState, type ReactNode } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { CreditCard, Download } from 'lucide-react'
import { InvoiceDocument } from '@/components/invoice-document/InvoiceDocument'
import { Button } from '@/components/ui/button'
import { useLogoUrl } from '@/data/logo'
import { usePublicInvoice, useStartCheckout } from '@/data/public-invoice'
import { printAsPdf } from '@/features/invoices/email-draft'
import { friendlyDbError } from '@/lib/db-errors'
import { formatMoney } from '@/lib/money'
import { canPayOnline, checkoutNotice, checkoutReturn, PAYMENT_POLL_MS, type CheckoutNotice } from './checkout-state'
import { toPublicDocumentModel } from './public-invoice'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const NOTICE_TEXT: Record<Exclude<CheckoutNotice['kind'], 'none'>, string> = {
  processing: 'Thanks! Your payment is processing. This page updates once it’s recorded.',
  delayed: 'Thanks! Your payment is still processing. It can take a little while to show here.',
  paid: 'Payment received. Thank you!',
  cancelled: 'Checkout was cancelled. You haven’t been charged.',
}

/** What a client sees from the emailed link: the invoice, read-only, a PDF button and card payment. No account needed. */
export function PublicInvoicePage(): ReactNode {
  const { token } = useParams()
  const [search] = useSearchParams()
  const returned = checkoutReturn(search.get('checkout'))
  const valid = Boolean(token && UUID.test(token))
  const [openedAt] = useState(() => Date.now())
  // Back from Stripe: poll until the webhook has recorded the payment, for up to a minute.
  const query = usePublicInvoice(valid ? token : undefined, (data) => {
    if (returned !== 'success' || Date.now() - openedAt >= PAYMENT_POLL_MS) return false
    const current = toPublicDocumentModel(data ?? null)
    return current !== null && current.status !== 'paid'
  })
  const checkout = useStartCheckout()
  const model = query.data ? toPublicDocumentModel(query.data) : null
  const logoUrl = useLogoUrl(model?.logoPath)
  const title = model ? `${model.number ?? 'Invoice'} – ${model.from.name}` : 'Invoice'
  const notice = checkoutNotice(returned, model, query.dataUpdatedAt - openedAt < PAYMENT_POLL_MS)

  useEffect(() => {
    document.title = title
  }, [title])

  // Back button from Stripe restores this page from the bfcache with the button still busy.
  const resetCheckout = checkout.reset
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent): void => {
      if (event.persisted) resetCheckout()
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [resetCheckout])

  async function payByCard(): Promise<void> {
    if (!token) return
    try {
      window.location.assign(await checkout.mutateAsync({ token }))
    } catch {
      // Shown from checkout.error below.
    }
  }

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
    const payable = canPayOnline(model)
    const balance = formatMoney({ minor: model.balanceMinor, currency: model.currency })
    // Leaving for Stripe: keep the button busy until the page unloads.
    const redirecting = checkout.isPending || checkout.isSuccess
    body = (
      <>
        <div className="mx-auto mb-6 flex max-w-[8.5in] flex-col gap-4 print:hidden">
          {/* The live region stays mounted so screen readers announce the notice when it changes. */}
          <div role="status" aria-live="polite">
            {notice.kind === 'none' ? null : <p className="rounded-md border border-line bg-surface px-4 py-3 text-sm">{NOTICE_TEXT[notice.kind]}</p>}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant={payable ? 'secondary' : 'primary'} onClick={() => printAsPdf(`${model.number ?? 'Invoice'} – ${model.to.name}`)}>
              <Download aria-hidden="true" />
              Download PDF
            </Button>
            {payable ? (
              <Button onClick={() => void payByCard()} disabled={redirecting}>
                <CreditCard aria-hidden="true" />
                {redirecting ? 'Opening secure checkout…' : `Pay ${balance} by card`}
              </Button>
            ) : null}
          </div>
          {checkout.isError ? (
            <p role="alert" className="text-right text-sm text-danger">
              {checkout.error.message}
            </p>
          ) : null}
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
