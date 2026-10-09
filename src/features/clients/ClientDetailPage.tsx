import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Archive, ArchiveRestore } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useClient, useSaveClient, useSetClientArchived, type Client } from '@/data/clients'
import { useBusinessSettings, type BusinessSettings } from '@/data/settings'
import { NotFoundPage } from '@/routes/NotFoundPage'
import { ClientForm } from './ClientForm'
import { ClientInvoices } from './ClientInvoices'
import { formToClient, type ClientFormValues } from './client-form'

/** /clients/new and /clients/:id share this page. */
export function ClientDetailPage(): ReactNode {
  const { id } = useParams()
  const client = useClient(id)
  const settings = useBusinessSettings()

  if (id && client.isPending) return <p role="status" className="text-sm text-ink-muted">Loading…</p>
  if (id && client.isError) return <p role="alert" className="text-sm text-danger">Couldn’t load client: {client.error.message}</p>
  if (id && !client.data) return <NotFoundPage />

  // Remount per client so form defaults match the loaded row.
  return <ClientEditor key={id ?? 'new'} client={client.data ?? null} settings={settings.data ?? null} />
}

function ClientEditor({ client, settings }: { readonly client: Client | null; readonly settings: BusinessSettings | null }): ReactNode {
  const navigate = useNavigate()
  const save = useSaveClient()
  const setArchived = useSetClientArchived()
  const isNew = client === null

  async function onSubmit(values: ClientFormValues): Promise<void> {
    try {
      const row = await save.mutateAsync({ id: client?.id, input: formToClient(values) })
      toast.success(isNew ? `${row.name} added` : 'Client saved')
      void navigate(isNew ? `/clients/${row.id}` : '/clients', { replace: isNew })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Couldn’t save client')
    }
  }

  function toggleArchived(archived: boolean): void {
    if (!client) return
    setArchived.mutate(
      { id: client.id, archived },
      {
        onSuccess: () => toast.success(archived ? `${client.name} archived` : `${client.name} restored`),
        onError: (error) => toast.error(error.message),
      },
    )
  }

  const archived = Boolean(client?.archived_at)

  return (
    <>
      <PageHeader
        title={client?.name ?? 'New client'}
        actions={
          client ? (
            <div className="flex items-center gap-3">
              {archived ? <Badge>Archived</Badge> : null}
              {archived ? (
                <Button variant="secondary" disabled={setArchived.isPending} onClick={() => toggleArchived(false)}>
                  <ArchiveRestore aria-hidden="true" />
                  Restore
                </Button>
              ) : (
                <ConfirmDialog
                  title={`Archive ${client.name}?`}
                  description="Archived clients are hidden from lists and can’t be picked for new invoices. Their invoices and history stay intact, and you can restore them any time."
                  confirmLabel="Archive client"
                  onConfirm={() => toggleArchived(true)}
                  trigger={
                    <Button variant="secondary" disabled={setArchived.isPending}>
                      <Archive aria-hidden="true" />
                      Archive
                    </Button>
                  }
                />
              )}
            </div>
          ) : null
        }
      />
      <div className="flex flex-col gap-6 pb-4">
        <ClientForm
          client={client}
          settings={settings}
          submitLabel={isNew ? 'Add client' : 'Save changes'}
          onSubmit={onSubmit}
          onCancel={() => void navigate('/clients')}
        />
        {client ? <ClientInvoices clientId={client.id} fallbackCurrency={client.currency ?? settings?.default_currency ?? 'USD'} /> : null}
      </div>
    </>
  )
}
