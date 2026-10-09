#!/usr/bin/env bash
# Issues 8 drafts from 8 parallel connections; numbers must be distinct and gap-free.
set -euo pipefail
url="$1"
owner='00000000-0000-0000-0000-0000000000c1'
as_owner="set role authenticated; set request.jwt.claim.sub = '$owner';"
psql=(psql -X -q -v ON_ERROR_STOP=1 "$url")

"${psql[@]}" <<SQL >/dev/null
insert into auth.users (id) values ('$owner');
$as_owner
insert into public.business_settings (business_name, invoice_prefix) values ('Concurrency', 'C-');
insert into public.clients (id, name) values ('10000000-0000-0000-0000-0000000000c1', 'Client');
insert into public.invoices (id, client_id, currency)
  select ('30000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
         '10000000-0000-0000-0000-0000000000c1', 'USD'
  from generate_series(1, 8) n;
insert into public.invoice_line_items (invoice_id, position, description, quantity, unit_price_minor)
  select ('30000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 0, 'Work', 1, 100
  from generate_series(1, 8) n;
SQL

pids=()
for n in $(seq 1 8); do
  id="30000000-0000-0000-0000-0000000000$(printf '%02d' "$n")"
  "${psql[@]}" -c "$as_owner begin; select public.issue_invoice('$id'); select pg_sleep(0.05); commit;" >/dev/null &
  pids+=($!)
done
for pid in "${pids[@]}"; do wait "$pid"; done

result=$("${psql[@]}" -At -c "
  select count(distinct number) = 8
     and min(number) = 'C-0001' and max(number) = 'C-0008'
     and (select next_invoice_number from public.business_settings where owner_id = '$owner') = 9
  from public.invoices where owner_id = '$owner'")
[ "$result" = "t" ]
