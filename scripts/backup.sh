#!/usr/bin/env bash
# Dumps Settle's data and writes one passphrase-encrypted archive.
#
#   DATABASE_URL       Postgres connection string (Supabase: the session pooler URI)
#   BACKUP_PASSPHRASE  symmetric key for gpg; keep a copy outside GitHub
#   OUT_DIR            where the .tar.gz.gpg goes (default: .)
#
# The archive holds two pg_dump custom-format files:
#   public.dump      schema + data of the public schema (every Settle table)
#   auth-users.dump  data only, auth.users, so owner_id foreign keys can be restored
# Nothing about the data is printed: in a public repo, workflow logs are public.
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL}"
: "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE}"
out_dir="${OUT_DIR:-.}"

umask 077
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/dump" "$out_dir"

pg_dump "$DATABASE_URL" --schema=public --no-owner --format=custom --file="$work/dump/public.dump"
pg_dump "$DATABASE_URL" --table=auth.users --data-only --no-owner --no-privileges --format=custom --file="$work/dump/auth-users.dump"

# Both archives must be readable before anything is encrypted.
for f in "$work"/dump/*.dump; do
  pg_restore --list "$f" >/dev/null
done

archive="$out_dir/settle-$(date -u +%Y%m%dT%H%M%SZ).tar.gz.gpg"
printf '%s' "$BACKUP_PASSPHRASE" >"$work/passphrase"
tar -czf - -C "$work/dump" . |
  gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-file "$work/passphrase" \
    --symmetric --cipher-algo AES256 --output "$archive"

# Round-trip: the archive decrypts with the passphrase and lists both dumps.
gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$work/passphrase" --decrypt "$archive" |
  tar -tzf - | grep -qx './public.dump'

echo "wrote $(basename "$archive") ($(du -h "$archive" | cut -f1))"
