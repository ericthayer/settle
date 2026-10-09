import { expect, test, type Locator, type Page } from '@playwright/test'
import { cleanUpClient, invoiceSummary, testUser, testUserDb } from './support/test-user.ts'

/**
 * Golden path: client → draft → issue → PDF totals → email + shared link →
 * partial payment → reminder → full payment → Paid.
 *
 * Email goes to Resend's test inbox, which accepts the message and delivers nothing.
 *
 * Amounts exercise half-up rounding on both a line and the tax:
 *   3 × $1,250.00          = $3,750.00
 *   2.5 × $19.99 = $49.975 → $49.98
 *   subtotal                 $3,799.98
 *   tax 8.25% = $313.49835 → $313.50
 *   total                    $4,113.48
 */
const EXPECTED = { subtotalMinor: 379_998, taxMinor: 31_350, totalMinor: 411_348 } as const
const PARTIAL_MINOR = 100_000
const TEST_INBOX = 'delivered@resend.dev'

const usd = (minor: number): string => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(minor / 100)

/** The <dd> that follows a <dt> label inside a totals list. */
function total(scope: Locator, label: string): Locator {
  return scope.locator('dt').and(scope.getByText(label, { exact: true })).locator('xpath=following-sibling::dd[1]')
}

/** The status badge in the invoice toolbar (the document's stamp is a separate element). */
function statusBadge(page: Page, label: string): Locator {
  return page.locator('main span.inline-flex > span', { hasText: new RegExp(`^${label}$`) })
}

const runId = `${new Date().toISOString().slice(0, 19).replace(/\D/g, '')}-${Math.random().toString(36).slice(2, 6)}`
const clientName = `E2E Client ${runId}`
let clientId: string | null = null

test.afterAll(async () => {
  if (!clientId) return
  const db = await testUserDb(testUser())
  await cleanUpClient(db, clientId)
})

test('invoice → PDF → email → payment recorded', async ({ page, browser }) => {
  const user = testUser()
  const db = await testUserDb(user)

  await test.step('log in', async () => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(user.email)
    await page.getByLabel('Password').fill(user.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).not.toHaveURL(/\/login$/)
  })

  await test.step('finish first-run setup if the test user has none', async () => {
    const { data: settings, error } = await db.from('business_settings').select('id').maybeSingle()
    if (error) throw error
    if (settings) return
    await page.goto('/settings')
    await page.getByLabel('Business name').fill('Settle E2E')
    await page.getByRole('button', { name: 'Save and continue' }).click()
    await expect(page).toHaveURL(/\/clients\/new$/)
  })

  await test.step('create a client', async () => {
    await page.goto('/clients/new')
    await page.getByLabel('Client name').fill(clientName)
    await page.getByLabel('Email', { exact: true }).fill(TEST_INBOX)
    await page.getByRole('button', { name: 'Add client' }).click()
    await expect(page.getByRole('heading', { name: clientName })).toBeVisible()
    clientId = new URL(page.url()).pathname.split('/').pop() ?? null
    expect(clientId).toMatch(/^[0-9a-f-]{36}$/)
  })

  let invoiceId = ''

  await test.step('create a draft with two line items and check live totals', async () => {
    await page.getByRole('link', { name: 'New invoice' }).click()
    await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]{36}\/edit$/)
    invoiceId = new URL(page.url()).pathname.split('/')[2] ?? ''

    await page.getByLabel('Tax rate (%)').fill('8.25')
    await page.getByLabel('Line 1 description').fill('Design sprint')
    await page.getByLabel('Line 1 quantity').fill('3')
    await page.getByLabel('Line 1 unit price').fill('1,250.00')
    await page.getByRole('button', { name: 'Add line' }).click()
    await page.getByLabel('Line 2 description').fill('Hosting (prorated)')
    await page.getByLabel('Line 2 quantity').fill('2.5')
    await page.getByLabel('Line 2 unit price').fill('19.99')

    await expect(page.getByLabel('Line 1 amount')).toHaveText(usd(375_000))
    await expect(page.getByLabel('Line 2 amount')).toHaveText(usd(4_998))
    const live = page.locator('dl[aria-live="polite"]')
    await expect(total(live, 'Subtotal')).toHaveText(usd(EXPECTED.subtotalMinor))
    await expect(total(live, 'Tax (8.25%)')).toHaveText(usd(EXPECTED.taxMinor))
    await expect(total(live, 'Total')).toHaveText(usd(EXPECTED.totalMinor))
    await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible()
  })

  let number = ''

  await test.step('issue it and confirm the number is assigned', async () => {
    await page.getByRole('button', { name: 'Issue invoice' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Issue invoice' }).click()
    await expect(page).toHaveURL(new RegExp(`/invoices/${invoiceId}$`))

    const row = await invoiceSummary(db, invoiceId)
    expect(row.lifecycle).toBe('issued')
    expect(row.number).toMatch(/\d+$/)
    number = row.number ?? ''
    await expect(page.getByRole('article', { name: `Invoice ${number}` })).toBeVisible()
    await expect(statusBadge(page, 'Sent')).toBeVisible()
  })

  await test.step('printed totals match the database to the cent', async () => {
    const row = await invoiceSummary(db, invoiceId)
    expect({ subtotalMinor: row.subtotal_minor, taxMinor: row.tax_minor, totalMinor: row.total_minor }).toEqual(EXPECTED)

    await page.emulateMedia({ media: 'print' })
    const doc = page.getByRole('article', { name: `Invoice ${number}` })
    await expect(doc).toBeVisible()
    await expect(page.getByRole('button', { name: 'Download PDF' })).toBeHidden()
    await expect(total(doc, 'Subtotal')).toHaveText(usd(row.subtotal_minor ?? -1))
    await expect(total(doc, 'Tax (8.25%)')).toHaveText(usd(row.tax_minor ?? -1))
    await expect(total(doc, 'Total')).toHaveText(usd(row.total_minor ?? -1))
    await page.emulateMedia({ media: 'screen' })
  })

  let publicToken = ''

  await test.step('email the invoice through the app', async () => {
    await page.getByRole('button', { name: 'Email', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: `Email invoice ${number}` })
    await expect(dialog.getByText(TEST_INBOX)).toBeVisible()
    await dialog.getByRole('button', { name: 'Send invoice' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText(`Emailed to ${TEST_INBOX} on`)).toBeVisible()

    const { data: emails, error } = await db.from('invoice_emails').select('kind, to_email').eq('invoice_id', invoiceId)
    if (error) throw error
    expect(emails).toEqual([{ kind: 'invoice', to_email: TEST_INBOX }])
    const row = await invoiceSummary(db, invoiceId)
    expect(row.sent_at).not.toBeNull()
    expect(row.public_token).toMatch(/^[0-9a-f-]{36}$/)
    publicToken = row.public_token ?? ''
  })

  await test.step('the client opens the shared link signed out', async () => {
    const context = await browser.newContext({ locale: 'en-US', timezoneId: 'UTC' })
    try {
      const client = await context.newPage()
      await client.goto(new URL(`/i/${publicToken}`, page.url()).toString())
      const doc = client.getByRole('article', { name: `Invoice ${number}` })
      await expect(doc).toBeVisible()
      await expect(total(doc, 'Total')).toHaveText(usd(EXPECTED.totalMinor))
      await expect(client.getByRole('button', { name: 'Download PDF' })).toBeVisible()
      await expect(client.getByRole('link', { name: 'Invoices' })).toBeHidden()
    } finally {
      await context.close()
    }
  })

  await test.step('record a partial payment → Partially paid', async () => {
    await page.getByRole('button', { name: 'Record payment' }).click()
    const dialog = page.getByRole('dialog', { name: `Record payment for ${number}` })
    await dialog.getByRole('textbox', { name: 'Amount', exact: true }).fill((PARTIAL_MINOR / 100).toFixed(2))
    await dialog.getByRole('button', { name: 'Record payment' }).click()
    await expect(dialog).toBeHidden()

    await expect(statusBadge(page, 'Partially paid')).toBeVisible()
    const doc = page.getByRole('article', { name: `Invoice ${number}` })
    await expect(total(doc, 'Balance due')).toHaveText(usd(EXPECTED.totalMinor - PARTIAL_MINOR))
    const row = await invoiceSummary(db, invoiceId)
    expect(row.status).toBe('partially_paid')
    expect(row.balance_minor).toBe(EXPECTED.totalMinor - PARTIAL_MINOR)
  })

  await test.step('send a payment reminder', async () => {
    await page.getByRole('button', { name: 'Send reminder' }).click()
    const dialog = page.getByRole('dialog', { name: `Send a reminder for ${number}` })
    await dialog.getByRole('button', { name: 'Send reminder' }).click()
    await expect(dialog).toBeHidden()
    // The history line, not the toast ("Reminder sent to …").
    await expect(page.getByText(/Reminder sent [A-Z][a-z]{2} \d/)).toBeVisible()

    const { data: reminders, error } = await db.from('invoice_emails').select('kind').eq('invoice_id', invoiceId).eq('kind', 'reminder')
    if (error) throw error
    expect(reminders).toHaveLength(1)
  })

  await test.step('record the remaining balance → Paid', async () => {
    await page.getByRole('button', { name: 'Record payment' }).click()
    const dialog = page.getByRole('dialog', { name: `Record payment for ${number}` })
    // The amount defaults to the outstanding balance.
    await expect(dialog.getByRole('textbox', { name: 'Amount', exact: true })).toHaveValue(((EXPECTED.totalMinor - PARTIAL_MINOR) / 100).toFixed(2))
    await dialog.getByRole('button', { name: 'Record payment' }).click()
    await expect(dialog).toBeHidden()

    await expect(statusBadge(page, 'Paid')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Record payment' })).toBeHidden()
    const row = await invoiceSummary(db, invoiceId)
    expect(row.status).toBe('paid')
    expect(row.balance_minor).toBe(0)
    expect(row.amount_paid_minor).toBe(EXPECTED.totalMinor)
  })
})
