import type { ReactNode } from 'react'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import type { Enums } from '@/lib/database.types'

type InvoiceStatus = Enums<'invoice_status'>

const STATUS: Record<InvoiceStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  sent: { label: 'Sent', tone: 'neutral' },
  partially_paid: { label: 'Partially paid', tone: 'warn' },
  paid: { label: 'Paid', tone: 'accent' },
  overdue: { label: 'Overdue', tone: 'danger' },
  void: { label: 'Void', tone: 'neutral' },
}

export function InvoiceStatusBadge({ status }: { readonly status: InvoiceStatus | null }): ReactNode {
  if (!status) return null
  const { label, tone } = STATUS[status]
  return <Badge tone={tone}>{label}</Badge>
}
