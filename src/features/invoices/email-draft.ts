import type { InvoiceDocumentModel } from '@/components/invoice-document/document-model'
import { formatDate } from '@/lib/dates'
import { formatMoney } from '@/lib/money'

export interface EmailDraft {
  readonly to: string
  readonly cc: readonly string[]
  readonly subject: string
  readonly body: string
}

/** Plain-text email to send alongside the downloaded PDF. */
export function buildEmailDraft(model: InvoiceDocumentModel, cc: readonly string[] = []): EmailDraft {
  const amount = formatMoney({ minor: model.balanceMinor, currency: model.currency })
  const greeting = model.to.contactName ? `Hi ${model.to.contactName.split(' ')[0]},` : 'Hello,'
  const number = model.number ?? 'draft'
  const body = [
    greeting,
    '',
    `Please find attached invoice ${number} for ${amount}, due ${formatDate(model.dueDate)}.`,
    ...(model.paymentInstructions ? ['', 'How to pay:', model.paymentInstructions] : []),
    '',
    'Thank you,',
    model.from.name,
  ].join('\n')
  return { to: model.to.email ?? '', cc, subject: `Invoice ${number} from ${model.from.name}`, body }
}

export function toMailto(draft: EmailDraft): string {
  const params = new URLSearchParams()
  if (draft.cc.length > 0) params.set('cc', draft.cc.join(','))
  params.set('subject', draft.subject)
  params.set('body', draft.body)
  // mailto wants %20, not "+", for spaces.
  return `mailto:${encodeURIComponent(draft.to)}?${params.toString().replace(/\+/g, '%20')}`
}

/** Saved PDF filename comes from document.title: "INV-0042 – Acme Co". */
export function printAsPdf(title: string): void {
  const previous = document.title
  document.title = title
  const restore = (): void => {
    document.title = previous
    window.removeEventListener('afterprint', restore)
  }
  window.addEventListener('afterprint', restore)
  window.print()
}
