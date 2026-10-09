import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { FormSection } from '@/components/layout/FormSection'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { NativeSelect } from '@/components/ui/native-select'
import { useClients, type Client } from '@/data/clients'
import { useCreateDraft } from '@/data/invoices'
import { useBusinessSettings, type BusinessSettings } from '@/data/settings'
import { friendlyDbError } from '@/lib/db-errors'
import { QuickClientDialog } from './QuickClientDialog'

/** Step 1 of the golden path: pick a client, then a prefilled draft opens in the builder. */
export function NewInvoicePage(): ReactNode {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const clients = useClients(false)
  const settings = useBusinessSettings()
  const create = useCreateDraft()
  const [clientId, setClientId] = useState(params.get('client') ?? '')
  const [extra, setExtra] = useState<Client | null>(null)
  const autoStarted = useRef(false)
  const { mutateAsync } = create

  const options = [...(clients.data ?? []), ...(extra && !clients.data?.some((c) => c.id === extra.id) ? [extra] : [])]

  const start = useCallback(async (client: Client, biz: BusinessSettings): Promise<void> => {
    try {
      const draft = await mutateAsync({
        client_id: client.id,
        currency: client.currency ?? biz.default_currency,
        tax_rate_bps: biz.default_tax_rate_bps,
        notes: biz.default_notes,
        payment_instructions: biz.payment_instructions,
      })
      void navigate(`/invoices/${draft.id}/edit`, { replace: true })
    } catch (err) {
      toast.error(friendlyDbError(err))
    }
  }, [mutateAsync, navigate])

  // Coming from a client page (?client=…): skip the picker.
  useEffect(() => {
    const preset = params.get('client')
    if (autoStarted.current || !preset || !clients.data || !settings.data) return
    const client = clients.data.find((c) => c.id === preset)
    if (!client) return
    autoStarted.current = true
    void start(client, settings.data)
  }, [clients.data, settings.data, params, start])

  const selected = options.find((c) => c.id === clientId)

  return (
    <>
      <PageHeader title="New invoice" />
      <FormSection title="Who is this invoice for?">
        {clients.isPending ? (
          <p role="status" className="text-sm text-ink-muted">
            Loading clients…
          </p>
        ) : (
          <form
            className="flex flex-col gap-4 @lg:flex-row @lg:items-end"
            onSubmit={(e) => {
              e.preventDefault()
              if (selected && settings.data) void start(selected, settings.data)
            }}
          >
            <Field label="Client" className="@lg:w-80">
              <NativeSelect value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">Choose a client…</option>
                {options.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <div className="flex gap-2">
              <Button type="submit" disabled={!selected || create.isPending}>
                {create.isPending ? 'Creating…' : 'Create draft'}
              </Button>
              <QuickClientDialog
                onCreated={(c) => {
                  setExtra(c)
                  setClientId(c.id)
                }}
              />
            </div>
          </form>
        )}
      </FormSection>
    </>
  )
}
