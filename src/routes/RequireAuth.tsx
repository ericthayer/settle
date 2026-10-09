import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '@/features/auth/auth-context'

export function RequireAuth(): ReactNode {
  const { state } = useAuth()
  const location = useLocation()

  if (state.status === 'loading') {
    return (
      <p role="status" className="p-8 text-sm text-ink-muted">
        Loading…
      </p>
    )
  }
  if (state.status === 'signed-out') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <Outlet />
}
