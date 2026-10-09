-- Invoice totals, numbering, immutability, payments and derived status.
\set ON_ERROR_STOP 1

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@example.com');

-- expect_error(sql, sqlstate): runs sql and fails unless it raises that state.
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
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';

insert into public.business_settings (business_name, default_tax_rate_bps, timezone)
values ('Thayer Design', 825, 'America/Los_Angeles');

insert into public.clients (id, name, payment_terms_days)
values ('10000000-0000-0000-0000-000000000001', 'Acme Co', 15);

-- Draft with two lines; one non-taxable. 1.5h @ $150 + $50 expense, 8.25% tax on $225.
insert into public.invoices (id, client_id, currency, tax_rate_bps)
values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'USD', 825);
insert into public.invoice_line_items (invoice_id, position, description, quantity, unit_price_minor, taxable) values
  ('20000000-0000-0000-0000-000000000001', 0, 'Design', 1.5, 15000, true),
  ('20000000-0000-0000-0000-000000000001', 1, 'Fonts', 1, 5000, false);

do $$
declare inv public.invoices;
begin
  select * into inv from public.invoices where id = '20000000-0000-0000-0000-000000000001';
  assert inv.subtotal_minor = 27500, format('subtotal %s', inv.subtotal_minor);
  assert inv.tax_minor = 1856, format('tax %s', inv.tax_minor); -- 22500 * 0.0825 = 1856.25
  assert inv.total_minor = 29356, format('total %s', inv.total_minor);
end $$;

-- Tax rate change on a draft recomputes.
update public.invoices set tax_rate_bps = 1000 where id = '20000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select tax_minor from public.invoices where id = '20000000-0000-0000-0000-000000000001') = 2250;
end $$;
update public.invoices set tax_rate_bps = 825 where id = '20000000-0000-0000-0000-000000000001';

-- Lifecycle cannot be changed by plain update, and number cannot be set.
select pg_temp.expect_error($$update public.invoices set lifecycle = 'issued' where id = '20000000-0000-0000-0000-000000000001'$$, '23514');
select pg_temp.expect_error($$update public.invoices set number = 'X-1' where id = '20000000-0000-0000-0000-000000000001'$$, '23514');
select pg_temp.expect_error($$insert into public.invoices (client_id, currency, lifecycle) values ('10000000-0000-0000-0000-000000000001', 'USD', 'issued')$$, '23514');

-- Empty draft cannot be issued.
insert into public.invoices (id, client_id, currency)
values ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'USD');
select pg_temp.expect_error($$select public.issue_invoice('20000000-0000-0000-0000-000000000002')$$, '23514');

-- Issue: number, dates from client terms, snapshots.
select public.issue_invoice('20000000-0000-0000-0000-000000000001', '2026-10-01');
do $$
declare inv public.invoices;
begin
  select * into inv from public.invoices where id = '20000000-0000-0000-0000-000000000001';
  assert inv.lifecycle = 'issued';
  assert inv.number = 'INV-0001', format('number %s', inv.number);
  assert inv.issue_date = '2026-10-01';
  assert inv.due_date = '2026-10-16', format('due %s', inv.due_date);
  assert inv.bill_to ->> 'name' = 'Acme Co';
  assert inv.bill_from ->> 'business_name' = 'Thayer Design';
  assert (select next_invoice_number from public.business_settings) = 2;
end $$;

-- Issued invoices and their lines are frozen.
select pg_temp.expect_error($$update public.invoices set notes = 'changed' where id = '20000000-0000-0000-0000-000000000001'$$, '23514');
select pg_temp.expect_error($$update public.invoices set tax_rate_bps = 0 where id = '20000000-0000-0000-0000-000000000001'$$, '23514');
select pg_temp.expect_error($$insert into public.invoice_line_items (invoice_id, position, description, quantity, unit_price_minor) values ('20000000-0000-0000-0000-000000000001', 5, 'x', 1, 1)$$, '23514');
select pg_temp.expect_error($$update public.invoice_line_items set quantity = 2 where invoice_id = '20000000-0000-0000-0000-000000000001'$$, '23514');
-- Reserved payment-link column stays writable.
update public.invoices set checkout_url = 'https://example.com/pay' where id = '20000000-0000-0000-0000-000000000001';

-- Issued invoices cannot be deleted (RLS hides them from delete).
delete from public.invoices where id = '20000000-0000-0000-0000-000000000001';
do $$ begin assert exists (select 1 from public.invoices where id = '20000000-0000-0000-0000-000000000001'); end $$;

-- Sequence only moves forward.
select pg_temp.expect_error($$update public.business_settings set next_invoice_number = 1$$, '23514');

-- Payments: partial, overpay rejected, full, soft delete.
do $$ begin
  assert (select status from public.invoice_summary where id = '20000000-0000-0000-0000-000000000001') in ('sent', 'overdue');
end $$;
select public.record_payment('20000000-0000-0000-0000-000000000001', 10000, '2026-10-05', 'ach', 'T-1');
select pg_temp.expect_error($$select public.record_payment('20000000-0000-0000-0000-000000000001', 19357, '2026-10-06', 'ach')$$, '23514');
select pg_temp.expect_error($$select public.record_payment('20000000-0000-0000-0000-000000000002', 100, '2026-10-06', 'ach')$$, '23514');
do $$
declare s record;
begin
  select * into s from public.invoice_summary where id = '20000000-0000-0000-0000-000000000001';
  assert s.amount_paid_minor = 10000;
  assert s.balance_minor = 19356;
end $$;

select public.record_payment('20000000-0000-0000-0000-000000000001', 19356, '2026-10-07', 'check', '1042');
do $$ begin
  assert (select status from public.invoice_summary where id = '20000000-0000-0000-0000-000000000001') = 'paid';
end $$;

-- Payments with history can't be voided or reverted.
select pg_temp.expect_error($$select public.void_invoice('20000000-0000-0000-0000-000000000001', 'oops')$$, '23514');
select pg_temp.expect_error($$select public.revert_to_draft('20000000-0000-0000-0000-000000000001')$$, '23514');
-- Payment amount is immutable; plain delete is not granted.
select pg_temp.expect_error($$update public.payments set amount_minor = 1 where invoice_id = '20000000-0000-0000-0000-000000000001'$$, '23514');
select pg_temp.expect_error($$delete from public.payments where invoice_id = '20000000-0000-0000-0000-000000000001'$$, '42501');

select public.delete_payment(id) from public.payments where reference = '1042';
do $$
declare s record;
begin
  select * into s from public.invoice_summary where id = '20000000-0000-0000-0000-000000000001';
  assert s.amount_paid_minor = 10000, 'soft-deleted payment no longer counts';
  assert s.status in ('partially_paid', 'overdue'), format('status %s', s.status);
  assert (select count(*) from public.payments where invoice_id = s.id) = 2, 'history retained';
end $$;

-- Overdue is derived from the owner's local date.
insert into public.invoices (id, client_id, currency, due_date, issue_date)
values ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'USD', '2020-01-31', '2020-01-01');
insert into public.invoice_line_items (invoice_id, position, description, quantity, unit_price_minor)
values ('20000000-0000-0000-0000-000000000003', 0, 'Old work', 1, 1000);
select public.issue_invoice('20000000-0000-0000-0000-000000000003');
do $$
declare s record;
begin
  select * into s from public.invoice_summary where id = '20000000-0000-0000-0000-000000000003';
  assert s.number = 'INV-0002', format('number %s', s.number);
  assert s.status = 'overdue', format('status %s', s.status);
  assert s.days_overdue > 365;
end $$;

-- Revert keeps the number; re-issue doesn't consume a new one; void works without payments.
select public.revert_to_draft('20000000-0000-0000-0000-000000000003');
do $$ begin
  assert (select number from public.invoices where id = '20000000-0000-0000-0000-000000000003') = 'INV-0002';
  assert (select status from public.invoice_summary where id = '20000000-0000-0000-0000-000000000003') = 'draft';
end $$;
select public.issue_invoice('20000000-0000-0000-0000-000000000003');
do $$ begin
  assert (select next_invoice_number from public.business_settings) = 3;
end $$;
select public.void_invoice('20000000-0000-0000-0000-000000000003', 'duplicate');
do $$ begin
  assert (select status from public.invoice_summary where id = '20000000-0000-0000-0000-000000000003') = 'void';
end $$;

-- Drafts can be deleted, cascading their lines.
delete from public.invoices where id = '20000000-0000-0000-0000-000000000002';
do $$ begin assert not exists (select 1 from public.invoices where id = '20000000-0000-0000-0000-000000000002'); end $$;

-- Clients with invoices can't be hard-deleted.
select pg_temp.expect_error($$delete from public.clients where id = '10000000-0000-0000-0000-000000000001'$$, '23503');
