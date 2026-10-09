import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { Session } from '@supabase/supabase-js'
import { AuthContext, type AuthContextValue, type AuthState } from '@/features/auth/auth-context'
import { RequireAuth } from './RequireAuth'

function renderWithAuth(state: AuthState): void {
  const value: AuthContextValue = {
    state,
    signIn: async () => ({ error: null }),
    signOut: async () => undefined,
  }
  const router = createMemoryRouter(
    [
      { path: '/login', element: <p>login page</p> },
      { element: <RequireAuth />, children: [{ path: '/invoices', element: <p>invoices page</p> }] },
    ],
    { initialEntries: ['/invoices'] },
  )
  render(
    <AuthContext value={value}>
      <RouterProvider router={router} />
    </AuthContext>,
  )
}

describe('RequireAuth', () => {
  it('redirects signed-out visitors to /login', async () => {
    renderWithAuth({ status: 'signed-out' })
    expect(await screen.findByText('login page')).toBeInTheDocument()
  })

  it('shows a status while the session loads', () => {
    renderWithAuth({ status: 'loading' })
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
  })

  it('renders the protected page for a signed-in user', async () => {
    renderWithAuth({ status: 'signed-in', session: {} as Session })
    expect(await screen.findByText('invoices page')).toBeInTheDocument()
  })
})
