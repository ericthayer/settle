import type { ReactNode } from 'react'
import { formatAddressLines } from '@/lib/address'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { bpsToPercentInput } from '@/lib/rates'
import type { InvoiceDocumentModel, Party } from './document-model'
import './invoice-print.css'

interface InvoiceDocumentProps {
  readonly model: InvoiceDocumentModel
  /** Signed URL for the logo; resolved by the caller so this stays pure. */
  readonly logoUrl?: string | null
}

const STAMP: Partial<Record<InvoiceDocumentModel['status'], { label: string; className: string }>> = {
  draft: { label: 'Draft', className: 'border-ink-muted text-ink-muted' },
  paid: { label: 'Paid', className: 'border-accent text-accent' },
  void: { label: 'Void', className: 'border-danger text-danger' },
}

function formatQuantity(q: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(q)
}

function PartyBlock({ party, heading }: { readonly party: Party; readonly heading?: string }): ReactNode {
  const lines = [party.contactName, ...formatAddressLines(party.address), party.email, party.phone, party.website].filter(
    (l): l is string => Boolean(l),
  )
  return (
    <div className="text-sm leading-relaxed">
      {heading ? <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">{heading}</h2> : null}
      <p className="font-semibold">{party.name}</p>
      {lines.map((l) => (
        <p key={l} className="text-ink-muted">
          {l}
        </p>
      ))}
      {party.taxId ? <p className="text-ink-muted">Tax ID: {party.taxId}</p> : null}
    </div>
  )
}

/** The invoice itself: identical on screen and in print. Pure presentation. */
export function InvoiceDocument({ model, logoUrl }: InvoiceDocumentProps): ReactNode {
  const money = (minor: number): string => formatMoney({ minor, currency: model.currency })
  const stamp = STAMP[model.status]
  const title = model.number ? `Invoice ${model.number}` : 'Invoice (draft)'

  return (
    <article aria-label={title} className="invoice-paper relative mx-auto w-full max-w-[8.5in] rounded-md border border-line p-8 shadow-sm @container sm:p-12">
      <header className="mb-10 flex flex-col gap-8 @xl:flex-row @xl:justify-between">
        <div className="flex flex-col gap-4">
          {logoUrl ? <img src={logoUrl} alt={`${model.from.name} logo`} className="max-h-16 max-w-48 object-contain object-left" /> : null}
          <PartyBlock party={model.from} />
        </div>
        <div className="@xl:text-right">
          <h1 className="text-3xl font-semibold tracking-tight">Invoice</h1>
          <p className="tabular mt-1 text-lg text-ink-muted">{model.number ?? 'Not yet numbered'}</p>
          <dl className="tabular mt-4 grid grid-cols-[auto_auto] justify-start gap-x-6 gap-y-1 text-sm @xl:justify-end">
            <dt className="text-ink-muted">Issued</dt>
            <dd>{formatDate(model.issueDate)}</dd>
            <dt className="text-ink-muted">Due</dt>
            <dd>{formatDate(model.dueDate)}</dd>
          </dl>
          {model.datesProvisional ? <p className="mt-2 text-xs text-ink-muted">Dates are set when the invoice is issued.</p> : null}
          {stamp ? (
            <p className={cn('mt-4 inline-block -rotate-3 rounded border-2 px-3 py-1 text-sm font-bold uppercase tracking-[0.2em]', stamp.className)}>
              {stamp.label}
            </p>
          ) : null}
        </div>
      </header>

      <section className="mb-10">
        <PartyBlock party={model.to} heading="Bill to" />
      </section>

      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Line items</caption>
        <thead>
          <tr className="border-b-2 border-ink text-left text-xs uppercase tracking-wide text-ink-muted">
            <th scope="col" className="py-2 pr-4 font-medium">Description</th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">Qty</th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">Unit price</th>
            <th scope="col" className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {model.lines.map((line) => (
            <tr key={line.id} className="border-b border-line align-top">
              <td className="whitespace-pre-line py-3 pr-4">
                {line.description}
                {!line.taxable && model.taxRateBps > 0 ? <span className="ml-2 text-xs text-ink-muted">(no tax)</span> : null}
              </td>
              <td className="tabular py-3 pr-4 text-right">{formatQuantity(line.quantity)}</td>
              <td className="tabular py-3 pr-4 text-right">{money(line.unitPriceMinor)}</td>
              <td className="tabular py-3 text-right">{money(line.amountMinor)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="invoice-keep tabular ml-auto mt-6 grid w-full max-w-xs grid-cols-[1fr_auto] gap-y-2 text-sm [&_dd]:pl-6">
        <dt className="text-ink-muted">Subtotal</dt>
        <dd className="text-right">{money(model.subtotalMinor)}</dd>
        {model.taxRateBps > 0 || model.taxMinor > 0 ? (
          <>
            <dt className="text-ink-muted">Tax ({bpsToPercentInput(model.taxRateBps)}%)</dt>
            <dd className="text-right">{money(model.taxMinor)}</dd>
          </>
        ) : null}
        <dt className="border-t border-ink pt-2 font-semibold">Total</dt>
        <dd className="border-t border-ink pt-2 text-right font-semibold">{money(model.totalMinor)}</dd>
        {model.amountPaidMinor > 0 ? (
          <>
            <dt className="text-ink-muted">Paid</dt>
            <dd className="text-right">−{money(model.amountPaidMinor)}</dd>
            <dt className="font-semibold">Balance due</dt>
            <dd className="text-right font-semibold">{money(model.balanceMinor)}</dd>
          </>
        ) : null}
      </dl>

      {model.notes || model.paymentInstructions || model.voidReason ? (
        <footer className="invoice-keep mt-12 grid gap-6 border-t border-line pt-6 text-sm @xl:grid-cols-2">
          {model.paymentInstructions ? (
            <section>
              <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">How to pay</h2>
              <p className="whitespace-pre-line">{model.paymentInstructions}</p>
            </section>
          ) : null}
          {model.notes ? (
            <section>
              <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">Notes</h2>
              <p className="whitespace-pre-line">{model.notes}</p>
            </section>
          ) : null}
          {model.status === 'void' && model.voidReason ? (
            <section>
              <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-danger">Void reason</h2>
              <p>{model.voidReason}</p>
            </section>
          ) : null}
        </footer>
      ) : null}
    </article>
  )
}
