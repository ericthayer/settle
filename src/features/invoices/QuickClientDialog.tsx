import { useState, type FormEvent, type ReactNode } from 'react'
import { Dialog } from 'radix-ui'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useSaveClient, type Client } from '@/data/clients'
import { friendlyDbError } from '@/lib/db-errors'

/** Add a client without leaving the invoice. Full details can be filled in later. */
export function QuickClientDialog({ onCreated }: { readonly onCreated: (client: Client) => void }): ReactNode {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const save = useSaveClient()

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!name.trim()) {
      setError('Client name is required.')
      return
    }
    try {
      const client = await save.mutateAsync({ input: { name: name.trim(), email: email.trim() || null } })
      onCreated(client)
      setOpen(false)
      setName('')
      setEmail('')
      setError(null)
      toast.success(`${client.name} added`)
    } catch (err) {
      toast.error(friendlyDbError(err))
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <Plus aria-hidden="true" />
          New client
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-ink/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-md border border-line bg-surface p-6 shadow-lg">
          <Dialog.Title className="mb-1 font-medium">New client</Dialog.Title>
          <Dialog.Description className="mb-5 text-sm text-ink-muted">Add the address and terms later from Clients.</Dialog.Description>
          <form noValidate onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
            <Field label="Client name" required error={error ?? undefined}>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
            </Field>
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
            </Field>
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? 'Adding…' : 'Add client'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
