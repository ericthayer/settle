import type { ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router'
import { FileText, LayoutDashboard, LogOut, Settings, Users } from 'lucide-react'
import { Wordmark } from '@/components/Wordmark'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/auth-context'
import { cn } from '@/lib/cn'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/invoices', label: 'Invoices', icon: FileText, end: false },
  { to: '/clients', label: 'Clients', icon: Users, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
] as const

export function AppShell(): ReactNode {
  const { signOut } = useAuth()

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[14rem_1fr]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 md:flex-col md:items-stretch md:justify-start md:gap-6 md:border-b-0 md:border-r md:py-6">
        <Wordmark className="md:px-2" />
        <nav aria-label="Main">
          <ul className="flex gap-1 md:flex-col">
            {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 rounded-md px-2 py-2 text-sm text-ink-muted hover:bg-line/50 hover:text-ink',
                      isActive && 'bg-accent-soft font-medium text-ink',
                    )
                  }
                >
                  <Icon className="size-4" aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only">{label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <Button variant="ghost" size="sm" className="md:mt-auto md:justify-start" onClick={() => void signOut()}>
          <LogOut aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Sign out</span>
        </Button>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl px-4 py-8 md:px-10">
        <Outlet />
      </main>
    </div>
  )
}
