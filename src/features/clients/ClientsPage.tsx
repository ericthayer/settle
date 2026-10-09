import type { ReactNode } from 'react'
import { EmptyState } from '@/components/layout/EmptyState'
import { PageHeader } from '@/components/layout/PageHeader'

export function ClientsPage(): ReactNode {
  return (
    <>
      <PageHeader title="Clients" />
      <EmptyState title="No clients yet">Client records arrive in the next build step.</EmptyState>
    </>
  )
}
