import type { ExportData, ExportTables } from '@/data/export'
import { invoicesCsv, minorToDecimal, parseExportJson, paymentsCsv, PAYMENT_CSV_HEADERS, toCsv, toExportJson } from './export-format'

/** Independent RFC 4180 reader, so the round trip doesn't test the writer against itself. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\r' && text[i + 1] === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      i++
    } else cell += ch
  }
  return rows
}

const tables = {
  business_settings: [{ id: 's1', owner_id: 'u1', business_name: 'Thayer “Design”', address: { city: 'Portland' }, default_currency: 'USD', next_invoice_number: 3 }],
  clients: [
    { id: 'c1', name: 'Acme, Inc.', archived_at: null, billing_address: { line1: '1 Desert Rd\nSuite 2' } },
    { id: 'c2', name: 'Old Co', archived_at: '2026-10-01T00:00:00Z', billing_address: {} },
  ],
  invoices: [
    { id: 'i1', client_id: 'c1', number: 'INV-0001', lifecycle: 'issued', currency: 'USD', total_minor: 123456 },
    { id: 'i2', client_id: 'c2', number: 'INV-0002', lifecycle: 'void', currency: 'JPY', total_minor: 5000, void_reason: 'Duplicate' },
  ],
  invoice_line_items: [{ id: 'l1', invoice_id: 'i1', position: 0, description: 'Design, "phase 1"', quantity: 1.5, unit_price_minor: 82304 }],
  payments: [
    { id: 'p1', invoice_id: 'i1', amount_minor: 100000, currency: 'USD', paid_on: '2026-10-05', created_at: '2026-10-05T10:00:00Z', method: 'check', reference: '=HYPERLINK("x")', note: 'Deposit, thanks', status: 'succeeded', deleted_at: null },
    { id: 'p2', invoice_id: 'i1', amount_minor: 500, currency: 'USD', paid_on: '2026-10-01', created_at: '2026-10-01T10:00:00Z', method: 'cash', reference: null, note: null, status: 'succeeded', deleted_at: '2026-10-02T00:00:00Z' },
  ],
} as unknown as ExportTables

const data: ExportData = {
  tables,
  invoiceSummary: [
    { id: 'i2', number: 'INV-0002', status: 'void', client_name: 'Old Co', issue_date: '2026-09-01', due_date: '2026-10-01', currency: 'JPY', subtotal_minor: 5000, tax_minor: 0, total_minor: 5000, amount_paid_minor: 0, balance_minor: 5000, days_overdue: 0, void_reason: 'Duplicate' },
    { id: 'i1', number: 'INV-0001', status: 'partially_paid', client_name: 'Acme, Inc.', issue_date: '2026-10-01', due_date: '2026-10-31', currency: 'USD', subtotal_minor: 123456, tax_minor: 0, total_minor: 123456, amount_paid_minor: 100000, balance_minor: 23456, days_overdue: 0, void_reason: null },
  ] as unknown as ExportData['invoiceSummary'],
}

describe('JSON export', () => {
  it('round-trips every table exactly', () => {
    const json = toExportJson(tables, new Date('2026-10-09T12:00:00Z'))
    const file = parseExportJson(json)
    expect(file.exported_at).toBe('2026-10-09T12:00:00.000Z')
    expect(file.tables).toEqual(tables)
  })

  it('rejects files that are not a Settle export', () => {
    expect(() => parseExportJson('{"format":"other"}')).toThrow('Not a Settle export')
    expect(() => parseExportJson('{"format":"settle-export","version":2,"tables":{}}')).toThrow('Unsupported export version 2')
    expect(() => parseExportJson('{"format":"settle-export","version":1,"tables":{"clients":[]}}')).toThrow('missing business_settings')
  })
})

describe('CSV export', () => {
  it('writes amounts as plain decimals in each currency’s precision', () => {
    expect(minorToDecimal(123456, 'USD')).toBe('1234.56')
    expect(minorToDecimal(5, 'USD')).toBe('0.05')
    expect(minorToDecimal(5000, 'JPY')).toBe('5000')
    expect(minorToDecimal(null, 'USD')).toBe('')
  })

  it('round-trips invoices with commas and quotes, sorted by number', () => {
    const rows = parseCsv(invoicesCsv(data))
    expect(rows[0]).toEqual(['number', 'status', 'client', 'issue_date', 'due_date', 'currency', 'subtotal', 'tax', 'total', 'paid', 'balance', 'days_overdue', 'void_reason', 'id'])
    expect(rows[1]).toEqual(['INV-0001', 'partially_paid', 'Acme, Inc.', '2026-10-01', '2026-10-31', 'USD', '1234.56', '0.00', '1234.56', '1000.00', '234.56', '0', '', 'i1'])
    expect(rows[2]?.slice(0, 3)).toEqual(['INV-0002', 'void', 'Old Co'])
    expect(rows[2]?.[8]).toBe('5000')
    expect(rows).toHaveLength(3)
  })

  it('lists every payment by date, removed ones flagged, with formula-looking text neutralised', () => {
    const rows = parseCsv(paymentsCsv(data))
    expect(rows[0]).toEqual([...PAYMENT_CSV_HEADERS])
    expect(rows[1]).toEqual(['INV-0001', '2026-10-01', '5.00', 'USD', 'cash', '', '', 'succeeded', '2026-10-02T00:00:00Z', 'p2', 'i1'])
    expect(rows[2]?.slice(0, 7)).toEqual(['INV-0001', '2026-10-05', '1000.00', 'USD', 'check', `'=HYPERLINK("x")`, 'Deposit, thanks'])
  })

  it('quotes newlines and only guards text columns', () => {
    const csv = toCsv(['note', 'amount'], [['line 1\nline 2', '-5.00']], new Set(['note']))
    expect(parseCsv(csv)).toEqual([['note', 'amount'], ['line 1\nline 2', '-5.00']])
    expect(parseCsv(toCsv(['note'], [['-1 day']], new Set(['note'])))[1]).toEqual([`'-1 day`])
  })
})
