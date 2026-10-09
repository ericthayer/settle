import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'

export function EmptyState({ title, children }: { readonly title: string; readonly children: ReactNode }): ReactNode {
  return (
    <Card className="flex flex-col items-start gap-2 border-dashed">
      <h2 className="font-medium">{title}</h2>
      <p className="text-sm text-ink-muted">{children}</p>
    </Card>
  )
}
