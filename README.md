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
| `npm run db:test` | Applies `supabase/migrations` to a throwaway database, runs `supabase/tests`, then backs it up with `scripts/backup.sh` and checks the restore matches row for row. Needs `DATABASE_URL` pointing at a Postgres 15+ superuser connection and a `pg_dump` at least as new as the server. |

## Commits and releases

Versioning is automated from [Conventional Commits](https://www.conventionalcommits.org/).

- PRs are **squash-merged**; the PR title becomes the commit on `main`, and the `PR title` check enforces the format: `feat: add client form`, `fix(invoices): round tax half up`, `feat!: …` for breaking changes.
- `feat` bumps the minor version, `fix` and `perf` bump the patch. While on `0.x`, breaking changes bump the minor version.
- On every push to `main`, release-please updates an open release PR with the next version, `CHANGELOG.md` and `package.json`. Merging that PR tags `vX.Y.Z` and publishes a GitHub release.
- Other types (`chore`, `docs`, `refactor`, `test`, `ci`, `build`, `style`) don't trigger a release or show in the changelog.

## Data rules

- Money is integer minor units (`bigint` cents) plus an ISO currency code. `src/lib/money.ts` mirrors the SQL rounding exactly.
- Invoices store only their lifecycle (`draft`, `issued`, `void`). Paid, partially paid and overdue come from the `invoice_summary` view.
- Numbers are assigned when an invoice is issued (`issue_invoice` RPC), under a row lock, so they are sequential and gap-free.
- Issued invoices and their line items can't be edited. Use `revert_to_draft` (only without payments) or `void_invoice`.
- Payments are soft-deleted (`delete_payment`) so history is never lost.
- Every table has RLS scoped to `auth.uid()`. The browser only ever gets the publishable key.

## Backups and export

**In the app:** Settings → Export data downloads everything as JSON (every table as stored, money in minor units) plus spreadsheet-friendly CSVs of invoices and payments.

**Scheduled:** `.github/workflows/backup.yml` runs Mondays and Thursdays (and on demand from the Actions tab). It runs `scripts/backup.sh`, which `pg_dump`s the `public` schema plus `auth.users` rows, encrypts the archive with AES-256, and keeps it as a workflow artifact for 90 days. Each run also counts as database activity, which stops a free-tier Supabase project from pausing.

One-time setup, in GitHub → Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `SUPABASE_DB_URL` | Supabase → Connect → **Session pooler** connection string, with the database password filled in. The direct connection is IPv6-only and GitHub runners can't reach it. |
| `BACKUP_PASSPHRASE` | A long random passphrase. Keep a copy in a password manager; without it no backup can be opened. |

The repository is public, so artifacts can be downloaded by any signed-in GitHub user. That is why the archive is encrypted and the script never prints data. GitHub pauses scheduled workflows after 60 days without repository activity; re-enable it from the Actions tab if that happens.

Restore (needs Postgres 17 client tools):

```bash
gpg --decrypt settle-YYYYMMDDTHHMMSSZ.tar.gz.gpg | tar -xzf -        # prompts for the passphrase
# Into a new, empty Supabase project (it already has the auth schema and roles):
pg_restore --no-owner --data-only --dbname "$NEW_DB_URL" auth-users.dump
psql "$NEW_DB_URL" -c 'drop schema public cascade'
pg_restore --no-owner --single-transaction --dbname "$NEW_DB_URL" public.dump
psql "$NEW_DB_URL" -f supabase/migrations/20261009000002_logo_storage.sql   # logo bucket policies live outside public
```

Logo image files live in Supabase Storage, not the database, so re-upload the logo after a restore. `npm run db:test` exercises this restore path on every CI run.

## Deploy

Netlify builds `main` with `netlify.toml`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the Netlify site's environment. Apply migrations with `supabase db push` (or the Supabase MCP) before deploying code that needs them.
