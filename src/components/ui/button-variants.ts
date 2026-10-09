import { cva } from 'class-variance-authority'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,box-shadow] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-ink shadow-xs hover:bg-accent/90',
        secondary: 'border border-line bg-surface text-ink shadow-xs hover:bg-muted',
        ghost: 'text-ink hover:bg-muted',
        danger: 'bg-danger text-white shadow-xs hover:bg-danger/90',
      },
      size: {
        sm: 'h-8 gap-1.5 px-3',
        md: 'h-9 px-4',
        icon: 'size-9',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)
