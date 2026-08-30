-- A Housing Stabilization Plan on file means the plan was submitted.
--
-- NOT YET APPLIED.
--
-- Misky, 2026-08-30: a filed HSP should count as submitted everywhere.
--
-- Fifteen clients showed a completed HSP on their own Forms tab and sat in the
-- dashboard as though they had none. Three things say the plan went in: the
-- flag, a 150 or 180-day authorization number, or the plan itself filed on the
-- client. Only the first two were known outside the dashboard.
--
-- Done here rather than in hspSubmitted() because that function is given a
-- client row and has no documents to look at. Seven screens call it, directly
-- or through isSetupComplete, and threading a document list through all of
-- them would leave any screen that forgot disagreeing with the rest. The flag
-- is what they all already read.
--
-- Deleting the last HSP does not set it back. Submission is something that
-- happened; removing a copy of the paperwork does not unhappen it.

-- 1. The fifteen that are already true --------------------------------------
update public.clients c
   set hsp_submitted = true
 where c.deleted_at is null
   and c.hsp_submitted is distinct from true
   and exists (
     select 1 from public.client_forms f
      where f.client_id = c.id
        and f.form_type = 'Housing Stabilization Plan (HSP)'
   );

-- 2. And every one filed from now on ----------------------------------------
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

-- Expect: still_disagreeing = 0, trigger_present = 1.
select
  (select count(*) from public.clients c
    where c.deleted_at is null and c.hsp_submitted is distinct from true
      and exists (select 1 from public.client_forms f
                   where f.client_id = c.id
                     and f.form_type = 'Housing Stabilization Plan (HSP)')) as still_disagreeing,
  (select count(*) from pg_trigger where tgname = 'mark_hsp_submitted_on_file') as trigger_present,
  (select count(*) from public.clients where deleted_at is null and hsp_submitted is true) as submitted_now;
