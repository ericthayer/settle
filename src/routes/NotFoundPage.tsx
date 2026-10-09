import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'

export function NotFoundPage(): ReactNode {
  return (
    <>
      <PageHeader title="Page not found" />
      <Link to="/" className="text-sm text-accent underline underline-offset-4">
        Back to the dashboard
      </Link>
    </>
  )
}
