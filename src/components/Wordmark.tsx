import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Lowercase wordmark with the check symbol. */
export function Wordmark({ className }: { readonly className?: string }): ReactNode {
  return (
    <span className={cn('inline-flex items-center gap-2 text-lg font-semibold tracking-tight text-ink', className)}>
      <svg viewBox="0 0 32 32" className="size-6" aria-hidden="true">
        <rect width="32" height="32" rx="8" className="fill-accent" />
        <path
          d="M9 16.5l4.5 4.5L23 11.5"
          fill="none"
          className="stroke-accent-ink"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      settle
    </span>
  )
}
