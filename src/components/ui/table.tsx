import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function Table({ className, ...props }: ComponentProps<'table'>): ReactNode {
  return (
    <div className="w-full overflow-x-auto rounded-lg border border-line bg-surface">
      <table className={cn('w-full border-collapse text-sm [&_tbody_tr:last-child>td]:border-b-0 [&_tbody_tr]:transition-colors', className)} {...props} />
    </div>
  )
}

export function TableHead({ className, ...props }: ComponentProps<'th'>): ReactNode {
  return (
    <th
      scope="col"
      className={cn('h-10 whitespace-nowrap border-b border-line bg-muted px-4 text-left align-middle font-medium text-ink', className)}
      {...props}
    />
  )
}

export function TableCell({ className, ...props }: ComponentProps<'td'>): ReactNode {
  return <td className={cn('whitespace-nowrap border-b border-line px-4 py-3 align-middle', className)} {...props} />
}
