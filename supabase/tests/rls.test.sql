-- Row Level Security: a second user and anon see and touch nothing of the owner's.
\set ON_ERROR_STOP 1

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'owner-b@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'intruder@example.com');

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

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
insert into public.business_settings (business_name) values ('Owner B');
insert into public.clients (id, name) values ('10000000-0000-0000-0000-0000000000b1', 'Owner B client');
insert into public.invoices (id, client_id, currency)
values ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1', 'USD');
insert into public.invoice_line_items (invoice_id, position, description, quantity, unit_price_minor)
values ('20000000-0000-0000-0000-0000000000b1', 0, 'Work', 1, 5000);
select public.issue_invoice('20000000-0000-0000-0000-0000000000b1');
select public.record_payment('20000000-0000-0000-0000-0000000000b1', 1000, '2026-10-01', 'cash');

-- Intruder: authenticated, different user.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  assert (select count(*) from public.business_settings) = 0;
  assert (select count(*) from public.clients) = 0;
  assert (select count(*) from public.invoices) = 0;
  assert (select count(*) from public.invoice_line_items) = 0;
  assert (select count(*) from public.payments) = 0;
  assert (select count(*) from public.invoice_summary) = 0;
end $$;

-- Writes against the owner's rows affect nothing or are rejected.
update public.clients set name = 'pwned' where id = '10000000-0000-0000-0000-0000000000b1';
delete from public.invoices where id = '20000000-0000-0000-0000-0000000000b1';
select pg_temp.expect_error($$select public.record_payment('20000000-0000-0000-0000-0000000000b1', 1, '2026-10-01', 'cash')$$, 'P0002');
select pg_temp.expect_error($$select public.void_invoice('20000000-0000-0000-0000-0000000000b1')$$, 'P0002');
-- Forged foreign keys to the owner's rows are rejected.
select pg_temp.expect_error($$insert into public.invoices (client_id, currency) values ('10000000-0000-0000-0000-0000000000b1', 'USD')$$, '23503');
select pg_temp.expect_error($$insert into public.invoice_line_items (invoice_id, position, description, quantity, unit_price_minor) values ('20000000-0000-0000-0000-0000000000b1', 9, 'x', 1, 1)$$, '23503');
-- Can't create rows owned by someone else.
select pg_temp.expect_error($$insert into public.clients (owner_id, name) values ('00000000-0000-0000-0000-0000000000b1', 'sneaky')$$, '42501');

-- Anon has no table access at all.
reset request.jwt.claim.sub;
set role anon;
select pg_temp.expect_error($$select count(*) from public.invoices$$, '42501');
select pg_temp.expect_error($$select count(*) from public.invoice_summary$$, '42501');
select pg_temp.expect_error($$select public.issue_invoice('20000000-0000-0000-0000-0000000000b1')$$, '42501');

-- Owner's data is intact.
reset role;
do $$ begin
  assert (select name from public.clients where id = '10000000-0000-0000-0000-0000000000b1') = 'Owner B client';
  assert exists (select 1 from public.invoices where id = '20000000-0000-0000-0000-0000000000b1');
  assert (select count(*) from public.payments where owner_id = '00000000-0000-0000-0000-0000000000b1') = 1;
end $$;
