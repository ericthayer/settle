# End-to-end tests

`golden-path.spec.ts` is the MVP gate: log in, create a client, build a two-line draft, issue it, check the printed totals against `invoice_summary` to the cent, email the invoice and open its shared link signed out, then record a partial payment, send a reminder, and settle the rest.

The rest is recorded manually by default. With `E2E_STRIPE=1` the client pays it on the shared link by Stripe test card (4242…) instead, and the test waits for the `stripe-webhook` function to mark the invoice paid. That needs `create-checkout` and `stripe-webhook` deployed with Stripe **test** keys in their secrets. In CI, set the repository variable `E2E_STRIPE` to `1`.

Email goes to Resend's test inbox `delivered@resend.dev` (accepted, never delivered), so the `send-invoice-email` function must be deployed with `RESEND_API_KEY` set.

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
