-- save_invoice_draft and the numbered-draft delete guard.
\set ON_ERROR_STOP 1

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'drafts@example.com'),
  ('00000000-0000-0000-0000-0000000000d2', 'intruder@example.com');

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
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';

insert into public.business_settings (business_name, timezone) values ('Drafts Co', 'UTC');
insert into public.clients (id, name) values
  ('40000000-0000-0000-0000-000000000001', 'First'),
  ('40000000-0000-0000-0000-000000000002', 'Second');
insert into public.invoices (id, client_id, currency)
values ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'USD');

-- Header and lines saved together; totals recomputed; positions follow array order.
select public.save_invoice_draft(
  '50000000-0000-0000-0000-000000000001',
  '{"client_id":"40000000-0000-0000-0000-000000000002","currency":"CAD","tax_rate_bps":500,
    "issue_date":null,"due_date":"2030-01-31","notes":"  Thanks  ","payment_instructions":""}',
  '[{"description":" Design ","quantity":2,"unit_price_minor":10000,"taxable":true},
    {"description":"Hosting","quantity":1,"unit_price_minor":2500,"taxable":false}]');
do $$
declare inv public.invoices;
begin
  select * into inv from public.invoices where id = '50000000-0000-0000-0000-000000000001';
  assert inv.client_id = '40000000-0000-0000-0000-000000000002';
  assert inv.currency = 'CAD' and inv.tax_rate_bps = 500 and inv.due_date = '2030-01-31';
  assert inv.notes = 'Thanks' and inv.payment_instructions is null;
  assert inv.subtotal_minor = 22500 and inv.tax_minor = 1000 and inv.total_minor = 23500,
    format('totals %s %s %s', inv.subtotal_minor, inv.tax_minor, inv.total_minor);
  assert (select string_agg(description, ',' order by position) from public.invoice_line_items
          where invoice_id = inv.id) = 'Design,Hosting';
end $$;

-- Saving again replaces the lines rather than appending.
select public.save_invoice_draft(
  '50000000-0000-0000-0000-000000000001',
  '{"client_id":"40000000-0000-0000-0000-000000000002","currency":"CAD","tax_rate_bps":0,
    "issue_date":null,"due_date":null,"notes":null,"payment_instructions":null}',
  '[{"description":"Retainer","quantity":1,"unit_price_minor":50000}]');
do $$ begin
  assert (select count(*) from public.invoice_line_items where invoice_id = '50000000-0000-0000-0000-000000000001') = 1;
  assert (select total_minor from public.invoices where id = '50000000-0000-0000-0000-000000000001') = 50000;
end $$;

-- A bad line rolls back the whole save, header included.
select pg_temp.expect_error($$select public.save_invoice_draft(
  '50000000-0000-0000-0000-000000000001',
  '{"client_id":"40000000-0000-0000-0000-000000000002","currency":"USD","tax_rate_bps":0,
    "issue_date":null,"due_date":null,"notes":null,"payment_instructions":null}',
  '[{"description":"","quantity":1,"unit_price_minor":100}]')$$, '23514');
do $$ begin
  assert (select currency from public.invoices where id = '50000000-0000-0000-0000-000000000001') = 'CAD';
  assert (select count(*) from public.invoice_line_items where invoice_id = '50000000-0000-0000-0000-000000000001') = 1;
end $$;

-- Issued invoices can't be saved as drafts.
select public.issue_invoice('50000000-0000-0000-0000-000000000001');
select pg_temp.expect_error($$select public.save_invoice_draft(
  '50000000-0000-0000-0000-000000000001',
  '{"client_id":"40000000-0000-0000-0000-000000000002","currency":"CAD","tax_rate_bps":0,
    "issue_date":null,"due_date":null,"notes":null,"payment_instructions":null}', '[]')$$, '23514');

-- A reverted draft keeps its number, so it can't be deleted (no gap); unnumbered drafts can.
select public.revert_to_draft('50000000-0000-0000-0000-000000000001');
delete from public.invoices where id = '50000000-0000-0000-0000-000000000001';
do $$ begin
  assert exists (select 1 from public.invoices where id = '50000000-0000-0000-0000-000000000001'),
    'numbered draft was deleted';
end $$;
insert into public.invoices (id, client_id, currency)
values ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 'USD');
delete from public.invoices where id = '50000000-0000-0000-0000-000000000002';
do $$ begin
  assert not exists (select 1 from public.invoices where id = '50000000-0000-0000-0000-000000000002');
end $$;

-- Another user can't see or save someone else's draft.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d2';
select pg_temp.expect_error($$select public.save_invoice_draft(
  '50000000-0000-0000-0000-000000000001',
  '{"client_id":"40000000-0000-0000-0000-000000000001","currency":"USD","tax_rate_bps":0,
    "issue_date":null,"due_date":null,"notes":null,"payment_instructions":null}', '[]')$$, 'P0002');
