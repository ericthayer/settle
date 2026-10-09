import { useDeferredValue, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Plus, Search } from 'lucide-react'
import { EmptyState } from '@/components/layout/EmptyState'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableCell, TableHead } from '@/components/ui/table'
import { useClients, type Client } from '@/data/clients'
import { filterClients } from './filter-clients'

export function ClientsPage(): ReactNode {
  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState('')
  const query = useDeferredValue(search)
  const clients = useClients(showArchived)
  const visible = useMemo(() => filterClients(clients.data ?? [], query), [clients.data, query])

  return (
    <>
      <PageHeader
        title="Clients"
        actions={
          <Button asChild>
            <Link to="/clients/new">
              <Plus aria-hidden="true" />
              New client
            </Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="relative w-full max-w-xs">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <Input
            type="search"
            aria-label="Search clients"
            placeholder="Search by name or email"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" className="size-4 accent-accent" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
      </div>

      {clients.isPending ? (
        <p role="status" className="text-sm text-ink-muted">
          Loading…
        </p>
      ) : clients.isError ? (
        <p role="alert" className="text-sm text-danger">
          Couldn’t load clients: {clients.error.message}
        </p>
      ) : clients.data.length === 0 ? (
        <EmptyState title="No clients yet">
          Add the people and companies you bill. Their address, terms and currency carry into every invoice.
        </EmptyState>
      ) : (
        <ClientTable clients={visible} total={clients.data.length} />
      )}
    </>
  )
}

function ClientTable({ clients, total }: { readonly clients: readonly Client[]; readonly total: number }): ReactNode {
  return (
    <>
      <p className="sr-only" aria-live="polite">
        Showing {clients.length} of {total} clients
      </p>
      <Table>
        <caption className="sr-only">Clients</caption>
        <thead>
          <tr>
            <TableHead>Name</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Email</TableHead>
            <TableHead className="text-right">Terms</TableHead>
          </tr>
        </thead>
        <tbody>
          {clients.length === 0 ? (
            <tr>
              <TableCell colSpan={4} className="text-ink-muted">
                No clients match your search.
              </TableCell>
            </tr>
          ) : (
            clients.map((client) => (
              <tr key={client.id} className="hover:bg-muted/50">
                <TableCell>
                  <Link to={`/clients/${client.id}`} className="font-medium text-ink underline-offset-4 hover:underline">
                    {client.name}
                  </Link>
                  {client.archived_at ? (
                    <Badge className="ml-2">Archived</Badge>
                  ) : null}
                </TableCell>
                <TableCell className="text-ink-muted">{client.contact_name ?? '—'}</TableCell>
                <TableCell className="text-ink-muted">{client.email ?? '—'}</TableCell>
                <TableCell className="tabular text-right text-ink-muted">
                  {client.payment_terms_days == null ? 'Default' : `Net ${client.payment_terms_days}`}
                </TableCell>
              </tr>
            ))
          )}
        </tbody>
      </Table>
    </>
  )
}
