import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { DropdownMenu } from 'radix-ui'
import { EllipsisVertical, LogOut, Settings } from 'lucide-react'
import { useAuth } from '@/features/auth/auth-context'

const ITEM =
  'flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-highlighted:bg-muted [&_svg]:size-4 [&_svg]:text-ink-muted'

function initials(text: string): string {
  const letters = text
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
  return letters.join('') || '?'
}

/** Signed-in account at the foot of the sidebar, with sign out. */
export function NavUser({ name }: { readonly name: string | null }): ReactNode {
  const { state, signOut } = useAuth()
  const email = state.status === 'signed-in' ? (state.session.user.email ?? '') : ''
  const title = name ?? email

  const identity = (
    <>
      <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-xs font-medium text-ink">
        {initials(title)}
      </span>
      <span className="grid min-w-0 flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{title}</span>
        {name ? <span className="truncate text-xs text-ink-muted">{email}</span> : null}
      </span>
    </>
  )

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex h-12 w-full items-center gap-2 rounded-md p-2 text-ink hover:bg-sidebar-active data-[state=open]:bg-sidebar-active">
        {identity}
        <EllipsisVertical aria-hidden="true" className="ml-auto size-4 text-ink-muted" />
        <span className="sr-only">Account menu</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="start"
          sideOffset={4}
          className="z-50 w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg border border-line bg-surface p-1 text-ink shadow-md md:data-[side=top]:translate-x-0"
        >
          <DropdownMenu.Label className="flex items-center gap-2 px-1 py-1.5">{identity}</DropdownMenu.Label>
          <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-line" />
          <DropdownMenu.Item asChild className={ITEM}>
            <Link to="/settings">
              <Settings aria-hidden="true" />
              Settings
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-line" />
          <DropdownMenu.Item className={ITEM} onSelect={() => void signOut()}>
            <LogOut aria-hidden="true" />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
