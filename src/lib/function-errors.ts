import { FunctionsHttpError } from '@supabase/supabase-js'

/** Edge Functions answer errors as { error: string }; surface that sentence. */
export async function functionErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const body: unknown = await (error.context as Response).json().catch(() => null)
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return body.error
  }
  return error instanceof Error ? error.message : fallback
}
