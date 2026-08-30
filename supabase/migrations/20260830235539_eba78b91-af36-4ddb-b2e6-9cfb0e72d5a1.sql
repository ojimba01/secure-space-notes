-- A Housing Stabilization Plan on file means the plan was submitted.

update public.clients c
   set hsp_submitted = true
 where c.deleted_at is null
   and c.hsp_submitted is distinct from true
   and exists (
     select 1 from public.client_forms f
      where f.client_id = c.id
        and f.form_type = 'Housing Stabilization Plan (HSP)'
   );

create or replace function public.mark_hsp_submitted_on_file()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.form_type = 'Housing Stabilization Plan (HSP)' and new.client_id is not null then
    update public.clients
       set hsp_submitted = true
     where id = new.client_id
       and hsp_submitted is distinct from true;
  end if;
  return new;
end;
$$;

drop trigger if exists mark_hsp_submitted_on_file on public.client_forms;

create trigger mark_hsp_submitted_on_file
  after insert on public.client_forms
  for each row execute function public.mark_hsp_submitted_on_file();

select
  (select count(*) from public.clients c
    where c.deleted_at is null and c.hsp_submitted is distinct from true
      and exists (select 1 from public.client_forms f
                   where f.client_id = c.id
                     and f.form_type = 'Housing Stabilization Plan (HSP)')) as still_disagreeing,
  (select count(*) from pg_trigger where tgname = 'mark_hsp_submitted_on_file') as trigger_present,
  (select count(*) from public.clients where deleted_at is null and hsp_submitted is true) as submitted_now;