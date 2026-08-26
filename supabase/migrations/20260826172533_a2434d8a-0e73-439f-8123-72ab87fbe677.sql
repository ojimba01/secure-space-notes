REVOKE EXECUTE ON FUNCTION public.sync_client_billing_cycles(uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.sync_client_billing_cycles_authorized(p_client_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is not null
     and not public.is_admin(auth.uid())
     and not public.is_assigned_to_client(auth.uid(), p_client_id) then
    raise exception 'Not permitted to regenerate billing cycles for this client';
  end if;
  return public.sync_client_billing_cycles(p_client_id);
end;
$function$;

REVOKE ALL ON FUNCTION public.sync_client_billing_cycles_authorized(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_client_billing_cycles_authorized(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_client_billing_cycles_authorized(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_client_billing_cycles_authorized(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.sync_client_billing_cycles(uuid) FROM authenticated;