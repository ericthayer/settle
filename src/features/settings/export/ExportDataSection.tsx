import { useState, type ReactNode } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { FormSection } from '@/components/layout/FormSection'
import { Button } from '@/components/ui/button'
import { fetchExportData } from '@/data/export'
import { todayIn } from '@/lib/dates'
import { friendlyDbError } from '@/lib/db-errors'
import { downloadText } from '@/lib/download'
import { exportFileName, invoicesCsv, paymentsCsv, toExportJson } from './export-format'

type ExportKind = 'json' | 'invoices' | 'payments'

const KINDS: readonly { readonly kind: ExportKind; readonly label: string }[] = [
  { kind: 'json', label: 'All data (JSON)' },
  { kind: 'invoices', label: 'Invoices (CSV)' },
  { kind: 'payments', label: 'Payments (CSV)' },
]

/** Byte order mark so Excel opens UTF-8 CSV with accents and symbols intact. */
const BOM = '﻿'

export function ExportDataSection({ timezone }: { readonly timezone: string }): ReactNode {
  const [busy, setBusy] = useState<ExportKind | null>(null)

  async function run(kind: ExportKind): Promise<void> {
    setBusy(kind)
    try {
      const data = await fetchExportData()
      const name = exportFileName(kind, todayIn(timezone))
      if (kind === 'json') downloadText(name, 'application/json', toExportJson(data.tables))
      else downloadText(name, 'text/csv;charset=utf-8', BOM + (kind === 'invoices' ? invoicesCsv(data) : paymentsCsv(data)))
      toast.success(`Downloaded ${name}`)
    } catch (err) {
      toast.error(`Export failed: ${friendlyDbError(err)}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <FormSection
      title="Export data"
      description="Your data stays yours. The JSON file holds every table as stored, including archived clients, void invoices and removed payments. The CSV files open in any spreadsheet."
    >
      <div className="flex flex-wrap gap-2" aria-busy={busy !== null}>
        {KINDS.map(({ kind, label }) => (
          <Button key={kind} type="button" variant="secondary" disabled={busy !== null} onClick={() => void run(kind)}>
            <Download aria-hidden="true" />
            {busy === kind ? 'Preparing…' : label}
          </Button>
        ))}
      </div>
    </FormSection>
  )
}
