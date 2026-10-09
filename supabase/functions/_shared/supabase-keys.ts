// Server-side Supabase key for Edge Functions that act without a user session.
// Prefers the new secret key (SUPABASE_SECRET_KEYS), falling back to the legacy
// service role key. Never sent to a browser.

export function serviceRoleKey(): string {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (keys) {
    const parsed: unknown = JSON.parse(keys)
    if (parsed && typeof parsed === 'object' && 'default' in parsed && typeof parsed.default === 'string') return parsed.default
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
}
