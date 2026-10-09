/** Turns Postgres/PostgREST errors into sentences for toasts. */
const CONSTRAINTS: Record<string, string> = {
  invoices_due_after_issue: 'The due date is before the issue date. Change the due date, or clear it to use the client’s terms.',
  invoices_number_unique: 'That invoice number is already used. Raise “Next number” in Settings.',
}

export function friendlyDbError(error: unknown, fallback = 'Something went wrong. Try again.'): string {
  const message = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : ''
  for (const [constraint, text] of Object.entries(CONSTRAINTS)) {
    if (message.includes(constraint)) return text
  }
  if (/failed to fetch|network/i.test(message)) return 'You appear to be offline. Changes will save when you reconnect.'
  return message || fallback
}
