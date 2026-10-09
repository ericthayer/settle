import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { UseQueryResult } from '@tanstack/react-query'
import type { BusinessSettings } from '@/data/settings'
import { RequireSetup } from './RequireSetup'

const useBusinessSettings = vi.fn<() => Partial<UseQueryResult<BusinessSettings | null>>>()
vi.mock('@/data/settings', () => ({ useBusinessSettings: () => useBusinessSettings() }))

function renderAt(path: string): void {
  const router = createMemoryRouter(
    [
      { path: '/settings', element: <p>settings page</p> },
      { element: <RequireSetup />, children: [{ path: '/clients', element: <p>clients page</p> }] },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
}

describe('RequireSetup', () => {
  it('sends a first-run owner to /settings', async () => {
    useBusinessSettings.mockReturnValue({ isPending: false, isError: false, data: null })
    renderAt('/clients')
    expect(await screen.findByText('settings page')).toBeInTheDocument()
  })

  it('renders the page once settings exist', async () => {
    useBusinessSettings.mockReturnValue({ isPending: false, isError: false, data: { business_name: 'Thayer Design' } as BusinessSettings })
    renderAt('/clients')
    expect(await screen.findByText('clients page')).toBeInTheDocument()
  })

  it('shows a status while settings load', () => {
    useBusinessSettings.mockReturnValue({ isPending: true, isError: false })
    renderAt('/clients')
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
  })
})
