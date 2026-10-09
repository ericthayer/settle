import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function Table({ className, ...props }: ComponentProps<'table'>): ReactNode {
  return (
    <div className="w-full overflow-x-auto rounded-md border border-line bg-surface">
      <table className={cn('w-full border-collapse text-sm', className)} {...props} />
    </div>
  )
}

export function TableHead({ className, ...props }: ComponentProps<'th'>): ReactNode {
  return (
    <th
      scope="col"
      className={cn('border-b border-line px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-ink-muted', className)}
      {...props}
    />
  )
}

export function TableCell({ className, ...props }: ComponentProps<'td'>): ReactNode {
  return <td className={cn('border-b border-line px-4 py-3 align-middle', className)} {...props} />
}
