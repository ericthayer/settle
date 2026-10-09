import { useEffect, type ReactNode } from 'react'
import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { isStaleChunkError } from './stale-chunk'

const RELOAD_FLAG = 'settle:chunk-reload'

function readFlag(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_FLAG) === '1'
  } catch {
    return true // no storage: don't risk a reload loop
  }
}

export function RouteError(): ReactNode {
  const error = useRouteError()
  const stale = isStaleChunkError(error)
  const shouldReload = stale && !readFlag()

  useEffect(() => {
    if (!shouldReload) return
    try {
      sessionStorage.setItem(RELOAD_FLAG, '1')
    } catch {
      return
    }
    window.location.reload()
  }, [shouldReload])

  useEffect(() => {
    // A page that renders without a stale-chunk error clears the guard for next time.
    if (!stale) {
      try {
        sessionStorage.removeItem(RELOAD_FLAG)
      } catch {
        /* ignore */
      }
    }
  }, [stale])

  if (shouldReload) {
    return (
      <p role="status" className="p-8 text-sm text-ink-muted">
        Updating to the latest version…
      </p>
    )
  }

  const detail = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error instanceof Error ? error.message : null

  return (
    <div className="mx-auto max-w-xl p-8">
      <PageHeader title="Something went wrong" />
      <p className="mb-4 text-sm text-ink-muted">
        {stale ? 'Settle was updated while this tab was open. Reload to get the latest version.' : 'This page hit an unexpected error.'}
      </p>
      {detail ? (
        <pre className="mb-6 overflow-x-auto rounded-md border border-line bg-surface p-3 text-xs text-ink-muted">{detail}</pre>
      ) : null}
      <div className="flex gap-4 text-sm">
        <button type="button" className="text-accent underline underline-offset-4" onClick={() => window.location.reload()}>
          Reload
        </button>
        <Link to="/" className="text-accent underline underline-offset-4">
          Back to the dashboard
        </Link>
      </div>
    </div>
  )
}
