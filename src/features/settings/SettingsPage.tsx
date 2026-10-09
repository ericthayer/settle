import type { ReactNode } from 'react'
import { EmptyState } from '@/components/layout/EmptyState'
import { PageHeader } from '@/components/layout/PageHeader'

export function SettingsPage(): ReactNode {
  return (
    <>
      <PageHeader title="Settings" />
      <EmptyState title="Business details">Your business identity and invoice defaults arrive in the next build step.</EmptyState>
    </>
  )
}
