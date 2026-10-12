-- Automatic payment reminders.
--
-- Once a day pg_cron calls the send-due-reminders Edge Function. It asks
-- due_reminders() which invoices have reached a reminder step, claims each step
-- with claim_automatic_reminder before sending, releases the claim if the send
-- fails, and logs a sent reminder with log_automatic_reminder. Owners opt in with
-- business_settings.auto_reminders.
--
-- Rules: steps are days from the due date (reminder_schedule), counted in the
-- owner's time zone. Only the latest step reached is sent, and only within 6 days
-- of its date, so a missed day never sends a burst and turning reminders on never
-- mails long-overdue invoices. Only invoices whose current version was emailed and
-- that have a usable recipient address qualify. Nothing goes out within 3 days of
-- any email for the invoice, manual ones included. Each step is claimed once per
-- issue of the invoice, and the schedule stops once it is paid, voided or reverted.

alter table public.business_settings add column auto_reminders boolean not null default false;

-- Set on automatic reminders only: the schedule step (days from the due date) it was sent for.
alter table public.invoice_emails add column reminder_step int;

-- One row per step a run has taken on, keyed to the issue it belongs to, so a
-- re-issued invoice starts a fresh schedule. RLS with no policies: only the
-- service role (which bypasses RLS) reads or writes it.
create table public.automatic_reminder_claims (
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  issued_at timestamptz not null,
  reminder_step int not null,
  claimed_at timestamptz not null default now(),
  primary key (invoice_id, issued_at, reminder_step)
);
alter table public.automatic_reminder_claims enable row level security;

-- Days relative to the due date, in the owner's time zone: 3 days before, then 1, 7, 14 and 30 days late.
create function public.reminder_schedule() returns int[]
language sql immutable as $$ select array[-3, 1, 7, 14, 30] $$;

-- Mirrors resolveRecipients in deliver-invoice-email.ts: the client's address wins,
-- else the invoice snapshot's, trimmed and checked against the same pattern (EMAIL_RE).
create function public.has_deliverable_address(p_client_email text, p_snapshot_email text) returns boolean
language sql immutable as $$
  select coalesce(
    coalesce(nullif(btrim(p_client_email, E' \t\r\n\u00a0'), ''), btrim(p_snapshot_email, E' \t\r\n\u00a0'))
      ~ '^[^\s\u00a0@,;<>]+@[^\s\u00a0@,;<>]+\.[^\s\u00a0@,;<>]+$',
    false)
$$;

create function public.due_reminders() returns table (invoice_id uuid, reminder_step int)
language sql stable security invoker set search_path = public as $$
  select s.id, step.day
  from public.invoice_summary s
  join public.business_settings bs on bs.owner_id = s.owner_id and bs.auto_reminders
  join public.clients c on c.id = s.client_id
  cross join lateral (
    select max(d) as day from unnest(public.reminder_schedule()) d where d <= s.today - s.due_date
  ) step
  where s.lifecycle = 'issued'
    and s.balance_minor > 0
    and step.day is not null
    and s.today - s.due_date - step.day < 7
    and public.has_deliverable_address(c.email, s.bill_to ->> 'email')
    -- The current version was emailed (a re-issued invoice must be sent again first).
    and exists (
      select 1 from public.invoice_emails e
      where e.invoice_id = s.id and e.created_at >= s.issued_at)
    and not exists (
      select 1 from public.invoice_emails e
      where e.invoice_id = s.id and e.created_at > now() - interval '3 days')
    and not exists (
      select 1 from public.automatic_reminder_claims rc
      where rc.invoice_id = s.id and rc.issued_at = s.issued_at and rc.reminder_step = step.day);
$$;

-- Takes a step before sending it. False when another run already took it, or the
-- invoice no longer has a balance on an issued invoice.
create function public.claim_automatic_reminder(p_invoice_id uuid, p_step int) returns boolean
language plpgsql security invoker set search_path = public as $$
declare
  v_issued_at timestamptz;
begin
  select issued_at into v_issued_at from public.invoice_summary
    where id = p_invoice_id and lifecycle = 'issued' and balance_minor > 0;
  if v_issued_at is null then
    return false;
  end if;
  insert into public.automatic_reminder_claims (invoice_id, issued_at, reminder_step)
  values (p_invoice_id, v_issued_at, p_step)
  on conflict do nothing;
  return found;
end;
$$;

-- Gives a step back after a failed send, so the next run can try it again.
create function public.release_automatic_reminder(p_invoice_id uuid, p_step int) returns void
language sql security invoker set search_path = public as $$
  delete from public.automatic_reminder_claims rc
  using public.invoices i
  where rc.invoice_id = p_invoice_id and rc.reminder_step = p_step
    and i.id = rc.invoice_id and rc.issued_at = i.issued_at;
$$;

-- Records a sent automatic reminder in the invoice's email history.
create function public.log_automatic_reminder(
  p_invoice_id uuid,
  p_step int,
  p_to text,
  p_cc text[],
  p_subject text,
  p_provider_message_id text default null
) returns void
language sql security invoker set search_path = public as $$
  insert into public.invoice_emails (owner_id, invoice_id, kind, to_email, cc_emails, subject, provider_message_id, reminder_step)
  select i.owner_id, i.id, 'reminder', p_to, coalesce(p_cc, '{}'), p_subject, p_provider_message_id, p_step
  from public.invoices i where i.id = p_invoice_id;
$$;

revoke execute on function
  public.due_reminders(),
  public.claim_automatic_reminder(uuid, int),
  public.release_automatic_reminder(uuid, int),
  public.log_automatic_reminder(uuid, int, text, text[], text, text)
from public, anon, authenticated;
grant execute on function
  public.due_reminders(),
  public.claim_automatic_reminder(uuid, int),
  public.release_automatic_reminder(uuid, int),
  public.log_automatic_reminder(uuid, int, text, text[], text, text)
to service_role;

create function public.reminder_cron_secret_matches(p_secret text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return coalesce(p_secret = (
    select decrypted_secret from vault.decrypted_secrets where name = 'reminder_cron_secret'), false);
end;
$$;

revoke execute on function public.reminder_cron_secret_matches(text) from public, anon, authenticated;
grant execute on function public.reminder_cron_secret_matches(text) to service_role;

-- ─── Daily job ─────────────────────────────────────────────────────────────

-- A random secret in Vault is the job's credential: pg_cron reads it to call the
-- send-due-reminders Edge Function, which checks it with reminder_cron_secret_matches.
-- Nothing to copy by hand.
do $migration$
begin
  if to_regnamespace('vault') is null then
    raise notice 'vault not present; skipping reminder secret';
    return;
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'reminder_cron_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'reminder_cron_secret');
  end if;
end
$migration$;

-- Every day at 14:00 UTC (morning across US time zones). Each invoice's schedule is
-- worked out in its owner's time zone, so the hour only decides when mail goes out.
-- A local `supabase start` stack schedules the same call against production; its own
-- secret doesn't match there, so the call is refused and sends nothing.
do $migration$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net')
     or to_regnamespace('vault') is null then
    raise notice 'pg_cron, pg_net or vault not available; skipping the daily reminder job';
    return;
  end if;
  create extension if not exists pg_cron with schema pg_catalog;
  create extension if not exists pg_net with schema extensions;
  perform cron.schedule('send-due-reminders', '0 14 * * *', $job$
    select net.http_post(
      url := 'https://kkjuiwytzkrmsuectqto.supabase.co/functions/v1/send-due-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-reminder-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_cron_secret')),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000)
  $job$);
end
$migration$;
