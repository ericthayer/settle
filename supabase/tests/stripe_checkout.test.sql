-- M5: Checkout inputs for a shared invoice, and idempotent Stripe payments.
\set ON_ERROR_STOP 1

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a5', 'stripe@example.com');

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
grant execute on function pg_temp.expect_error(text, text) to authenticated, anon, service_role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a5';

insert into public.business_settings (business_name, timezone) values ('Card Co', 'UTC');
insert into public.clients (id, name, email) values ('a5000000-0000-0000-0000-000000000001', 'Payer', 'ap@example.com');
insert into public.invoices (id, client_id, currency)
values ('a5100000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'USD');
insert into public.invoice_line_items (invoice_id, position, description, quantity, unit_price_minor)
values ('a5100000-0000-0000-0000-000000000001', 0, 'Work', 1, 50000);
select public.issue_invoice('a5100000-0000-0000-0000-000000000001', current_date);
create temp table tok as select public.ensure_public_token('a5100000-0000-0000-0000-000000000001') as t;
grant select on tok to anon, service_role;

-- Neither the owner's session nor the anon key can start checkout or record a card payment.
select pg_temp.expect_error($$select public.prepare_checkout((select t from tok))$$, '42501');
select pg_temp.expect_error(
  $$select public.record_stripe_payment('a5100000-0000-0000-0000-000000000001', 50000, 'usd', 'pi_owner')$$, '42501');
reset role;
set role anon;
select pg_temp.expect_error($$select public.prepare_checkout((select t from tok))$$, '42501');
select pg_temp.expect_error(
  $$select public.record_stripe_payment('a5100000-0000-0000-0000-000000000001', 50000, 'usd', 'pi_anon')$$, '42501');
reset role;
reset request.jwt.claim.sub;

set role service_role;

do $$
declare
  c jsonb := public.prepare_checkout((select t from tok));
begin
  assert c ->> 'invoice_id' = 'a5100000-0000-0000-0000-000000000001', c::text;
  assert (c ->> 'balance_minor')::bigint = 50000, c::text;
  assert c ->> 'currency' = 'USD', c::text;
  assert c ->> 'client_email' = 'ap@example.com', c::text;
  assert c ->> 'business_name' = 'Card Co', c::text;
  assert public.prepare_checkout(null) is null;
  assert public.prepare_checkout(gen_random_uuid()) is null, 'unknown token';
end $$;

-- Partial card payment, then the same webhook delivered again.
do $$
declare
  first jsonb := public.record_stripe_payment('a5100000-0000-0000-0000-000000000001', 20000, 'usd', 'pi_1', '{"event":"evt_1"}');
  replay jsonb := public.record_stripe_payment('a5100000-0000-0000-0000-000000000001', 20000, 'usd', 'pi_1', '{"event":"evt_1"}');
begin
  assert (first ->> 'duplicate')::boolean = false, first::text;
  assert (replay ->> 'duplicate')::boolean = true, replay::text;
  assert first ->> 'payment_id' = replay ->> 'payment_id', 'replay returns the original payment';
  assert (select count(*) from public.payments where provider_ref = 'pi_1') = 1, 'replay must not duplicate';
  assert (select status::text || ' ' || balance_minor from public.invoice_summary
          where id = 'a5100000-0000-0000-0000-000000000001') = 'partially_paid 30000';
  assert (public.prepare_checkout((select t from tok)) ->> 'balance_minor')::bigint = 30000, 'checkout follows the balance';
end $$;

do $$
declare
  p public.payments;
begin
  select * into p from public.payments where provider_ref = 'pi_1';
  assert p.source = 'stripe' and p.status = 'succeeded' and p.method = 'card', p::text;
  assert p.currency = 'USD' and p.reference = 'pi_1' and p.paid_on = current_date, p::text;
  assert p.owner_id = '00000000-0000-0000-0000-0000000000a5', 'owned by the invoice owner';
  assert p.provider_payload ->> 'event' = 'evt_1';
end $$;

-- The rest by card flips the invoice to paid with no manual step; nothing left to check out.
select public.record_stripe_payment('a5100000-0000-0000-0000-000000000001', 30000, 'usd', 'pi_2');
do $$ begin
  assert (select status::text || ' ' || balance_minor from public.invoice_summary
          where id = 'a5100000-0000-0000-0000-000000000001') = 'paid 0';
  assert public.prepare_checkout((select t from tok)) is null, 'paid invoices have nothing to check out';
end $$;

-- Money already taken is recorded even past the balance.
select public.record_stripe_payment('a5100000-0000-0000-0000-000000000001', 5000, 'usd', 'pi_3');
do $$ begin
  assert (select balance_minor from public.invoice_summary where id = 'a5100000-0000-0000-0000-000000000001') = -5000;
end $$;

-- Guards still apply: currency must match, a reference is required, the invoice must exist.
select pg_temp.expect_error(
  $$select public.record_stripe_payment('a5100000-0000-0000-0000-000000000001', 100, 'eur', 'pi_eur')$$, '23514');
select pg_temp.expect_error(
  $$select public.record_stripe_payment('a5100000-0000-0000-0000-000000000001', 100, 'usd', ' ')$$, '23502');
select pg_temp.expect_error(
  $$select public.record_stripe_payment(gen_random_uuid(), 100, 'usd', 'pi_missing')$$, 'P0002');
reset role;

-- Drafts and void invoices can't be checked out.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a5';
insert into public.invoices (id, client_id, currency)
values ('a5100000-0000-0000-0000-000000000002', 'a5000000-0000-0000-0000-000000000001', 'USD');
insert into public.invoice_line_items (invoice_id, position, description, quantity, unit_price_minor)
values ('a5100000-0000-0000-0000-000000000002', 0, 'Work', 1, 10000);
select public.issue_invoice('a5100000-0000-0000-0000-000000000002', current_date);
create temp table tok2 as select public.ensure_public_token('a5100000-0000-0000-0000-000000000002') as t;
grant select on tok2 to service_role;
select public.void_invoice('a5100000-0000-0000-0000-000000000002', 'mistake');
reset role;
set role service_role;
do $$ begin
  assert public.prepare_checkout((select t from tok2)) is null, 'void invoices have nothing to check out';
end $$;
select pg_temp.expect_error(
  $$select public.record_stripe_payment('a5100000-0000-0000-0000-000000000002', 10000, 'usd', 'pi_void')$$, '23514');
reset role;
