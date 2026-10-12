-- Automatic payment reminders.
--
-- Once a day pg_cron calls the send-due-reminders Edge Function. It asks
-- due_reminders() which sent, unpaid invoices have reached a schedule step that
-- hasn't been emailed, sends each one reminder, and records it with
-- log_automatic_reminder. Owners opt in with business_settings.auto_reminders.
--
-- Rules: steps are days from the due date (reminder_schedule); only the latest
-- step reached is sent, so a missed day never sends a burst; nothing goes out
-- within 3 days of any email for the invoice, manual ones included; each step is
-- sent at most once per invoice (unique index), and the schedule stops once the
-- invoice is paid, voided or reverted to draft.

alter table public.business_settings add column auto_reminders boolean not null default false;

-- Set on automatic reminders only: the schedule step (days from the due date) it was sent for.
alter table public.invoice_emails add column reminder_step int;
create unique index invoice_emails_reminder_step_key on public.invoice_emails (invoice_id, reminder_step)
  where reminder_step is not null;

-- Days relative to the due date, in the owner's time zone: 3 days before, then 1, 7, 14 and 30 days late.
create function public.reminder_schedule() returns int[]
language sql immutable as $$ select array[-3, 1, 7, 14, 30] $$;

create function public.due_reminders() returns table (invoice_id uuid, reminder_step int)
language sql stable security invoker set search_path = public as $$
  select s.id, step.day
  from public.invoice_summary s
  join public.business_settings bs on bs.owner_id = s.owner_id and bs.auto_reminders
  cross join lateral (
    select max(d) as day from unnest(public.reminder_schedule()) d where d <= s.today - s.due_date
  ) step
  where s.lifecycle = 'issued'
    and s.balance_minor > 0
    and s.sent_at is not null
    and step.day is not null
    and not exists (
      select 1 from public.invoice_emails e
      where e.invoice_id = s.id
        and (e.reminder_step = step.day or e.created_at > now() - interval '3 days'));
$$;

revoke execute on function public.due_reminders() from public, anon, authenticated;
grant execute on function public.due_reminders() to service_role;

create function public.log_automatic_reminder(
  p_invoice_id uuid,
  p_step int,
  p_to text,
  p_cc text[],
  p_subject text,
  p_provider_message_id text default null
) returns boolean
language plpgsql security invoker set search_path = public as $$
declare
  inv public.invoices;
  v_id uuid;
begin
  select * into inv from public.invoices where id = p_invoice_id;
  if not found then
    raise exception 'invoice % not found', p_invoice_id using errcode = 'no_data_found';
  end if;

  insert into public.invoice_emails (owner_id, invoice_id, kind, to_email, cc_emails, subject, provider_message_id, reminder_step)
  values (inv.owner_id, inv.id, 'reminder', p_to, coalesce(p_cc, '{}'), p_subject, p_provider_message_id, p_step)
  on conflict (invoice_id, reminder_step) where reminder_step is not null do nothing
  returning id into v_id;
  return v_id is not null;
end;
$$;

revoke execute on function public.log_automatic_reminder(uuid, int, text, text[], text, text) from public, anon, authenticated;
grant execute on function public.log_automatic_reminder(uuid, int, text, text[], text, text) to service_role;

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
