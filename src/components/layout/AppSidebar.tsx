import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router'
import { FileText, LayoutDashboard, Settings, Users, type LucideIcon } from 'lucide-react'
import { BrandMark } from '@/components/Wordmark'
import { useBusinessSettings } from '@/data/settings'
import { cn } from '@/lib/cn'
import { NavUser } from './NavUser'

interface NavItem {
  readonly to: string
  readonly label: string
  readonly icon: LucideIcon
  readonly end: boolean
}

const WORKSPACE: readonly NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/invoices', label: 'Invoices', icon: FileText, end: false },
  { to: '/clients', label: 'Clients', icon: Users, end: false },
]

const SECONDARY: readonly NavItem[] = [{ to: '/settings', label: 'Settings', icon: Settings, end: false }]

function NavList({ items }: { readonly items: readonly NavItem[] }): ReactNode {
  return (
    <ul className="flex flex-col gap-1">
      {items.map(({ to, label, icon: Icon, end }) => (
        <li key={to}>
          <NavLink
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex h-8 items-center gap-2 rounded-md px-2 text-sm text-ink hover:bg-sidebar-active [&_svg]:size-4 [&_svg]:shrink-0',
                isActive && 'bg-sidebar-active font-medium',
              )
            }
          >
            <Icon aria-hidden="true" />
            {label}
          </NavLink>
        </li>
      ))}
    </ul>
  )
}

/** Sidebar contents, shared by the desktop rail and the mobile sheet. */
export function AppSidebar({ className }: { readonly className?: string }): ReactNode {
  const settings = useBusinessSettings()
  const businessName = settings.data?.business_name ?? null

  return (
    <div className={cn('flex h-full flex-col gap-2 p-2 text-ink', className)}>
      <Link to="/" className="flex h-12 items-center gap-2 rounded-md p-2 hover:bg-sidebar-active">
        <BrandMark className="size-8" />
        <span className="grid min-w-0 flex-1 text-sm leading-tight">
          <span className="truncate font-semibold">settle</span>
          <span className="truncate text-xs text-ink-muted">{businessName ?? 'Invoicing'}</span>
        </span>
      </Link>
      <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="p-2">
          <h2 className="flex h-8 items-center px-2 text-xs font-medium text-ink-muted">Workspace</h2>
          <NavList items={WORKSPACE} />
        </div>
        <div className="mt-auto p-2">
          <NavList items={SECONDARY} />
        </div>
      </nav>
      <NavUser name={businessName} />
    </div>
  )
}
