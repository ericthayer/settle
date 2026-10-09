#!/usr/bin/env bash
# Backup round trip: scripts/backup.sh against a populated database, then
# decrypt, restore into an empty one and compare every Settle table row for row.
# Usage: backup_restore.sh <database url with test data>
set -euo pipefail

source_url="$1"
here="$(cd "$(dirname "$0")" && pwd)"
restore_db="settle_restore_$$"
restore_url="${source_url%/*}/$restore_db"
admin_url="${source_url%/*}/postgres"
psql_opts=(-X -q -v ON_ERROR_STOP=1)
work="$(mktemp -d)"
passphrase="test-passphrase-$$"

cleanup() {
  rm -rf "$work"
  psql "${psql_opts[@]}" "$admin_url" -c "drop database if exists $restore_db with (force)" >/dev/null
}
trap cleanup EXIT

DATABASE_URL="$source_url" BACKUP_PASSPHRASE="$passphrase" OUT_DIR="$work" bash "$here/../../scripts/backup.sh" >/dev/null
archive="$(ls "$work"/settle-*.tar.gz.gpg)"

# The archive must not open without the passphrase.
if gpg --batch --quiet --pinentry-mode loopback --passphrase wrong --decrypt "$archive" >/dev/null 2>&1; then
  echo "archive decrypted with the wrong passphrase" >&2
  exit 1
fi

mkdir "$work/restore"
gpg --batch --quiet --pinentry-mode loopback --passphrase "$passphrase" --decrypt "$archive" | tar -xzf - -C "$work/restore"

# A fresh Supabase project already has the auth schema and roles; bootstrap.sql stands in for it.
psql "${psql_opts[@]}" "$admin_url" -c "create database $restore_db" >/dev/null
psql "${psql_opts[@]}" "$restore_url" -f "$here/bootstrap.sql" >/dev/null
pg_restore --no-owner --single-transaction --exit-on-error --dbname="$restore_url" "$work/restore/auth-users.dump"
psql "${psql_opts[@]}" "$restore_url" -c "drop schema public cascade" >/dev/null
pg_restore --no-owner --single-transaction --exit-on-error --dbname="$restore_url" "$work/restore/public.dump"

fingerprint() {
  psql -X -At "$1" <<'SQL'
select string_agg(t || ':' || n || ':' || h, ' ' order by t) from (
  select 'auth.users' as t, count(*) as n, md5(coalesce(string_agg(u::text, '|' order by id), '')) as h from auth.users u
  union all select 'business_settings', count(*), md5(coalesce(string_agg(x::text, '|' order by id), '')) from public.business_settings x
  union all select 'clients', count(*), md5(coalesce(string_agg(x::text, '|' order by id), '')) from public.clients x
  union all select 'invoices', count(*), md5(coalesce(string_agg(x::text, '|' order by id), '')) from public.invoices x
  union all select 'invoice_line_items', count(*), md5(coalesce(string_agg(x::text, '|' order by id), '')) from public.invoice_line_items x
  union all select 'payments', count(*), md5(coalesce(string_agg(x::text, '|' order by id), '')) from public.payments x
  union all select 'invoice_summary', count(*), md5(coalesce(string_agg(x::text, '|' order by id), '')) from public.invoice_summary x
) s;
SQL
}

before="$(fingerprint "$source_url")"
after="$(fingerprint "$restore_url")"
if [[ "$before" != "$after" ]]; then
  echo "restored data differs" >&2
  echo "source:   $before" >&2
  echo "restored: $after" >&2
  exit 1
fi
# The restored schema must still enforce RLS and keep the API roles' grants,
# or the app would get "permission denied" after a restore.
check="$(psql -X -At "$restore_url" <<'SQL'
select bool_and(c.relrowsecurity)
   and bool_and(has_table_privilege('authenticated', c.oid, 'select,insert,update,delete'))
   and has_schema_privilege('authenticated', 'public', 'usage')
   and has_function_privilege('authenticated', 'public.issue_invoice(uuid,date)', 'execute')
from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r';
SQL
)"
if [[ "$check" != "t" ]]; then
  echo "restored schema lost RLS or grants" >&2
  exit 1
fi
