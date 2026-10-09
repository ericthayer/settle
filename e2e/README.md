# End-to-end tests

`golden-path.spec.ts` is the MVP gate: log in, create a client, build a two-line draft, issue it, check the printed totals against `invoice_summary` to the cent, then record a partial and a full payment.

It signs in as a dedicated test account, never your own. Each run uses a uniquely named client and tidies up afterwards: payments are soft-deleted, the invoice voided and the client archived (issued invoices can't be hard-deleted, so they stay as void history on the test account).

## Run

```bash
E2E_TEST_EMAIL=… E2E_TEST_PASSWORD=… npm run e2e
```

- Starts the Vite dev server against the Supabase project in `.env.local`. On a first run the test fills in business settings for the account.
- `E2E_BASE_URL=https://deploy-preview-N--settle-invoices.netlify.app` runs against a deploy preview instead. Production is refused.
- Uses Chromium from `/opt/pw-browsers/chromium` when it exists (or `PLAYWRIGHT_CHROMIUM_PATH`); otherwise run `npx playwright install chromium` once.
- Traces and videos are off because they would record the password. Failures keep a screenshot in `test-results/`.

In CI the `Golden-path e2e` job runs after the other checks, with the credentials from the `E2E_TEST_EMAIL` and `E2E_TEST_PASSWORD` repository secrets.
