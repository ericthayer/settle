-- M2: save a draft (header + line items) atomically, and stop numbered drafts being deleted.

-- One call per autosave: header fields and the full line list in a single transaction,
-- so the totals trigger never sees a half-written invoice.
create function public.save_invoice_draft(p_invoice_id uuid, p_invoice jsonb, p_lines jsonb)
returns public.invoices
language plpgsql security invoker set search_path = public as $$
declare
  inv public.invoices;
begin
  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'invoice % not found', p_invoice_id using errcode = 'no_data_found';
  end if;
  if inv.lifecycle <> 'draft' then
    raise exception 'invoice % is % and cannot be edited', inv.number, inv.lifecycle using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'p_lines must be a JSON array' using errcode = 'invalid_parameter_value';
  end if;

  update public.invoices set
    client_id = (p_invoice ->> 'client_id')::uuid,
    currency = p_invoice ->> 'currency',
    tax_rate_bps = (p_invoice ->> 'tax_rate_bps')::int,
    issue_date = (p_invoice ->> 'issue_date')::date,
    due_date = (p_invoice ->> 'due_date')::date,
    notes = nullif(trim(p_invoice ->> 'notes'), ''),
    payment_instructions = nullif(trim(p_invoice ->> 'payment_instructions'), '')
  where id = inv.id;

  delete from public.invoice_line_items where invoice_id = inv.id;
  insert into public.invoice_line_items (invoice_id, position, description, quantity, unit_price_minor, taxable)
  select inv.id, (l.ord - 1)::int, trim(l.item ->> 'description'), (l.item ->> 'quantity')::numeric,
         (l.item ->> 'unit_price_minor')::bigint, coalesce((l.item ->> 'taxable')::boolean, true)
  from jsonb_array_elements(p_lines) with ordinality as l(item, ord);

  select * into inv from public.invoices where id = inv.id;
  return inv;
end;
$$;

revoke execute on function public.save_invoice_draft(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_invoice_draft(uuid, jsonb, jsonb) to authenticated;

-- A reverted draft keeps its number; deleting it would leave a gap in the sequence.
drop policy invoices_owner_delete_drafts on public.invoices;
create policy invoices_owner_delete_drafts on public.invoices for delete to authenticated
  using (owner_id = (select auth.uid()) and lifecycle = 'draft' and number is null);
