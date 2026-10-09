-- Supabase security advisor: pin search_path on every function so a caller
-- can't shadow public objects; index the remaining unindexed foreign key.

alter function public.set_updated_at() set search_path = public;
alter function public.lifecycle_change_allowed() set search_path = public;
alter function public.guard_invoice_sequence() set search_path = public;
alter function public.owner_today(uuid) set search_path = public;
alter function public.guard_invoice_client() set search_path = public;
alter function public.guard_invoice_mutation() set search_path = public;
alter function public.recompute_invoice_totals(uuid) set search_path = public;
alter function public.guard_line_item() set search_path = public;
alter function public.line_items_changed() set search_path = public;
alter function public.invoice_tax_rate_changed() set search_path = public;
alter function public.guard_payment() set search_path = public;
alter function public.has_succeeded_payments(uuid) set search_path = public;

create index if not exists line_items_owner_idx on public.invoice_line_items (owner_id);
