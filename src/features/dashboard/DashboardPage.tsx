import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Plus } from 'lucide-react'
import { EmptyState } from '@/components/layout/EmptyState'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { useDashboard } from '@/data/dashboard'
import { useBusinessSettings } from '@/data/settings'
import { todayIn } from '@/lib/dates'
import { friendlyDbError } from '@/lib/db-errors'
import { computeKpis, DUE_SOON_DAYS, followUps, monthStart } from './dashboard-model'
import { FollowUpList } from './FollowUpList'
import { KpiTile } from './KpiTile'

function invoices(n: number): string {
  return `${n} ${n === 1 ? 'invoice' : 'invoices'}`
}

export function DashboardPage(): ReactNode {
  const settings = useBusinessSettings()
  const today = settings.data ? todayIn(settings.data.timezone) : null
  const dashboard = useDashboard(today ? monthStart(today) : null)
  const primary = settings.data?.default_currency ?? 'USD'

  const view = useMemo(() => {
    if (!dashboard.data || !today) return null
    const { open, received, drafts } = dashboard.data
    return { kpis: computeKpis(open, received, drafts, primary), followUps: followUps(open, today) }
  }, [dashboard.data, today, primary])

  const header = (
    <PageHeader
      title="Dashboard"
      actions={
        <Button asChild>
          <Link to="/invoices/new">
            <Plus aria-hidden="true" />
            New invoice
          </Link>
        </Button>
      }
    />
  )

  if (dashboard.isError) {
    return (
      <>
        {header}
        <p role="alert" className="text-sm text-danger">
          Couldn’t load the dashboard: {friendlyDbError(dashboard.error)}
        </p>
      </>
    )
  }
  if (!view || !today) {
    return (
      <>
        {header}
        <p role="status" className="text-sm text-ink-muted">
          Loading…
        </p>
      </>
    )
  }

  const { kpis } = view
  const overdueCount = kpis.overdue.count

  return (
    <>
      {header}
      <section aria-labelledby="kpi-heading" className="@container mb-10">
        <h2 id="kpi-heading" className="sr-only">
          At a glance
        </h2>
        <ul className="grid gap-4 @md:grid-cols-2 @4xl:grid-cols-4">
          <li>
            <KpiTile
              label="Outstanding"
              amounts={kpis.outstanding.amounts}
              primaryCurrency={primary}
              detail={invoices(kpis.outstanding.count)}
              href="/invoices?status=outstanding"
            />
          </li>
          <li>
            <KpiTile
              label="Overdue"
              amounts={kpis.overdue.amounts}
              primaryCurrency={primary}
              detail={invoices(overdueCount)}
              tone="danger"
              href="/invoices?status=overdue"
            />
          </li>
          <li>
            <KpiTile
              label="Received this month"
              amounts={kpis.receivedThisMonth.amounts}
              primaryCurrency={primary}
              detail={`${kpis.receivedThisMonth.count} ${kpis.receivedThisMonth.count === 1 ? 'payment' : 'payments'}`}
            />
          </li>
          <li>
            <KpiTile label="Drafts" primaryCurrency={primary} detail={String(kpis.drafts)} href="/invoices?status=draft" />
          </li>
        </ul>
      </section>

      <section aria-labelledby="follow-up-heading">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="follow-up-heading" className="font-medium">
            Needs follow-up
          </h2>
          <p className="text-sm text-ink-muted">Overdue, then due in the next {DUE_SOON_DAYS} days</p>
        </div>
        {view.followUps.length === 0 ? (
          <EmptyState title="Nothing to chase">
            {kpis.outstanding.count === 0
              ? 'Every issued invoice is paid. New ones show here when they come due.'
              : `Nothing is overdue or due in the next ${DUE_SOON_DAYS} days.`}
          </EmptyState>
        ) : (
          <FollowUpList items={view.followUps} today={today} />
        )}
      </section>
    </>
  )
}
