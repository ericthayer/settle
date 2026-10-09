/** Query keys in one place so mutations invalidate the right caches. */
export const queryKeys = {
  settings: ['business_settings'] as const,
  logoUrl: (path: string) => ['logo_url', path] as const,
  clients: (opts: { includeArchived: boolean }) => ['clients', opts] as const,
  clientsAll: ['clients'] as const,
  client: (id: string) => ['client', id] as const,
  clientInvoices: (id: string) => ['client_invoices', id] as const,
}
