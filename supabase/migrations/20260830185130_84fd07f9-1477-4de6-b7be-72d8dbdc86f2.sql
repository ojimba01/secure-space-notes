alter table public.clients
  add column if not exists hsp_submitted_at timestamptz;

create or replace function public.stamp_hsp_submitted()
returns trigger
language plpgsql
as $$
begin
  if new.hsp_submitted is true
     and (tg_op = 'INSERT' or old.hsp_submitted is distinct from true)
     and new.hsp_submitted_at is null then
    new.hsp_submitted_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists stamp_hsp_submitted on public.clients;
create trigger stamp_hsp_submitted
  before insert or update on public.clients
  for each row execute function public.stamp_hsp_submitted();

alter table public.profiles
  add column if not exists touchpoint_go_live_date date,
  add column if not exists touchpoint_tutorial_acknowledged_at timestamptz;

comment on column public.profiles.touchpoint_go_live_date is
  'The day this person''s touchpoints begin to count. Null means not yet started. Set by an administrator.';
comment on column public.profiles.touchpoint_tutorial_acknowledged_at is
  'When this person confirmed they have been shown how touchpoints work. Set by them, once.';

select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='clients' and column_name='hsp_submitted_at') as hsp_submitted_at,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='touchpoint_go_live_date') as go_live,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='touchpoint_tutorial_acknowledged_at') as acknowledged,
  (select count(*) from pg_trigger where tgname='stamp_hsp_submitted') as trigger_present,
  (select count(*) from public.clients where hsp_submitted is true and hsp_submitted_at is null) as already_submitted;