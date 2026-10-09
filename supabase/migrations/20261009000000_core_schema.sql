-- Settle core schema: business settings, clients, invoices, line items, payments.
-- Money is bigint minor units. Invoice lifecycle is stored (draft/issued/void);
-- paid / partially_paid / overdue are derived in invoice_summary.
-- Lifecycle changes go through the RPCs at the bottom; triggers enforce that
-- issued invoices and their line items are immutable.

set check_function_bodies = off;

-- ─── Types ─────────────────────────────────────────────────────────────────

create type public.invoice_lifecycle as enum ('draft', 'issued', 'void');
create type public.invoice_status as enum ('draft', 'sent', 'partially_paid', 'paid', 'overdue', 'void');
create type public.payment_method as enum ('bank_transfer', 'ach', 'check', 'cash', 'card', 'zelle', 'paypal', 'other');
create type public.payment_source as enum ('manual', 'stripe');
create type public.payment_status as enum ('pending', 'succeeded', 'failed', 'refunded');

-- ─── Shared helpers ────────────────────────────────────────────────────────

create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Lifecycle RPCs set this transaction-local flag so guarded columns may change.
create function public.lifecycle_change_allowed() returns boolean
language sql stable as $$
  select coalesce(current_setting('settle.lifecycle_change', true), '') = 'on';
$$;

-- ─── business_settings ─────────────────────────────────────────────────────

create table public.business_settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  business_name text not null check (length(trim(business_name)) > 0),
  email text,
  phone text,
  website text,
  address jsonb not null default '{}'::jsonb,
  tax_id text,
  logo_path text,
  timezone text not null default 'UTC',
  default_currency char(3) not null default 'USD' check (default_currency ~ '^[A-Z]{3}$'),
  default_payment_terms_days int not null default 30 check (default_payment_terms_days between 0 and 365),
  default_tax_rate_bps int not null default 0 check (default_tax_rate_bps between 0 and 10000),
  default_notes text,
  payment_instructions text,
  invoice_prefix text not null default 'INV-',
  invoice_number_width int not null default 4 check (invoice_number_width between 1 and 10),
  next_invoice_number int not null default 1 check (next_invoice_number > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Next number may only move forward, so issued numbers are never reused.
create function public.guard_invoice_sequence() returns trigger
language plpgsql as $$
begin
  if new.next_invoice_number < old.next_invoice_number then
    raise exception 'next_invoice_number can only increase (was %, got %)',
      old.next_invoice_number, new.next_invoice_number
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger business_settings_updated_at before update on public.business_settings
  for each row execute function public.set_updated_at();
create trigger business_settings_sequence before update of next_invoice_number on public.business_settings
  for each row execute function public.guard_invoice_sequence();

-- Owner's local calendar date; overdue is judged against this, not UTC.
create function public.owner_today(p_owner uuid default auth.uid()) returns date
language sql stable as $$
  select (now() at time zone coalesce(
    (select bs.timezone from public.business_settings bs where bs.owner_id = p_owner),
    'UTC'))::date;
$$;

-- ─── clients ───────────────────────────────────────────────────────────────

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  contact_name text,
  email text,
  cc_emails text[] not null default '{}',
  phone text,
  billing_address jsonb not null default '{}'::jsonb,
  tax_id text,
  payment_terms_days int check (payment_terms_days between 0 and 365),
  currency char(3) check (currency ~ '^[A-Z]{3}$'),
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clients_owner_name_idx on public.clients (owner_id, lower(name));

create trigger clients_updated_at before update on public.clients
  for each row execute function public.set_updated_at();

-- ─── invoices ──────────────────────────────────────────────────────────────

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete restrict,
  lifecycle public.invoice_lifecycle not null default 'draft',
  number text,
  issue_date date,
  due_date date,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  tax_rate_bps int not null default 0 check (tax_rate_bps between 0 and 10000),
  subtotal_minor bigint not null default 0 check (subtotal_minor >= 0),
  tax_minor bigint not null default 0 check (tax_minor >= 0),
  total_minor bigint not null default 0 check (total_minor >= 0),
  notes text,
  payment_instructions text,
  bill_to jsonb,
  bill_from jsonb,
  issued_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  -- Reserved for online payment (Stripe Checkout); unused in MVP.
  public_token uuid unique,
  checkout_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_number_unique unique (owner_id, number),
  constraint invoices_issued_has_number check (lifecycle = 'draft' or number is not null),
  constraint invoices_issued_has_dates check (lifecycle = 'draft' or (issue_date is not null and due_date is not null)),
  constraint invoices_due_after_issue check (due_date is null or issue_date is null or due_date >= issue_date)
);

create index invoices_owner_lifecycle_due_idx on public.invoices (owner_id, lifecycle, due_date);
create index invoices_client_idx on public.invoices (client_id);

-- Client must belong to the same owner (RLS alone doesn't stop a forged FK).
create function public.guard_invoice_client() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from public.clients c where c.id = new.client_id and c.owner_id = new.owner_id) then
    raise exception 'client % not found', new.client_id using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

-- Drafts are freely editable. Lifecycle/number only change via RPCs.
-- Issued and void invoices are frozen except for the reserved payment-link columns.
create function public.guard_invoice_mutation() returns trigger
language plpgsql as $$
declare
  free_cols text[] := array['updated_at', 'public_token', 'checkout_url'];
begin
  if tg_op = 'INSERT' then
    if new.lifecycle <> 'draft' or new.number is not null then
      raise exception 'invoices are created as drafts without a number' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if public.lifecycle_change_allowed() then
    return new;
  end if;

  if new.lifecycle is distinct from old.lifecycle or new.number is distinct from old.number
     or new.owner_id is distinct from old.owner_id then
    raise exception 'use issue_invoice / revert_to_draft / void_invoice to change invoice lifecycle'
      using errcode = 'check_violation';
  end if;

  if old.lifecycle <> 'draft'
     and (to_jsonb(new) - free_cols) is distinct from (to_jsonb(old) - free_cols) then
    raise exception 'invoice % is % and cannot be edited', old.number, old.lifecycle
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger invoices_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();
create trigger invoices_guard_client before insert or update of client_id on public.invoices
  for each row execute function public.guard_invoice_client();
create trigger invoices_guard_mutation before insert or update on public.invoices
  for each row execute function public.guard_invoice_mutation();

-- ─── invoice_line_items ────────────────────────────────────────────────────

create table public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  position int not null check (position >= 0),
  description text not null check (length(trim(description)) > 0),
  quantity numeric(12, 3) not null check (quantity > 0),
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  taxable boolean not null default true,
  amount_minor bigint generated always as (round(quantity * unit_price_minor)::bigint) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint line_items_position_unique unique (invoice_id, position) deferrable initially deferred
);

create index line_items_invoice_idx on public.invoice_line_items (invoice_id);

create function public.recompute_invoice_totals(p_invoice_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('settle.lifecycle_change', 'on', true);
  update public.invoices i
  set subtotal_minor = t.subtotal,
      tax_minor = t.tax,
      total_minor = t.subtotal + t.tax
  from (
    select
      coalesce(sum(li.amount_minor), 0)::bigint as subtotal,
      round(coalesce(sum(li.amount_minor) filter (where li.taxable), 0) * inv.tax_rate_bps / 10000.0)::bigint as tax
    from public.invoices inv
    left join public.invoice_line_items li on li.invoice_id = inv.id
    where inv.id = p_invoice_id
    group by inv.id, inv.tax_rate_bps
  ) t
  where i.id = p_invoice_id
    and (i.subtotal_minor, i.tax_minor, i.total_minor) is distinct from (t.subtotal, t.tax, t.subtotal + t.tax);
  perform set_config('settle.lifecycle_change', '', true);
end;
$$;

create function public.guard_line_item() returns trigger
language plpgsql as $$
declare
  target_invoice uuid := coalesce(new.invoice_id, old.invoice_id);
  inv record;
begin
  select lifecycle, owner_id into inv from public.invoices where id = target_invoice;
  if not found then
    -- Parent already gone during a cascade delete of a draft: nothing to guard.
    if tg_op = 'DELETE' then
      return old;
    end if;
    -- Not visible to the caller under RLS, or doesn't exist.
    raise exception 'invoice % not found', target_invoice using errcode = 'foreign_key_violation';
  end if;
  if inv.lifecycle <> 'draft' then
    raise exception 'line items of a % invoice cannot be changed', inv.lifecycle using errcode = 'check_violation';
  end if;
  if tg_op <> 'DELETE' and new.owner_id <> inv.owner_id then
    raise exception 'invoice % not found', target_invoice using errcode = 'foreign_key_violation';
  end if;
  if tg_op = 'UPDATE' and new.invoice_id <> old.invoice_id then
    raise exception 'line items cannot move between invoices' using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;

create function public.line_items_changed() returns trigger
language plpgsql as $$
begin
  perform public.recompute_invoice_totals(coalesce(new.invoice_id, old.invoice_id));
  return null;
end;
$$;

create function public.invoice_tax_rate_changed() returns trigger
language plpgsql as $$
begin
  perform public.recompute_invoice_totals(new.id);
  return null;
end;
$$;

create trigger line_items_updated_at before update on public.invoice_line_items
  for each row execute function public.set_updated_at();
create trigger line_items_guard before insert or update or delete on public.invoice_line_items
  for each row execute function public.guard_line_item();
create trigger line_items_totals after insert or update or delete on public.invoice_line_items
  for each row execute function public.line_items_changed();
create trigger invoices_tax_rate_totals after update of tax_rate_bps on public.invoices
  for each row when (old.tax_rate_bps is distinct from new.tax_rate_bps)
  execute function public.invoice_tax_rate_changed();

-- ─── payments ──────────────────────────────────────────────────────────────

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  paid_on date not null,
  method public.payment_method not null,
  reference text,
  note text,
  source public.payment_source not null default 'manual',
  status public.payment_status not null default 'succeeded',
  provider_ref text,
  provider_fee_minor bigint check (provider_fee_minor >= 0),
  provider_payload jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_manual_succeeded check (source <> 'manual' or status = 'succeeded')
);

create index payments_invoice_idx on public.payments (invoice_id) where deleted_at is null;
create index payments_owner_paid_on_idx on public.payments (owner_id, paid_on) where deleted_at is null;
-- Idempotency key for provider webhooks.
create unique index payments_provider_ref_unique on public.payments (provider_ref) where provider_ref is not null;

create function public.guard_payment() returns trigger
language plpgsql as $$
declare
  inv record;
begin
  if tg_op = 'UPDATE' then
    if (new.invoice_id, new.amount_minor, new.currency, new.owner_id, new.source)
       is distinct from (old.invoice_id, old.amount_minor, old.currency, old.owner_id, old.source) then
      raise exception 'payment amount, currency and invoice cannot change; delete and re-record instead'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  select lifecycle, currency, owner_id into inv from public.invoices where id = new.invoice_id;
  if not found or inv.owner_id <> new.owner_id then
    raise exception 'invoice % not found', new.invoice_id using errcode = 'foreign_key_violation';
  end if;
  if inv.lifecycle <> 'issued' then
    raise exception 'payments can only be recorded on issued invoices (invoice is %)', inv.lifecycle
      using errcode = 'check_violation';
  end if;
  if new.currency <> inv.currency then
    raise exception 'payment currency % does not match invoice currency %', new.currency, inv.currency
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();
create trigger payments_guard before insert or update on public.payments
  for each row execute function public.guard_payment();

-- ─── Derived status ────────────────────────────────────────────────────────

create view public.invoice_summary with (security_invoker = true) as
with paid as (
  select p.invoice_id, sum(p.amount_minor)::bigint as amount_paid_minor, max(p.paid_on) as last_paid_on
  from public.payments p
  where p.status = 'succeeded' and p.deleted_at is null
  group by p.invoice_id
),
base as (
  select
    i.*,
    c.name as client_name,
    coalesce(paid.amount_paid_minor, 0) as amount_paid_minor,
    i.total_minor - coalesce(paid.amount_paid_minor, 0) as balance_minor,
    paid.last_paid_on,
    public.owner_today(i.owner_id) as today
  from public.invoices i
  join public.clients c on c.id = i.client_id
  left join paid on paid.invoice_id = i.id
)
select
  base.*,
  case
    when lifecycle = 'void' then 'void'
    when lifecycle = 'draft' then 'draft'
    when balance_minor <= 0 then 'paid'
    when due_date < today then 'overdue'
    when amount_paid_minor > 0 then 'partially_paid'
    else 'sent'
  end::public.invoice_status as status,
  case
    when lifecycle = 'issued' and balance_minor > 0 and due_date < today then today - due_date
    else 0
  end as days_overdue
from base;

-- ─── Lifecycle RPCs ────────────────────────────────────────────────────────
-- security invoker: they run as the caller, so RLS still scopes every row.

create function public.issue_invoice(p_invoice_id uuid, p_issue_date date default null)
returns public.invoices
language plpgsql security invoker set search_path = public as $$
declare
  inv public.invoices;
  settings public.business_settings;
  cli public.clients;
  v_issue_date date;
  v_number text;
  line_count int;
begin
  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'invoice % not found', p_invoice_id using errcode = 'no_data_found';
  end if;
  if inv.lifecycle <> 'draft' then
    raise exception 'only drafts can be issued (invoice is %)', inv.lifecycle using errcode = 'check_violation';
  end if;

  select count(*) into line_count from public.invoice_line_items where invoice_id = inv.id;
  if line_count = 0 or inv.total_minor <= 0 then
    raise exception 'an invoice needs at least one line item and a total above zero' using errcode = 'check_violation';
  end if;

  -- Row lock serializes numbering: concurrent issues queue here.
  select * into settings from public.business_settings where owner_id = inv.owner_id for update;
  if not found then
    raise exception 'business settings are not configured' using errcode = 'no_data_found';
  end if;
  select * into cli from public.clients where id = inv.client_id;

  v_issue_date := coalesce(p_issue_date, inv.issue_date, public.owner_today(inv.owner_id));
  v_number := inv.number;  -- reverted drafts keep their number
  if v_number is null then
    v_number := settings.invoice_prefix || lpad(settings.next_invoice_number::text, settings.invoice_number_width, '0');
    update public.business_settings
      set next_invoice_number = next_invoice_number + 1
      where id = settings.id;
  end if;

  perform set_config('settle.lifecycle_change', 'on', true);
  update public.invoices set
    lifecycle = 'issued',
    number = v_number,
    issue_date = v_issue_date,
    due_date = coalesce(inv.due_date,
      v_issue_date + coalesce(cli.payment_terms_days, settings.default_payment_terms_days)),
    issued_at = now(),
    bill_to = jsonb_build_object(
      'name', cli.name, 'contact_name', cli.contact_name, 'email', cli.email,
      'phone', cli.phone, 'address', cli.billing_address, 'tax_id', cli.tax_id),
    bill_from = jsonb_build_object(
      'business_name', settings.business_name, 'email', settings.email, 'phone', settings.phone,
      'website', settings.website, 'address', settings.address, 'tax_id', settings.tax_id,
      'logo_path', settings.logo_path)
  where id = inv.id
  returning * into inv;
  perform set_config('settle.lifecycle_change', '', true);

  return inv;
end;
$$;

create function public.has_succeeded_payments(p_invoice_id uuid) returns boolean
language sql stable as $$
  select exists (
    select 1 from public.payments
    where invoice_id = p_invoice_id and status = 'succeeded' and deleted_at is null);
$$;

create function public.revert_to_draft(p_invoice_id uuid)
returns public.invoices
language plpgsql security invoker set search_path = public as $$
declare
  inv public.invoices;
begin
  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'invoice % not found', p_invoice_id using errcode = 'no_data_found';
  end if;
  if inv.lifecycle <> 'issued' then
    raise exception 'only issued invoices can be reverted (invoice is %)', inv.lifecycle using errcode = 'check_violation';
  end if;
  if public.has_succeeded_payments(inv.id) then
    raise exception 'invoice % has payments; delete them before reverting', inv.number using errcode = 'check_violation';
  end if;

  perform set_config('settle.lifecycle_change', 'on', true);
  update public.invoices
    set lifecycle = 'draft', issued_at = null, bill_to = null, bill_from = null
    where id = inv.id
    returning * into inv;
  perform set_config('settle.lifecycle_change', '', true);
  return inv;
end;
$$;

create function public.void_invoice(p_invoice_id uuid, p_reason text default null)
returns public.invoices
language plpgsql security invoker set search_path = public as $$
declare
  inv public.invoices;
begin
  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'invoice % not found', p_invoice_id using errcode = 'no_data_found';
  end if;
  if inv.lifecycle <> 'issued' then
    raise exception 'only issued invoices can be voided (invoice is %)', inv.lifecycle using errcode = 'check_violation';
  end if;
  if public.has_succeeded_payments(inv.id) then
    raise exception 'invoice % has payments; delete them before voiding', inv.number using errcode = 'check_violation';
  end if;

  perform set_config('settle.lifecycle_change', 'on', true);
  update public.invoices
    set lifecycle = 'void', voided_at = now(), void_reason = nullif(trim(p_reason), '')
    where id = inv.id
    returning * into inv;
  perform set_config('settle.lifecycle_change', '', true);
  return inv;
end;
$$;

create function public.record_payment(
  p_invoice_id uuid,
  p_amount_minor bigint,
  p_paid_on date,
  p_method public.payment_method,
  p_reference text default null,
  p_note text default null
) returns public.payments
language plpgsql security invoker set search_path = public as $$
declare
  inv public.invoices;
  paid bigint;
  result public.payments;
begin
  -- Lock the invoice so two payments can't both pass the balance check.
  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'invoice % not found', p_invoice_id using errcode = 'no_data_found';
  end if;

  select coalesce(sum(amount_minor), 0) into paid
  from public.payments
  where invoice_id = inv.id and status = 'succeeded' and deleted_at is null;

  if p_amount_minor > inv.total_minor - paid then
    raise exception 'payment of % exceeds the remaining balance of %', p_amount_minor, inv.total_minor - paid
      using errcode = 'check_violation';
  end if;

  insert into public.payments (owner_id, invoice_id, amount_minor, currency, paid_on, method, reference, note)
  values (inv.owner_id, inv.id, p_amount_minor, inv.currency, p_paid_on, p_method,
          nullif(trim(p_reference), ''), nullif(trim(p_note), ''))
  returning * into result;
  return result;
end;
$$;

create function public.delete_payment(p_payment_id uuid)
returns public.payments
language plpgsql security invoker set search_path = public as $$
declare
  result public.payments;
begin
  update public.payments set deleted_at = now()
  where id = p_payment_id and deleted_at is null
  returning * into result;
  if not found then
    raise exception 'payment % not found', p_payment_id using errcode = 'no_data_found';
  end if;
  return result;
end;
$$;

-- ─── Row Level Security ────────────────────────────────────────────────────

alter table public.business_settings enable row level security;
alter table public.clients enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_line_items enable row level security;
alter table public.payments enable row level security;

create policy business_settings_owner on public.business_settings for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy clients_owner_select on public.clients for select to authenticated
  using (owner_id = (select auth.uid()));
create policy clients_owner_insert on public.clients for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy clients_owner_update on public.clients for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
-- Hard delete is only possible for clients with no invoices (FK restrict); otherwise archive.
create policy clients_owner_delete on public.clients for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy invoices_owner_select on public.invoices for select to authenticated
  using (owner_id = (select auth.uid()));
create policy invoices_owner_insert on public.invoices for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy invoices_owner_update on public.invoices for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
-- Only drafts can be deleted; issued invoices are voided instead.
create policy invoices_owner_delete_drafts on public.invoices for delete to authenticated
  using (owner_id = (select auth.uid()) and lifecycle = 'draft');

create policy line_items_owner on public.invoice_line_items for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Payments are never hard-deleted from the client; delete_payment soft-deletes.
create policy payments_owner_select on public.payments for select to authenticated
  using (owner_id = (select auth.uid()));
create policy payments_owner_insert on public.payments for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy payments_owner_update on public.payments for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- ─── Grants ────────────────────────────────────────────────────────────────
-- Nothing for anon. Authenticated gets table access (RLS scopes it) and the RPCs.

revoke all on public.business_settings, public.clients, public.invoices,
  public.invoice_line_items, public.payments, public.invoice_summary from anon;
revoke delete on public.payments from authenticated;
grant select, insert, update, delete on public.business_settings, public.clients, public.invoices,
  public.invoice_line_items to authenticated;
grant select, insert, update on public.payments to authenticated;
grant select on public.invoice_summary to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.issue_invoice(uuid, date),
  public.revert_to_draft(uuid),
  public.void_invoice(uuid, text),
  public.record_payment(uuid, bigint, date, public.payment_method, text, text),
  public.delete_payment(uuid),
  public.owner_today(uuid)
to authenticated;
-- Helpers called from triggers and RPCs run as the caller, so the caller needs execute.
-- (Trigger functions themselves are not checked for execute privilege when they fire.)
grant execute on function
  public.lifecycle_change_allowed(),
  public.recompute_invoice_totals(uuid),
  public.has_succeeded_payments(uuid)
to authenticated;
