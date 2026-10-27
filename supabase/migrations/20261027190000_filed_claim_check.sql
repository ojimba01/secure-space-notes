-- Whether a filed claim stands behind any of these authorization phases, for
-- the client's current round. Removing an authorization date is refused when
-- one does, and case managers (who cannot read billing) remove dates too, so
-- the check runs here. Returns the first phase with a filed claim, or null.
create or replace function public.filed_claim_phase(p_client_id uuid, p_phases text[])
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select b.phase
  from public.billing_cycles b
  join public.clients c on c.id = b.client_id
  where b.client_id = p_client_id
    and b.round = coalesce(c.billing_round, 1)
    and b.phase = any(p_phases)
    and (b.billing_status = 'Submitted' or b.payment_status = 'Paid' or b.claim_number is not null)
    and (public.is_admin(auth.uid()) or public.is_assigned_to_client(auth.uid(), p_client_id))
  limit 1;
$$;

grant execute on function public.filed_claim_phase(uuid, text[]) to authenticated;
