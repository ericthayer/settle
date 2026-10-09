import type { ReactNode } from 'react'

export function PageHeader({ title, actions }: { readonly title: string; readonly actions?: ReactNode }): ReactNode {
  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {actions}
    </div>
  )
}
