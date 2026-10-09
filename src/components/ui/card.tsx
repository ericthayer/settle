import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function Card({ className, ...props }: ComponentProps<'section'>): ReactNode {
  return <section className={cn('rounded-md border border-line bg-surface p-6', className)} {...props} />
}
