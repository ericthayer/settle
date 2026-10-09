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
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className={cn('tabular text-2xl font-semibold @[250px]/card:text-3xl', alert && 'text-danger')}>
        {first ? formatMoney({ minor: first.minor, currency: toCurrencyCode(first.currency) }) : detail}
      </dd>
      {rest.map((v) => (
        <dd key={v.currency} className={cn('tabular text-sm font-medium', alert ? 'text-danger' : 'text-ink')}>
          + {formatMoney({ minor: v.minor, currency: toCurrencyCode(v.currency) })}
        </dd>
      ))}
      {first ? <dd className="mt-auto pt-4 text-sm text-ink-muted">{detail}</dd> : null}
    </>
  )

  // shadcn section card: faint primary wash rising from the foot of the card.
  const frame = '@container/card flex h-full flex-col gap-1.5 rounded-xl border border-line bg-surface bg-linear-to-t from-accent/5 to-surface p-6 shadow-xs dark:bg-none'
  if (!href) return <dl className={frame}>{body}</dl>
  return (
    <Link to={href} className={cn(frame, 'transition-shadow hover:shadow-md')}>
      <dl className="flex flex-1 flex-col gap-1.5">{body}</dl>
    </Link>
  )
}
