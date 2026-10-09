-- M5: pay by card with Stripe Checkout.
--
-- The shared invoice page (/i/<token>) asks the create-checkout Edge Function for
-- a Checkout Session covering the current balance. Stripe then calls the
-- stripe-webhook Edge Function, which records the payment with
-- record_stripe_payment. Both functions run with the service role; neither RPC is
-- callable from the browser.
--
-- Idempotency: payments.provider_ref (the PaymentIntent id) is unique, so a
-- replayed or concurrently redelivered webhook never records a second payment.

-- What a Checkout Session needs for a shared invoice: null unless it is issued
-- and still has a balance.
create function public.prepare_checkout(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'invoice_id', s.id,
    'number', s.number,
    'currency', s.currency,
    'balance_minor', s.balance_minor,
    'client_email', s.bill_to ->> 'email',
    'business_name', s.bill_from ->> 'business_name')
  from public.invoice_summary s
  where p_token is not null and s.public_token = p_token
    and s.lifecycle = 'issued' and s.balance_minor > 0;
$$;

-- Records a completed Checkout payment once per PaymentIntent. A replay returns
-- the existing payment with duplicate = true. Money Stripe has already taken is
-- recorded even if it exceeds the balance (e.g. two tabs paid at once), so the
-- books match the bank; the owner refunds the difference.
create function public.record_stripe_payment(
  p_invoice_id uuid,
  p_amount_minor bigint,
  p_currency text,
  p_provider_ref text,
  p_payload jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  inv public.invoices;
  v_payment public.payments;
begin
  if p_provider_ref is null or length(trim(p_provider_ref)) = 0 then
    raise exception 'provider_ref is required' using errcode = 'not_null_violation';
  end if;

  -- Serializes concurrent deliveries for the same invoice.
  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'invoice % not found', p_invoice_id using errcode = 'no_data_found';
  end if;

  insert into public.payments (
    owner_id, invoice_id, amount_minor, currency, paid_on, method, reference, note,
    source, status, provider_ref, provider_payload)
  values (
    inv.owner_id, inv.id, p_amount_minor, upper(p_currency), public.owner_today(inv.owner_id), 'card',
    p_provider_ref, 'Paid online (Stripe)', 'stripe', 'succeeded', p_provider_ref, p_payload)
  on conflict (provider_ref) where provider_ref is not null do nothing
  returning * into v_payment;

  if v_payment.id is not null then
    return jsonb_build_object('payment_id', v_payment.id, 'duplicate', false);
  end if;

  select * into v_payment from public.payments where provider_ref = p_provider_ref;
  return jsonb_build_object('payment_id', v_payment.id, 'duplicate', true);
end;
$$;

revoke execute on function
  public.prepare_checkout(uuid),
  public.record_stripe_payment(uuid, bigint, text, text, jsonb)
from public, anon, authenticated;
grant execute on function
  public.prepare_checkout(uuid),
  public.record_stripe_payment(uuid, bigint, text, text, jsonb)
to service_role;
