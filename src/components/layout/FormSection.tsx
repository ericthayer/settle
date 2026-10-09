import { useId, type ReactNode } from 'react'
import { Card } from '@/components/ui/card'

/** A titled card that groups related form fields. */
export function FormSection({ title, description, children }: { readonly title: string; readonly description?: string; readonly children: ReactNode }): ReactNode {
  const id = useId()
  return (
    <Card aria-labelledby={id} className="@container flex flex-col gap-5">
      <div>
        <h2 id={id} className="font-medium">
          {title}
        </h2>
        {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {children}
    </Card>
  )
}
