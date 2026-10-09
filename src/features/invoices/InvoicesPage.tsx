import type { ReactNode } from 'react'
import { EmptyState } from '@/components/layout/EmptyState'
import { PageHeader } from '@/components/layout/PageHeader'

export function InvoicesPage(): ReactNode {
  return (
    <>
      <PageHeader title="Invoices" />
      <EmptyState title="No invoices yet">Invoice creation arrives in the next build step.</EmptyState>
    </>
  )
}
