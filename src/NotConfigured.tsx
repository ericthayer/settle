import type { ReactNode } from 'react'
import { Wordmark } from '@/components/Wordmark'
import { Card } from '@/components/ui/card'

/** Shown when a build has no Supabase credentials, instead of a blank crash. */
export function NotConfigured(): ReactNode {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <Card className="max-w-md">
        <Wordmark className="mb-4" />
        <h1 className="mb-2 font-medium">Not connected to a database</h1>
        <p className="text-sm text-ink-muted">
          Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> for this build. See{' '}
          <code>.env.example</code>.
        </p>
      </Card>
    </main>
  )
}
