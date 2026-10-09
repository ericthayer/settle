# settle

Your work, invoiced. Your money, tracked.

A private, single-user invoicing tool: create and issue invoices (HTML + PDF), record payments, and see what's owed. Spec: `spec/settle-mvp-spec.md` in the project files.

## Stack

React 19 · Vite · TypeScript (strict) · Tailwind CSS v4 · shadcn/ui (Radix) · TanStack Query · Supabase (Postgres, Auth, RLS) · Netlify

## Develop

```bash
cp .env.example .env.local   # fill in the Supabase URL and publishable key
npm install
npm run dev
```

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run typecheck` / `lint` / `test` / `build` | What CI runs |
| `npm run db:test` | Applies `supabase/migrations` to a throwaway database and runs `supabase/tests`. Needs `DATABASE_URL` pointing at a Postgres 15+ superuser connection. |

## Data rules

- Money is integer minor units (`bigint` cents) plus an ISO currency code. `src/lib/money.ts` mirrors the SQL rounding exactly.
- Invoices store only their lifecycle (`draft`, `issued`, `void`). Paid, partially paid and overdue come from the `invoice_summary` view.
- Numbers are assigned when an invoice is issued (`issue_invoice` RPC), under a row lock, so they are sequential and gap-free.
- Issued invoices and their line items can't be edited. Use `revert_to_draft` (only without payments) or `void_invoice`.
- Payments are soft-deleted (`delete_payment`) so history is never lost.
- Every table has RLS scoped to `auth.uid()`. The browser only ever gets the publishable key.

## Deploy

Netlify builds `main` with `netlify.toml`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the Netlify site's environment. Apply migrations with `supabase db push` (or the Supabase MCP) before deploying code that needs them.
