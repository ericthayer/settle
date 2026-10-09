import { useState, type ReactNode } from 'react'
import { AlertDialog } from 'radix-ui'
import { Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'

/** Voiding keeps the number and the record; the reason prints on the invoice. */
export function VoidInvoiceDialog({ number, disabled, onConfirm }: { readonly number: string; readonly disabled?: boolean; readonly onConfirm: (reason: string) => void }): ReactNode {
  const [reason, setReason] = useState('')
  return (
    <AlertDialog.Root onOpenChange={(open) => (open ? setReason('') : undefined)}>
      <AlertDialog.Trigger asChild>
        <Button variant="ghost" disabled={disabled}>
          <Ban aria-hidden="true" />
          Void
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 bg-ink/40" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-md border border-line bg-surface p-6 shadow-lg">
          <AlertDialog.Title className="mb-2 font-medium">Void {number}?</AlertDialog.Title>
          <AlertDialog.Description className="mb-4 text-sm text-ink-muted">
            The invoice stays on record as VOID and its number is never reused. This can’t be undone.
          </AlertDialog.Description>
          <Field label="Reason" hint="Optional. Printed on the voided invoice.">
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="mt-6 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary">Cancel</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant="danger" onClick={() => onConfirm(reason)}>
                Void invoice
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
