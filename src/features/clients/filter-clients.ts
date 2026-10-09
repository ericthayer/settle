import type { Client } from '@/data/clients'

/** Case-insensitive match on name, contact and email. */
export function filterClients(clients: readonly Client[], query: string): Client[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...clients]
  return clients.filter((c) => [c.name, c.contact_name, c.email].some((field) => field?.toLowerCase().includes(q)))
}
