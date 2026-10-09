import type { ReactNode } from 'react'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import type { Enums } from '@/lib/database.types'

type InvoiceStatus = Enums<'invoice_status'>

const STATUS: Record<InvoiceStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  sent: { label: 'Sent', tone: 'neutral' },
  partially_paid: { label: 'Partially paid', tone: 'warn' },
  paid: { label: 'Paid', tone: 'success' },
  overdue: { label: 'Overdue', tone: 'danger' },
  void: { label: 'Void', tone: 'neutral' },
}

/** Overdue outranks partially paid; a second tag keeps the partial payment visible. */
export function InvoiceStatusBadge({ status, amountPaidMinor = 0 }: { readonly status: InvoiceStatus | null; readonly amountPaidMinor?: number | null }): ReactNode {
  if (!status) return null
  const { label, tone } = STATUS[status]
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Badge tone={tone}>{label}</Badge>
      {status === 'overdue' && (amountPaidMinor ?? 0) > 0 ? <Badge tone="warn">Partially paid</Badge> : null}
    </span>
  )
}
