import type { ReactNode } from 'react'
import { EmptyState } from '@/components/layout/EmptyState'
import { PageHeader } from '@/components/layout/PageHeader'

export function DashboardPage(): ReactNode {
  return (
    <>
      <PageHeader title="Dashboard" />
      <EmptyState title="Nothing needs attention yet">
        Outstanding balances, overdue invoices and payments received this month will show here once invoices exist.
      </EmptyState>
    </>
  )
}
