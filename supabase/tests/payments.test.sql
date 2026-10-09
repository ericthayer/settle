-- M3 acceptance: partial -> partial -> full shows partially_paid then paid;
-- deleting a payment reverts the status; history is retained.
\set ON_ERROR_STOP 1

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'payments@example.com');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';

insert into public.business_settings (business_name, timezone) values ('Payments Co', 'UTC');
insert into public.clients (id, name) values ('60000000-0000-0000-0000-000000000001', 'Payer');
insert into public.invoices (id, client_id, currency, due_date)
values ('70000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'USD', current_date + 30);
insert into public.invoice_line_items (invoice_id, position, description, quantity, unit_price_minor)
values ('70000000-0000-0000-0000-000000000001', 0, 'Work', 1, 30000);
select public.issue_invoice('70000000-0000-0000-0000-000000000001', current_date);

create function pg_temp.status() returns text language sql as $$
  select status::text || ' ' || balance_minor from public.invoice_summary where id = '70000000-0000-0000-0000-000000000001'
$$;

do $$ begin assert pg_temp.status() = 'sent 30000', pg_temp.status(); end $$;
select public.record_payment('70000000-0000-0000-0000-000000000001', 10000, current_date, 'check', '101');
do $$ begin assert pg_temp.status() = 'partially_paid 20000', pg_temp.status(); end $$;
select public.record_payment('70000000-0000-0000-0000-000000000001', 10000, current_date, 'check', '102');
do $$ begin assert pg_temp.status() = 'partially_paid 10000', pg_temp.status(); end $$;
select public.record_payment('70000000-0000-0000-0000-000000000001', 10000, current_date, 'ach', 'T-9');
do $$ begin assert pg_temp.status() = 'paid 0', pg_temp.status(); end $$;

select public.delete_payment(id) from public.payments where reference = 'T-9';
do $$ begin
  assert pg_temp.status() = 'partially_paid 10000', pg_temp.status();
  assert (select count(*) from public.payments where invoice_id = '70000000-0000-0000-0000-000000000001') = 3,
    'deleted payment must stay in history';
  assert (select deleted_at is not null from public.payments where reference = 'T-9');
end $$;

-- Removed payments can't be removed twice, and payments can't be hard-deleted.
do $$ begin
  begin
    perform public.delete_payment(id) from public.payments where reference = 'T-9';
    raise exception 'second delete should fail';
  exception when no_data_found then null;
  end;
end $$;
do $$ begin
  begin
    delete from public.payments where reference = '101';
    raise exception 'hard delete should be refused';
  exception when insufficient_privilege then null;
  end;
end $$;
