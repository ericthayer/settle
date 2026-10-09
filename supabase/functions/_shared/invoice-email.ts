// Invoice and reminder email content. Pure and dependency-free so the Edge
// Function (Deno) sends it and the app (Vite) previews and unit-tests it.

export type InvoiceEmailKind = 'invoice' | 'reminder'

export interface InvoiceEmailInput {
  readonly kind: InvoiceEmailKind
  readonly number: string
  readonly businessName: string
  readonly contactName: string | null
  readonly currency: string
  readonly balanceMinor: number
  /** ISO date, YYYY-MM-DD. */
  readonly dueDate: string
  readonly daysOverdue: number
  readonly paymentInstructions: string | null
  /** Public invoice page; omitted in the in-app preview before a link exists. */
  readonly viewUrl: string | null
}

export interface InvoiceEmail {
  readonly subject: string
  readonly text: string
  readonly html: string
}

function fractionDigits(currency: string): number {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
}

export function emailMoney(minor: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 10 ** fractionDigits(currency))
}

export function emailDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export function invoiceEmailSubject(input: Pick<InvoiceEmailInput, 'kind' | 'number' | 'businessName' | 'dueDate' | 'daysOverdue'>): string {
  if (input.kind === 'invoice') return `Invoice ${input.number} from ${input.businessName}`
  return input.daysOverdue > 0 ? `Reminder: invoice ${input.number} is overdue` : `Reminder: invoice ${input.number} is due ${emailDate(input.dueDate)}`
}

function leadSentence(input: InvoiceEmailInput, amount: string, due: string): string {
  if (input.kind === 'invoice') return `Here is invoice ${input.number} for ${amount}, due ${due}.`
  if (input.daysOverdue > 0) {
    const days = `${input.daysOverdue} ${input.daysOverdue === 1 ? 'day' : 'days'}`
    return `A friendly reminder that invoice ${input.number} for ${amount} was due on ${due} and is now ${days} overdue.`
  }
  return `A friendly reminder that invoice ${input.number} for ${amount} is due on ${due}.`
}

export function buildInvoiceEmail(input: InvoiceEmailInput): InvoiceEmail {
  const amount = emailMoney(input.balanceMinor, input.currency)
  const due = emailDate(input.dueDate)
  const firstName = input.contactName?.trim().split(/\s+/)[0] ?? ''
  const greeting = firstName ? `Hi ${firstName},` : 'Hello,'
  const lead = leadSentence(input, amount, due)
  const paidNote = input.kind === 'reminder' ? 'If you’ve already sent payment, thank you, and please disregard this note.' : null
  const instructions = input.paymentInstructions?.trim() || null

  const text = [
    greeting,
    '',
    lead,
    ...(input.viewUrl ? ['', `View and download the invoice: ${input.viewUrl}`] : []),
    ...(paidNote ? ['', paidNote] : []),
    ...(instructions ? ['', 'How to pay:', instructions] : []),
    '',
    'Thank you,',
    input.businessName,
  ].join('\n')

  const p = (content: string): string => `<p style="margin:0 0 16px">${content}</p>`
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(invoiceEmailSubject(input))}</title></head>
<body style="margin:0;padding:0;background:#f7f6f2">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f6f2">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e6e3dc;border-radius:8px">
<tr><td style="padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1d2622">
${p(escapeHtml(greeting))}
${p(escapeHtml(lead))}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;width:100%;border-top:1px solid #e6e3dc;border-bottom:1px solid #e6e3dc">
<tr><td style="padding:12px 0;color:#626d68">Invoice</td><td align="right" style="padding:12px 0;font-variant-numeric:tabular-nums">${escapeHtml(input.number)}</td></tr>
<tr><td style="padding:0 0 12px;color:#626d68">${input.kind === 'invoice' ? 'Amount due' : 'Balance due'}</td><td align="right" style="padding:0 0 12px;font-weight:600;font-variant-numeric:tabular-nums">${escapeHtml(amount)}</td></tr>
<tr><td style="padding:0 0 12px;color:#626d68">Due</td><td align="right" style="padding:0 0 12px">${escapeHtml(due)}</td></tr>
</table>
${
  input.viewUrl
    ? `<p style="margin:0 0 24px"><a href="${escapeHtml(input.viewUrl)}" style="display:inline-block;background:#2f6b4a;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:6px">View invoice</a></p>`
    : ''
}
${paidNote ? p(escapeHtml(paidNote)) : ''}
${instructions ? `<p style="margin:0 0 4px;font-weight:600">How to pay</p><p style="margin:0 0 16px;white-space:pre-line">${escapeHtml(instructions)}</p>` : ''}
<p style="margin:0">Thank you,<br>${escapeHtml(input.businessName)}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

  return { subject: invoiceEmailSubject(input), text, html }
}

/** Display name for the From header: no quotes, angle brackets or line breaks. */
export function fromHeader(displayName: string, address: string): string {
  const name = displayName.replace(/["<>\r\n\\]/g, '').trim()
  return name ? `"${name}" <${address}>` : address
}
