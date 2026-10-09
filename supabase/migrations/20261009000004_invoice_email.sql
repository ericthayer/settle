-- M6: email invoices and reminders from the app.
--
-- The send-invoice-email Edge Function sends through Resend as the signed-in
-- owner (RLS applies), then records the send with log_invoice_email. The email
-- links to a public read-only page that reads the invoice through
-- get_public_invoice(public_token): an unguessable token, no account needed.

-- ─── sent_at + email log ───────────────────────────────────────────────────

alter table public.invoices add column sent_at timestamptz;

create type public.invoice_email_kind as enum ('invoice', 'reminder');

create table public.invoice_emails (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  kind public.invoice_email_kind not null,
  to_email text not null check (length(trim(to_email)) > 0),
  cc_emails text[] not null default '{}',
  subject text not null,
  provider_message_id text,
  created_at timestamptz not null default now()
);

create index invoice_emails_invoice_idx on public.invoice_emails (invoice_id, created_at);
create index invoice_emails_owner_idx on public.invoice_emails (owner_id);

alter table public.invoice_emails enable row level security;

-- Insert only through log_invoice_email; the log is append-only.
create policy invoice_emails_owner_select on public.invoice_emails for select to authenticated
  using (owner_id = (select auth.uid()));
create policy invoice_emails_owner_insert on public.invoice_emails for insert to authenticated
  with check (owner_id = (select auth.uid()));

revoke all on public.invoice_emails from anon, authenticated;
grant select, insert on public.invoice_emails to authenticated;

-- Issued invoices stay frozen except for delivery bookkeeping (sent_at) and the share link.
create or replace function public.guard_invoice_mutation() returns trigger
language plpgsql set search_path = public as $$
declare
  free_cols text[] := array['updated_at', 'public_token', 'checkout_url', 'sent_at'];
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

-- invoice_summary selects i.*, which Postgres expands when the view is created,
-- so it has to be recreated to pick up sent_at. Same definition as before.
drop view public.invoice_summary;
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

revoke all on public.invoice_summary from anon;
grant select on public.invoice_summary to authenticated;

-- ─── RPCs used by the Edge Function (as the owner) ─────────────────────────

-- Share token for the public invoice page; created on first send, then reused.
create function public.ensure_public_token(p_invoice_id uuid) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_token uuid;
begin
  update public.invoices
    set public_token = coalesce(public_token, gen_random_uuid())
    where id = p_invoice_id and lifecycle = 'issued'
    returning public_token into v_token;
  if v_token is null then
    raise exception 'only issued invoices can be shared' using errcode = 'check_violation';
  end if;
  return v_token;
end;
$$;

-- Records a delivered email. The first invoice email sets sent_at.
create function public.log_invoice_email(
  p_invoice_id uuid,
  p_kind public.invoice_email_kind,
  p_to text,
  p_cc text[],
  p_subject text,
  p_provider_message_id text default null
) returns public.invoice_emails
language plpgsql security invoker set search_path = public as $$
declare
  inv public.invoices;
  v_email public.invoice_emails;
begin
  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'invoice % not found', p_invoice_id using errcode = 'no_data_found';
  end if;
  if inv.lifecycle <> 'issued' then
    raise exception 'only issued invoices can be emailed (invoice is %)', inv.lifecycle using errcode = 'check_violation';
  end if;

  insert into public.invoice_emails (owner_id, invoice_id, kind, to_email, cc_emails, subject, provider_message_id)
  values (inv.owner_id, inv.id, p_kind, p_to, coalesce(p_cc, '{}'), p_subject, p_provider_message_id)
  returning * into v_email;

  if p_kind = 'invoice' and inv.sent_at is null then
    update public.invoices set sent_at = v_email.created_at where id = inv.id;
  end if;
  return v_email;
end;
$$;

-- ─── Public invoice page (anon) ────────────────────────────────────────────

-- What the client sees: the frozen snapshots, totals and balance, never internal ids.
-- Drafts (including reverted invoices) return null.
create function public.get_public_invoice(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'invoice', jsonb_build_object(
      'number', s.number, 'lifecycle', s.lifecycle, 'status', s.status,
      'issue_date', s.issue_date, 'due_date', s.due_date, 'currency', s.currency,
      'tax_rate_bps', s.tax_rate_bps, 'subtotal_minor', s.subtotal_minor, 'tax_minor', s.tax_minor,
      'total_minor', s.total_minor, 'amount_paid_minor', s.amount_paid_minor, 'balance_minor', s.balance_minor,
      'notes', s.notes, 'payment_instructions', s.payment_instructions,
      'bill_to', s.bill_to, 'bill_from', s.bill_from, 'void_reason', s.void_reason),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', li.position, 'description', li.description, 'quantity', li.quantity,
        'unit_price_minor', li.unit_price_minor, 'amount_minor', li.amount_minor, 'taxable', li.taxable)
        order by li.position)
      from public.invoice_line_items li where li.invoice_id = s.id), '[]'::jsonb))
  from public.invoice_summary s
  where p_token is not null and s.public_token = p_token and s.lifecycle <> 'draft';
$$;

-- The logo printed on a shared invoice is readable by whoever holds the link.
create function public.is_shared_logo(p_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.invoices
    where public_token is not null and lifecycle <> 'draft' and bill_from ->> 'logo_path' = p_path);
$$;

do $migration$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'storage schema not present; skipping shared logo policy';
    return;
  end if;
  execute $p$
    create policy logos_shared_select on storage.objects for select to anon, authenticated
      using (bucket_id = 'logos' and public.is_shared_logo(name))
  $p$;
end
$migration$;

-- ─── Grants ────────────────────────────────────────────────────────────────

revoke execute on function
  public.ensure_public_token(uuid),
  public.log_invoice_email(uuid, public.invoice_email_kind, text, text[], text, text),
  public.get_public_invoice(uuid),
  public.is_shared_logo(text)
from public, anon;
grant execute on function
  public.ensure_public_token(uuid),
  public.log_invoice_email(uuid, public.invoice_email_kind, text, text[], text, text)
to authenticated;
grant execute on function public.get_public_invoice(uuid), public.is_shared_logo(text) to anon, authenticated;
