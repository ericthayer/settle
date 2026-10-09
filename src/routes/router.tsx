import { createBrowserRouter } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/features/auth/LoginPage'
import { NotFoundPage } from './NotFoundPage'
import { RequireAuth } from './RequireAuth'
import { RequireSetup } from './RequireSetup'
import { RouteError } from './RouteError'

/** Feature pages are code-split per route. */
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    errorElement: <RouteError />,
    children: [
      {
        element: <AppShell />,
        children: [
          {
            // Everything except settings waits for first-run setup.
            element: <RequireSetup />,
            children: [
              {
                index: true,
                lazy: async () => ({ Component: (await import('@/features/dashboard/DashboardPage')).DashboardPage }),
              },
              {
                path: 'invoices',
                lazy: async () => ({ Component: (await import('@/features/invoices/InvoicesPage')).InvoicesPage }),
              },
              {
                path: 'invoices/new',
                lazy: async () => ({ Component: (await import('@/features/invoices/NewInvoicePage')).NewInvoicePage }),
              },
              {
                path: 'invoices/:id',
                lazy: async () => ({ Component: (await import('@/features/invoices/InvoiceViewPage')).InvoiceViewPage }),
              },
              {
                path: 'invoices/:id/edit',
                lazy: async () => ({ Component: (await import('@/features/invoices/InvoiceBuilderPage')).InvoiceBuilderPage }),
              },
              {
                path: 'clients',
                lazy: async () => ({ Component: (await import('@/features/clients/ClientsPage')).ClientsPage }),
              },
              {
                path: 'clients/new',
                lazy: async () => ({ Component: (await import('@/features/clients/ClientDetailPage')).ClientDetailPage }),
              },
              {
                path: 'clients/:id',
                lazy: async () => ({ Component: (await import('@/features/clients/ClientDetailPage')).ClientDetailPage }),
              },
            ],
          },
          {
            path: 'settings',
            lazy: async () => ({ Component: (await import('@/features/settings/SettingsPage')).SettingsPage }),
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
])
