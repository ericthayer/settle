import type { ReactNode } from 'react'
import { AlertDialog } from 'radix-ui'
import { Button } from './button'

interface ConfirmDialogProps {
  readonly trigger: ReactNode
  readonly title: string
  readonly description: string
  readonly confirmLabel: string
  readonly tone?: 'primary' | 'danger'
  readonly onConfirm: () => void
}

/** Radix AlertDialog: focus trapped, Escape cancels, focus returns to the trigger. */
export function ConfirmDialog({ trigger, title, description, confirmLabel, tone = 'primary', onConfirm }: ConfirmDialogProps): ReactNode {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 bg-black/50" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-surface p-6 shadow-lg">
          <AlertDialog.Title className="mb-2 text-lg font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mb-6 text-sm text-ink-muted">{description}</AlertDialog.Description>
          <div className="flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary">Cancel</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant={tone} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
