#!/usr/bin/env bash
# Applies every migration to a throwaway database and runs the SQL tests.
# Usage: DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run db:test
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to a superuser connection (e.g. a local Postgres 15+)}"
here="$(cd "$(dirname "$0")" && pwd)"
db="settle_test_$$"
admin_url="$DATABASE_URL"
test_url="${DATABASE_URL%/*}/$db"
psql_opts=(-X -q -v ON_ERROR_STOP=1)

cleanup() { psql "${psql_opts[@]}" "$admin_url" -c "drop database if exists $db with (force)" >/dev/null; }
trap cleanup EXIT

psql "${psql_opts[@]}" "$admin_url" -c "create database $db" >/dev/null
psql "${psql_opts[@]}" "$test_url" -f "$here/bootstrap.sql" >/dev/null
for migration in "$here"/../migrations/*.sql; do
  echo "migrate  $(basename "$migration")"
  psql "${psql_opts[@]}" "$test_url" -f "$migration" >/dev/null
done

status=0
for test in "$here"/*.test.sql; do
  if psql "${psql_opts[@]}" "$test_url" -f "$test" >/dev/null; then
    echo "pass     $(basename "$test")"
  else
    echo "FAIL     $(basename "$test")"
    status=1
  fi
done

# Concurrent issuing must yield distinct, gap-free numbers.
if bash "$here/concurrent_issue.sh" "$test_url"; then
  echo "pass     concurrent_issue.sh"
else
  echo "FAIL     concurrent_issue.sh"
  status=1
fi

exit $status
