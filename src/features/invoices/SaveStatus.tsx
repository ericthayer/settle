import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import type { SaveState } from './useDraftAutosave'

const LABEL: Record<SaveState, string> = {
  saved: 'All changes saved',
  pending: 'Unsaved changes',
  saving: 'Saving…',
  invalid: 'Fix the highlighted fields to save',
  error: 'Couldn’t save',
}

export function SaveStatus({ state, error }: { readonly state: SaveState; readonly error: string | null }): ReactNode {
  return (
    <p role="status" aria-live="polite" className={cn('text-sm', state === 'error' || state === 'invalid' ? 'text-danger' : 'text-ink-muted')}>
      {LABEL[state]}
      {state === 'error' && error ? `: ${error}` : ''}
    </p>
  )
}
