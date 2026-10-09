import type { ComponentProps, ReactNode } from 'react'
import { Slot } from 'radix-ui'
import type { VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'
import { buttonVariants } from './button-variants'

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child element (e.g. a router Link) with button styling. */
    readonly asChild?: boolean
  }

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps): ReactNode {
  const Component = asChild ? Slot.Root : 'button'
  return <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
