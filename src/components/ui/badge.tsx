import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn'

const TONES = {
  neutral: 'border-line text-ink-muted',
  success: 'border-success/25 bg-success-soft text-success',
  warn: 'border-warn/25 bg-warn-soft text-warn',
  danger: 'border-danger/25 bg-danger-soft text-danger',
} as const

export type BadgeTone = keyof typeof TONES

export function Badge({ tone = 'neutral', className, ...props }: ComponentProps<'span'> & { readonly tone?: BadgeTone }): ReactNode {
  return (
    <span
      className={cn('inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium', TONES[tone], className)}
      {...props}
    />
  )
}
