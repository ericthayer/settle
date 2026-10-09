import type { ReactNode } from 'react'
import { useLocation } from 'react-router'
import { PanelLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

const SECTIONS: readonly (readonly [prefix: string, title: string])[] = [
  ['/invoices', 'Invoices'],
  ['/clients', 'Clients'],
  ['/settings', 'Settings'],
]

function sectionTitle(pathname: string): string {
  if (pathname === '/') return 'Dashboard'
  return SECTIONS.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1] ?? 'settle'
}

interface SiteHeaderProps {
  readonly sidebarId: string
  readonly sidebarOpen: boolean
  readonly onToggleSidebar: () => void
}

/** Top bar of the content panel: sidebar toggle and the current section. */
export function SiteHeader({ sidebarId, sidebarOpen, onToggleSidebar }: SiteHeaderProps): ReactNode {
  const { pathname } = useLocation()

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-4 lg:px-6 print:hidden">
      <Button
        variant="ghost"
        size="icon"
        className="-ml-1 size-7"
        aria-label="Toggle sidebar"
        aria-controls={sidebarId}
        aria-expanded={sidebarOpen}
        onClick={onToggleSidebar}
      >
        <PanelLeft aria-hidden="true" />
      </Button>
      <span aria-hidden="true" className="mx-2 h-4 w-px bg-line" />
      <p className="text-sm font-medium">{sectionTitle(pathname)}</p>
    </header>
  )
}
