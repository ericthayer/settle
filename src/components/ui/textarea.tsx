import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function Textarea({ className, rows = 3, ...props }: ComponentProps<'textarea'>): ReactNode {
  return (
    <textarea
      rows={rows}
      className={cn(
        'w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted',
        'aria-invalid:border-danger disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
