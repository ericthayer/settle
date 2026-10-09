import type { ReactNode } from 'react'
import { Navigate, Outlet } from 'react-router'
import { useBusinessSettings } from '@/data/settings'

/** First run: no business_settings row yet, so send the owner to /settings. */
export function RequireSetup(): ReactNode {
  const settings = useBusinessSettings()

  if (settings.isPending) {
    return (
      <p role="status" className="text-sm text-ink-muted">
        Loading…
      </p>
    )
  }
  if (settings.isError) {
    return (
      <p role="alert" className="text-sm text-danger">
        Couldn’t load your business settings: {settings.error.message}
      </p>
    )
  }
  if (settings.data === null) return <Navigate to="/settings" replace />
  return <Outlet />
}
