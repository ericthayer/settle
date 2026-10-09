import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '@/lib/cn'
import { formatMoney, toCurrencyCode } from '@/lib/money'
import type { CurrencyAmount } from './dashboard-model'

interface KpiTileProps {
  readonly label: string
  /** Money per currency; omitted for count-only tiles. */
  readonly amounts?: readonly CurrencyAmount[]
  readonly primaryCurrency: string
  /** Secondary line, e.g. "3 invoices". For count-only tiles this is the value. */
  readonly detail: string
  readonly tone?: 'default' | 'danger'
  /** Filtered invoice list this number comes from. */
  readonly href?: string
}

/** One dashboard figure. Extra currencies stack under the primary one rather than being converted. */
export function KpiTile({ label, amounts, primaryCurrency, detail, tone = 'default', href }: KpiTileProps): ReactNode {
  const values = amounts && amounts.length > 0 ? amounts : amounts ? [{ currency: primaryCurrency, minor: 0 }] : []
  const [first, ...rest] = values
  const alert = tone === 'danger' && values.some((v) => v.minor > 0)

  const body = (
    <>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className={cn('tabular text-2xl font-semibold tracking-tight', alert && 'text-danger')}>
        {first ? formatMoney({ minor: first.minor, currency: toCurrencyCode(first.currency) }) : detail}
      </dd>
      {rest.map((v) => (
        <dd key={v.currency} className={cn('tabular text-sm font-medium', alert ? 'text-danger' : 'text-ink')}>
          + {formatMoney({ minor: v.minor, currency: toCurrencyCode(v.currency) })}
        </dd>
      ))}
      {first ? <dd className="text-sm text-ink-muted">{detail}</dd> : null}
    </>
  )

  const frame = 'flex h-full flex-col gap-1 rounded-md border border-line bg-surface p-5'
  if (!href) return <dl className={frame}>{body}</dl>
  return (
    <Link to={href} className={cn(frame, 'transition-colors hover:border-accent/60 hover:bg-paper')}>
      <dl className="flex flex-col gap-1">{body}</dl>
    </Link>
  )
}
