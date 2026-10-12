-- Automatic reminders: which sent, unpaid invoices are due a reminder today, and logging each step once.
\set ON_ERROR_STOP 1

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'reminds@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'quiet@example.com');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into public.business_settings (business_name, timezone, auto_reminders) values ('Reminds Co', 'UTC', true);
insert into public.clients (id, name, email) values ('a0000000-0000-0000-0000-000000000001', 'Payer', 'ap@example.com');

-- An issued, emailed invoice for $100, due p_due_in days from today (negative = overdue).
create function pg_temp.sent_invoice(p_id uuid, p_due_in int) returns void language plpgsql as $$
begin
  insert into public.invoices (id, client_id, currency, due_date) values (p_id, 'a0000000-0000-0000-0000-000000000001', 'USD', current_date + p_due_in);
  insert into public.invoice_line_items (invoice_id, position, description, quantity, unit_price_minor) values (p_id, 0, 'Work', 1, 10000);
  perform public.issue_invoice(p_id, current_date - 90);
  perform public.log_invoice_email(p_id, 'invoice', 'ap@example.com', '{}', 'Invoice', null);
end;
$$;
grant execute on function pg_temp.sent_invoice(uuid, int) to authenticated;

select pg_temp.sent_invoice('a1000000-0000-0000-0000-000000000001', -1);

-- The invoice emails above went out "now"; age them past the 3-day quiet period.
reset role;
update public.invoice_emails set created_at = now() - interval '10 days';

set role service_role;
do $$ begin
  assert (select reminder_step from public.due_reminders() where invoice_id = 'a1000000-0000-0000-0000-000000000001') = 1,
    'one day overdue is due the +1 reminder';
end $$;

-- Each step is logged once; a logged step is no longer due.
do $$ begin
  assert public.log_automatic_reminder('a1000000-0000-0000-0000-000000000001', 1, 'ap@example.com', '{}', 'Reminder', 'msg_a1'),
    'first log of a step records it';
  assert not public.log_automatic_reminder('a1000000-0000-0000-0000-000000000001', 1, 'ap@example.com', '{}', 'Reminder', 'msg_a1b'),
    'a repeated step is not logged twice';
end $$;
reset role;
update public.invoice_emails set created_at = now() - interval '10 days';
set role service_role;
do $$ begin
  assert not exists (select 1 from public.due_reminders() where invoice_id = 'a1000000-0000-0000-0000-000000000001'),
    'a step already sent is not due again';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.invoice_emails
          where invoice_id = 'a1000000-0000-0000-0000-000000000001' and kind = 'reminder' and reminder_step = 1) = 1;
  assert (select owner_id from public.invoice_emails where provider_message_id = 'msg_a1') = '00000000-0000-0000-0000-0000000000a1',
    'logged under the invoice owner';
end $$;

-- Quiet period: nothing automatic within 3 days of any email for the invoice.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.sent_invoice('a1000000-0000-0000-0000-000000000002', -7);
set role service_role;
do $$ begin
  assert not exists (select 1 from public.due_reminders() where invoice_id = 'a1000000-0000-0000-0000-000000000002'),
    'an invoice emailed today gets no automatic reminder';
end $$;
reset role;
update public.invoice_emails set created_at = now() - interval '2 days 23 hours' where invoice_id = 'a1000000-0000-0000-0000-000000000002';
set role service_role;
do $$ begin
  assert not exists (select 1 from public.due_reminders() where invoice_id = 'a1000000-0000-0000-0000-000000000002'),
    'still quiet just under 3 days after the last email';
end $$;
reset role;
update public.invoice_emails set created_at = now() - interval '3 days 1 minute' where invoice_id = 'a1000000-0000-0000-0000-000000000002';
set role service_role;
do $$ begin
  assert (select reminder_step from public.due_reminders() where invoice_id = 'a1000000-0000-0000-0000-000000000002') = 7,
    'after the quiet period the latest step reached is due, earlier ones are skipped';
end $$;
reset role;

-- Schedule edges, aged past the quiet period: 3 days before due, not 4; nothing after the +30 reminder.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.sent_invoice('a1000000-0000-0000-0000-000000000003', 3);
select pg_temp.sent_invoice('a1000000-0000-0000-0000-000000000004', 4);
select pg_temp.sent_invoice('a1000000-0000-0000-0000-000000000005', -45);
-- Not emailed yet: issued only.
insert into public.invoices (id, client_id, currency, due_date) values ('a1000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'USD', current_date - 10);
insert into public.invoice_line_items (invoice_id, position, description, quantity, unit_price_minor) values ('a1000000-0000-0000-0000-000000000006', 0, 'Work', 1, 10000);
select public.issue_invoice('a1000000-0000-0000-0000-000000000006', current_date - 90);
-- Paid in full, and voided.
select pg_temp.sent_invoice('a1000000-0000-0000-0000-000000000007', -10);
select public.record_payment('a1000000-0000-0000-0000-000000000007', 10000, current_date, 'ach', null, null);
select pg_temp.sent_invoice('a1000000-0000-0000-0000-000000000008', -10);
select public.void_invoice('a1000000-0000-0000-0000-000000000008', 'Cancelled');
-- Partly paid still gets reminded.
select pg_temp.sent_invoice('a1000000-0000-0000-0000-000000000009', -10);
select public.record_payment('a1000000-0000-0000-0000-000000000009', 4000, current_date, 'ach', null, null);

-- An owner who hasn't turned automatic reminders on.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
insert into public.business_settings (business_name, timezone) values ('Quiet Co', 'UTC');
insert into public.clients (id, name, email) values ('a0000000-0000-0000-0000-000000000002', 'Payer', 'ap@example.com');
insert into public.invoices (id, client_id, currency, due_date) values ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'USD', current_date - 10);
insert into public.invoice_line_items (invoice_id, position, description, quantity, unit_price_minor) values ('a2000000-0000-0000-0000-000000000001', 0, 'Work', 1, 10000);
select public.issue_invoice('a2000000-0000-0000-0000-000000000001', current_date - 90);
select public.log_invoice_email('a2000000-0000-0000-0000-000000000001', 'invoice', 'ap@example.com', '{}', 'Invoice', null);

reset role;
update public.invoice_emails set created_at = now() - interval '10 days' where invoice_id <> 'a1000000-0000-0000-0000-000000000002';
set role service_role;
create temp table due as select * from public.due_reminders();
do $$ begin
  assert (select reminder_step from due where invoice_id = 'a1000000-0000-0000-0000-000000000003') = -3, 'due in 3 days gets the early reminder';
  assert not exists (select 1 from due where invoice_id = 'a1000000-0000-0000-0000-000000000004'), 'due in 4 days: nothing yet';
  assert (select reminder_step from due where invoice_id = 'a1000000-0000-0000-0000-000000000005') = 30, '45 days late: the +30 reminder';
  assert not exists (select 1 from due where invoice_id = 'a1000000-0000-0000-0000-000000000006'), 'never emailed: no reminder';
  assert not exists (select 1 from due where invoice_id = 'a1000000-0000-0000-0000-000000000007'), 'paid: no reminder';
  assert not exists (select 1 from due where invoice_id = 'a1000000-0000-0000-0000-000000000008'), 'void: no reminder';
  assert (select reminder_step from due where invoice_id = 'a1000000-0000-0000-0000-000000000009') = 7, 'partly paid: still reminded';
  assert not exists (select 1 from due where invoice_id = 'a2000000-0000-0000-0000-000000000001'), 'owner opted out: no reminder';
end $$;
select public.log_automatic_reminder('a1000000-0000-0000-0000-000000000005', 30, 'ap@example.com', '{}', 'Reminder', null);
reset role;
update public.invoice_emails set created_at = now() - interval '10 days';
set role service_role;
do $$ begin
  assert not exists (select 1 from public.due_reminders() where invoice_id = 'a1000000-0000-0000-0000-000000000005'),
    'the schedule ends after the +30 reminder';
end $$;

-- Only the service role runs the schedule.
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  begin
    perform public.due_reminders();
    raise exception 'authenticated must not run due_reminders';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.log_automatic_reminder('a1000000-0000-0000-0000-000000000003', -3, 'x@example.com', '{}', 'x', null);
    raise exception 'authenticated must not log automatic reminders';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- The daily job's credential: a random secret the migration stored in Vault.
do $$ begin
  assert (select count(*) from vault.decrypted_secrets where name = 'reminder_cron_secret') = 1, 'migration creates the secret';
  assert length((select decrypted_secret from vault.decrypted_secrets where name = 'reminder_cron_secret')) >= 32;
end $$;
create temp table cron_secret as select decrypted_secret as s from vault.decrypted_secrets where name = 'reminder_cron_secret';
grant select on cron_secret to service_role;
set role service_role;
do $$ begin
  assert public.reminder_cron_secret_matches((select s from cron_secret)), 'the stored secret matches';
  assert not public.reminder_cron_secret_matches((select s from cron_secret) || 'x'), 'anything else does not';
  assert not public.reminder_cron_secret_matches(''), 'empty does not match';
  assert not public.reminder_cron_secret_matches(null), 'null does not match';
end $$;
reset role;
