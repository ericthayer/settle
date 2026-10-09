import type { ComponentProps, ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'

/** Native <select>: keyboard, screen reader and mobile pickers for free. */
export function NativeSelect({ className, children, ...props }: ComponentProps<'select'>): ReactNode {
  return (
    <div className="relative">
      <select
        className={cn(
          'h-9 w-full appearance-none rounded-md border border-line bg-surface pl-3 pr-9 text-sm text-ink shadow-xs focus-visible:border-focus',
          'aria-invalid:border-danger aria-invalid:ring-3 aria-invalid:ring-danger/20 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
      />
    </div>
  )
}
