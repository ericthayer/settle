-- M6: email log, sent_at, share token, and the public invoice read.
\set ON_ERROR_STOP 1

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'mailer@example.com'),
  ('00000000-0000-0000-0000-0000000000f2', 'other@example.com');

create function pg_temp.expect_error(p_sql text, p_state text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected % from: %', p_state, p_sql using errcode = 'P0001';
exception
  when others then
    if sqlstate = 'P0001' and sqlerrm like 'expected %' then raise; end if;
    if sqlstate <> p_state then
      raise exception 'expected % but got % (%) from: %', p_state, sqlstate, sqlerrm, p_sql;
    end if;
end;
$$;
grant execute on function pg_temp.expect_error(text, text) to authenticated, anon;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';

insert into public.business_settings (business_name, timezone, logo_path)
values ('Mailer Co', 'UTC', '00000000-0000-0000-0000-0000000000f1/logo-1.png');
insert into public.clients (id, name, email) values ('80000000-0000-0000-0000-000000000001', 'Recipient', 'ap@example.com');
insert into public.invoices (id, client_id, currency)
values ('90000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 'USD');
insert into public.invoice_line_items (invoice_id, position, description, quantity, unit_price_minor)
values ('90000000-0000-0000-0000-000000000001', 0, 'Work', 2, 12500);

-- Drafts can't be shared or emailed.
select pg_temp.expect_error($$select public.ensure_public_token('90000000-0000-0000-0000-000000000001')$$, '23514');
select pg_temp.expect_error(
  $$select public.log_invoice_email('90000000-0000-0000-0000-000000000001', 'invoice', 'ap@example.com', '{}', 'x')$$, '23514');

select public.issue_invoice('90000000-0000-0000-0000-000000000001', current_date);

-- Token is created once and reused.
create temp table tok as select public.ensure_public_token('90000000-0000-0000-0000-000000000001') as t;
grant select on tok to anon;
do $$ begin
  assert (select t from tok) is not null;
  assert public.ensure_public_token('90000000-0000-0000-0000-000000000001') = (select t from tok), 'token must be stable';
end $$;

-- First invoice email sets sent_at; reminders log without moving it.
select public.log_invoice_email('90000000-0000-0000-0000-000000000001', 'invoice', 'ap@example.com', array['cc@example.com'], 'Invoice INV-0001', 'msg_1');
create temp table first_sent as select sent_at from public.invoice_summary where id = '90000000-0000-0000-0000-000000000001';
select public.log_invoice_email('90000000-0000-0000-0000-000000000001', 'reminder', 'ap@example.com', '{}', 'Reminder', 'msg_2');
select public.log_invoice_email('90000000-0000-0000-0000-000000000001', 'invoice', 'ap@example.com', '{}', 'Invoice again', 'msg_3');
do $$ begin
  assert (select sent_at from first_sent) is not null, 'sent_at set on first send';
  assert (select sent_at from public.invoices where id = '90000000-0000-0000-0000-000000000001') = (select sent_at from first_sent),
    'sent_at keeps the first send';
  assert (select count(*) from public.invoice_emails where invoice_id = '90000000-0000-0000-0000-000000000001') = 3;
  assert (select cc_emails from public.invoice_emails where provider_message_id = 'msg_1') = array['cc@example.com'];
end $$;

-- sent_at can't be used to edit anything else on an issued invoice, and the log is append-only.
select pg_temp.expect_error($$update public.invoices set notes = 'changed', sent_at = now() where id = '90000000-0000-0000-0000-000000000001'$$, '23514');
select pg_temp.expect_error($$update public.invoice_emails set subject = 'x'$$, '42501');
select pg_temp.expect_error($$delete from public.invoice_emails$$, '42501');

-- Another user sees no emails and can't log against the invoice.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f2';
do $$ begin assert (select count(*) from public.invoice_emails) = 0; end $$;
select pg_temp.expect_error(
  $$select public.log_invoice_email('90000000-0000-0000-0000-000000000001', 'invoice', 'x@example.com', '{}', 'x')$$, 'P0002');
select pg_temp.expect_error($$select public.ensure_public_token('90000000-0000-0000-0000-000000000001')$$, '23514');

-- Anon: the token reads the invoice; nothing else does.
reset request.jwt.claim.sub;
set role anon;
do $$
declare
  doc jsonb := public.get_public_invoice((select t from tok));
begin
  assert doc is not null, 'token must resolve';
  assert doc -> 'invoice' ->> 'number' = 'INV-0001', doc::text;
  assert (doc -> 'invoice' ->> 'total_minor')::bigint = 25000;
  assert (doc -> 'invoice' ->> 'balance_minor')::bigint = 25000;
  assert doc -> 'invoice' ->> 'status' = 'sent';
  assert jsonb_array_length(doc -> 'lines') = 1;
  assert not (doc -> 'invoice') ? 'owner_id' and not (doc -> 'invoice') ? 'client_id' and not (doc -> 'invoice') ? 'id',
    'no internal ids';
  assert public.get_public_invoice(gen_random_uuid()) is null;
  assert public.get_public_invoice(null) is null;
  assert public.is_shared_logo('00000000-0000-0000-0000-0000000000f1/logo-1.png');
  assert not public.is_shared_logo('00000000-0000-0000-0000-0000000000f1/other.png');
end $$;
select pg_temp.expect_error($$select count(*) from public.invoice_emails$$, '42501');
select pg_temp.expect_error($$select public.ensure_public_token('90000000-0000-0000-0000-000000000001')$$, '42501');

-- Reverting to draft hides the shared invoice.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
select public.revert_to_draft('90000000-0000-0000-0000-000000000001');
set role anon;
do $$ begin
  assert public.get_public_invoice((select t from tok)) is null, 'drafts are not public';
  assert not public.is_shared_logo('00000000-0000-0000-0000-0000000000f1/logo-1.png');
end $$;

reset role;
