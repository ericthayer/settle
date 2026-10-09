import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn'

const TONES = {
  neutral: 'bg-line/60 text-ink-muted',
  accent: 'bg-accent-soft text-accent',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
} as const

export type BadgeTone = keyof typeof TONES

export function Badge({ tone = 'neutral', className, ...props }: ComponentProps<'span'> & { readonly tone?: BadgeTone }): ReactNode {
  return <span className={cn('inline-flex items-center rounded px-2 py-0.5 text-xs font-medium', TONES[tone], className)} {...props} />
}
