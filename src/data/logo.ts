import { useMutation, useQuery, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query'
import { requireSupabase } from '@/lib/supabase'
import { queryKeys } from './keys'

const BUCKET = 'logos'
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export const LOGO_MAX_BYTES = 1024 * 1024
const SIGNED_URL_TTL_S = 60 * 60

const EXT: Record<(typeof LOGO_TYPES)[number], string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

export function validateLogo(file: File): string | null {
  if (!(LOGO_TYPES as readonly string[]).includes(file.type)) return 'Use a PNG, JPEG or WebP image.'
  if (file.size > LOGO_MAX_BYTES) return 'Logo must be 1 MB or smaller.'
  return null
}

/** Uploads to `{owner_id}/logo.{ext}` (the storage policy checks the first folder) and returns the path. */
export function useUploadLogo(): UseMutationResult<string, Error, { file: File; ownerId: string; previousPath: string | null }> {
  return useMutation({
    mutationFn: async ({ file, ownerId, previousPath }) => {
      const problem = validateLogo(file)
      if (problem) throw new Error(problem)
      const ext = EXT[file.type as (typeof LOGO_TYPES)[number]]
      // Versioned name so cached signed URLs never show a stale image.
      const path = `${ownerId}/logo-${Date.now()}.${ext}`
      const storage = requireSupabase().storage.from(BUCKET)
      const { error } = await storage.upload(path, file, { contentType: file.type, upsert: false })
      if (error) throw error
      if (previousPath && previousPath !== path) await storage.remove([previousPath])
      return path
    },
  })
}

export async function removeLogo(path: string): Promise<void> {
  const { error } = await requireSupabase().storage.from(BUCKET).remove([path])
  if (error) throw error
}

/** Short-lived signed URL for the private logo. */
export function useLogoUrl(path: string | null | undefined): UseQueryResult<string> {
  return useQuery({
    queryKey: queryKeys.logoUrl(path ?? ''),
    enabled: Boolean(path),
    staleTime: (SIGNED_URL_TTL_S - 300) * 1000,
    queryFn: async () => {
      const { data, error } = await requireSupabase().storage.from(BUCKET).createSignedUrl(path ?? '', SIGNED_URL_TTL_S)
      if (error) throw error
      return data.signedUrl
    },
  })
}
