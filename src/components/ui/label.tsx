import type { ComponentProps, ReactNode } from 'react'
import { Label as LabelPrimitive } from 'radix-ui'
import { cn } from '@/lib/cn'

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>): ReactNode {
  return <LabelPrimitive.Root className={cn('text-sm font-medium text-ink', className)} {...props} />
}
