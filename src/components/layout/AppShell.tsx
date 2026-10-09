import { useEffect, useId, type ReactNode } from 'react'
import { Outlet, useLocation } from 'react-router'
import { Dialog } from 'radix-ui'
import { cn } from '@/lib/cn'
import { AppSidebar } from './AppSidebar'
import { SiteHeader } from './SiteHeader'
import { useSidebar } from './use-sidebar'

/** shadcn "inset" layout: sidebar on the page tint, content on a raised panel. */
export function AppShell(): ReactNode {
  const sidebar = useSidebar()
  const { setMobileOpen } = sidebar
  const { pathname } = useLocation()
  const desktopId = useId()

  // Navigating from the mobile sheet closes it.
  useEffect(() => setMobileOpen(false), [pathname, setMobileOpen])

  return (
    <div className="flex min-h-dvh bg-sidebar print:block print:bg-transparent">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 print:hidden"
      >
        Skip to content
      </a>

      <aside
        id={desktopId}
        aria-label="Sidebar"
        inert={sidebar.collapsed}
        className={cn(
          'sticky top-0 hidden h-dvh w-64 shrink-0 transition-[margin] duration-200 ease-linear md:block print:hidden',
          sidebar.collapsed && '-ml-64',
        )}
      >
        <AppSidebar />
      </aside>

      <Dialog.Root open={sidebar.mobileOpen} onOpenChange={setMobileOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 md:hidden" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r border-sidebar-line bg-sidebar shadow-lg md:hidden"
          >
            <Dialog.Title className="sr-only">Sidebar</Dialog.Title>
            <AppSidebar />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col bg-paper md:m-2 md:ml-0 md:min-h-[calc(100dvh-1rem)] md:rounded-xl md:shadow-sm',
          sidebar.collapsed && 'md:ml-2',
          'print:m-0 print:min-h-0 print:rounded-none print:bg-transparent print:shadow-none',
        )}
      >
        <SiteHeader sidebarId={desktopId} sidebarOpen={sidebar.open} onToggleSidebar={sidebar.toggle} />
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-6 print:max-w-none print:p-0">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
